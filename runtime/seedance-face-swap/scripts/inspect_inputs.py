#!/usr/bin/env python3
"""Inspect Seedance face-swap input assets and write inspection_report.json."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import struct
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"}
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
AUDIO_SUFFIXES = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}


def resolve_binary(name: str) -> str | None:
    explicit = os.environ.get(f"REPLICATION_{name.upper()}")
    candidates = [
        explicit,
        f"/opt/homebrew/bin/{name}",
        f"/usr/local/bin/{name}",
        f"/usr/bin/{name}",
        shutil.which(name),
    ]
    return next((candidate for candidate in candidates if candidate and Path(candidate).exists()), None)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def file_state(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {"provided": False}
    expanded = path.expanduser()
    exists = expanded.exists()
    is_file = expanded.is_file() if exists else False
    size = expanded.stat().st_size if is_file else 0
    return {
        "provided": True,
        "path": str(expanded.resolve()) if exists else str(expanded),
        "exists": exists,
        "is_file": is_file,
        "size_bytes": size,
        "suffix": expanded.suffix.lower(),
    }


def ffprobe(path: Path) -> dict[str, Any]:
    binary = resolve_binary("ffprobe")
    if not binary:
        return {"ok": False, "error": "ffprobe not found"}
    cmd = [
        binary,
        "-v",
        "error",
        "-show_entries",
        "format=duration,size:stream=index,codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels",
        "-of",
        "json",
        str(path),
    ]
    proc = subprocess.run(cmd, text=True, capture_output=True, check=False)
    if proc.returncode != 0:
        return {"ok": False, "error": proc.stderr.strip()}
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": f"ffprobe JSON parse failed: {exc}"}
    data["ok"] = True
    return data


def png_dimensions(data: bytes) -> tuple[int, int] | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width, height = struct.unpack(">II", data[16:24])
        return int(width), int(height)
    return None


def webp_dimensions(data: bytes) -> tuple[int, int] | None:
    if len(data) < 30 or not (data[:4] == b"RIFF" and data[8:12] == b"WEBP"):
        return None
    chunk = data[12:16]
    if chunk == b"VP8 " and len(data) >= 30:
        width = data[26] | ((data[27] & 0x3F) << 8)
        height = data[28] | ((data[29] & 0x3F) << 8)
        return int(width), int(height)
    if chunk == b"VP8L" and len(data) >= 25:
        bits = int.from_bytes(data[21:25], "little")
        width = (bits & 0x3FFF) + 1
        height = ((bits >> 14) & 0x3FFF) + 1
        return int(width), int(height)
    if chunk == b"VP8X" and len(data) >= 30:
        width = int.from_bytes(data[24:27], "little") + 1
        height = int.from_bytes(data[27:30], "little") + 1
        return int(width), int(height)
    return None


def jpeg_dimensions(data: bytes) -> tuple[int, int] | None:
    if not data.startswith(b"\xff\xd8"):
        return None
    pos = 2
    while pos + 9 < len(data):
        if data[pos] != 0xFF:
            pos += 1
            continue
        marker = data[pos + 1]
        pos += 2
        if marker in {0xD8, 0xD9}:
            continue
        if pos + 2 > len(data):
            return None
        length = int.from_bytes(data[pos : pos + 2], "big")
        if length < 2 or pos + length > len(data):
            return None
        if marker in {
            0xC0,
            0xC1,
            0xC2,
            0xC3,
            0xC5,
            0xC6,
            0xC7,
            0xC9,
            0xCA,
            0xCB,
            0xCD,
            0xCE,
            0xCF,
        }:
            height = int.from_bytes(data[pos + 3 : pos + 5], "big")
            width = int.from_bytes(data[pos + 5 : pos + 7], "big")
            return int(width), int(height)
        pos += length
    return None


def image_dimensions(path: Path) -> tuple[int, int] | None:
    data = path.read_bytes()[:512 * 1024]
    return png_dimensions(data) or jpeg_dimensions(data) or webp_dimensions(data)


def inspect_image(path: Path) -> dict[str, Any]:
    state = file_state(path)
    if not state.get("exists") or not state.get("is_file") or state.get("size_bytes", 0) <= 0:
        return {**state, "ok": False}
    dimensions = image_dimensions(path)
    result = {**state, "ok": dimensions is not None}
    if dimensions:
        width, height = dimensions
        result.update({"width": width, "height": height, "min_side": min(width, height)})
    else:
        result["error"] = "could not read image dimensions"
    return result


def inspect_media(path: Path, expected: str) -> dict[str, Any]:
    state = file_state(path)
    if not state.get("exists") or not state.get("is_file") or state.get("size_bytes", 0) <= 0:
        return {**state, "ok": False}
    meta = ffprobe(path)
    result = {**state, "ffprobe": meta, "ok": False}
    if not meta.get("ok"):
        return result
    streams = meta.get("streams", [])
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    duration = float(meta.get("format", {}).get("duration") or 0)
    result.update(
        {
            "duration_seconds": duration,
            "has_video": bool(video_streams),
            "has_audio": bool(audio_streams),
        }
    )
    if video_streams:
        result.update(
            {
                "width": int(video_streams[0].get("width") or 0),
                "height": int(video_streams[0].get("height") or 0),
                "video_codec": video_streams[0].get("codec_name"),
            }
        )
    if audio_streams:
        result.update(
            {
                "audio_codec": audio_streams[0].get("codec_name"),
                "audio_channels": audio_streams[0].get("channels"),
            }
        )
    result["ok"] = bool(video_streams) if expected == "video" else bool(audio_streams)
    return result


def add_basic_findings(label: str, state: dict[str, Any], required: bool, allowed_suffixes: set[str], hard_stops: list[str], warnings: list[str]) -> None:
    if not state.get("provided"):
        if required:
            hard_stops.append(f"{label} is required but was not provided.")
        return
    path = state.get("path", label)
    suffix = str(state.get("suffix") or "").lower()
    if not state.get("exists"):
        hard_stops.append(f"{label} does not exist: {path}")
    elif not state.get("is_file"):
        hard_stops.append(f"{label} is not a file: {path}")
    elif int(state.get("size_bytes") or 0) <= 0:
        hard_stops.append(f"{label} is empty: {path}")
    if suffix and suffix not in allowed_suffixes:
        warnings.append(f"{label} suffix is unusual for this role: {path}")
    if state.get("provided") and state.get("exists") and not state.get("ok", True):
        hard_stops.append(f"{label} could not be validated: {path}")


def build_report(args: argparse.Namespace) -> dict[str, Any]:
    hard_stops: list[str] = []
    warnings: list[str] = []
    checks: dict[str, Any] = {}

    reference_video = inspect_media(args.reference_video.expanduser(), "video") if args.reference_video else file_state(None)
    person_image = inspect_image(args.person_image.expanduser()) if args.person_image else file_state(None)
    talking_video = inspect_media(args.talking_video.expanduser(), "video") if args.talking_video else file_state(None)
    audio_reference = inspect_media(args.audio_reference.expanduser(), "audio") if args.audio_reference else file_state(None)

    add_basic_findings("reference_video", reference_video, True, VIDEO_SUFFIXES, hard_stops, warnings)
    add_basic_findings("person_image", person_image, True, IMAGE_SUFFIXES, hard_stops, warnings)
    add_basic_findings("talking_video", talking_video, False, VIDEO_SUFFIXES, hard_stops, warnings)
    add_basic_findings("audio_reference", audio_reference, False, AUDIO_SUFFIXES, hard_stops, warnings)

    if reference_video.get("duration_seconds", 0) and reference_video["duration_seconds"] > args.max_reference_seconds:
        warnings.append(f"reference_video is long ({reference_video['duration_seconds']:.1f}s); consider segmenting before Seedance generation.")
    if person_image.get("min_side", 0) and person_image["min_side"] < args.min_person_image_side:
        warnings.append(f"person_image min side is {person_image['min_side']}px; clearer identity references usually work better.")
    if talking_video.get("provided") and talking_video.get("exists") and not talking_video.get("has_audio"):
        warnings.append("talking_video has no audio stream; it can still guide mouth/expression motion but not voice.")
    if args.require_talking_reference and not (args.talking_video or args.audio_reference):
        hard_stops.append("A talking_video or audio_reference is required by --require-talking-reference.")

    checks["reference_video"] = reference_video
    checks["person_image"] = person_image
    checks["talking_video"] = talking_video
    checks["audio_reference"] = audio_reference

    return {
        "schema_version": "seedance-face-swap.inspection_report.v1",
        "created_at": utc_now(),
        "status": "blocked" if hard_stops else "ready",
        "checks": checks,
        "warnings": warnings,
        "hard_stops": hard_stops,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference-video", type=Path, required=True)
    parser.add_argument("--person-image", type=Path, required=True)
    parser.add_argument("--talking-video", type=Path)
    parser.add_argument("--audio-reference", type=Path)
    parser.add_argument("--require-talking-reference", action="store_true")
    parser.add_argument("--min-person-image-side", type=int, default=512)
    parser.add_argument("--max-reference-seconds", type=float, default=120.0)
    parser.add_argument("--output", type=Path, default=Path("inspection_report.json"))
    args = parser.parse_args()

    report = build_report(args)
    write_json(args.output, report)
    print(json.dumps({"ok": report["status"] == "ready", "output": str(args.output), "warnings": report["warnings"], "hard_stops": report["hard_stops"]}, ensure_ascii=False))
    return 0 if report["status"] == "ready" else 2


if __name__ == "__main__":
    raise SystemExit(main())
