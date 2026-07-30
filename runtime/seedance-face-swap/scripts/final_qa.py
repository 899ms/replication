#!/usr/bin/env python3
"""QA a generated Seedance face-swap MP4 with ffprobe and optional contact sheet."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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


def load_json(path: Path | None) -> dict[str, Any]:
    if not path:
        return {}
    try:
        return json.loads(path.expanduser().read_text(encoding="utf-8"))
    except Exception as exc:
        return {"_load_error": str(exc), "_path": str(path)}


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
    data = json.loads(proc.stdout)
    data["ok"] = True
    return data


def create_contact_sheet(path: Path, output: Path) -> dict[str, Any]:
    binary = resolve_binary("ffmpeg")
    if not binary:
        return {"ok": False, "error": "ffmpeg not found"}
    cmd = [
        binary,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(path),
        "-vf",
        "select='eq(n,25)+eq(n,175)+eq(n,325)',scale=300:-1,tile=3x1",
        "-frames:v",
        "1",
        str(output),
    ]
    proc = subprocess.run(cmd, text=True, capture_output=True, check=False)
    if proc.returncode != 0:
        return {"ok": False, "error": proc.stderr.strip(), "path": str(output)}
    return {"ok": output.exists() and output.stat().st_size > 0, "path": str(output), "size_bytes": output.stat().st_size if output.exists() else 0}


def inspect_video(path: Path, expected_duration: float | None, tolerance: float, require_audio: bool) -> dict[str, Any]:
    exists = path.exists()
    item: dict[str, Any] = {
        "path": str(path),
        "exists": exists,
        "is_file": path.is_file() if exists else False,
        "size_bytes": path.stat().st_size if exists and path.is_file() else 0,
        "ok": False,
        "checks": {},
    }
    if not exists or not path.is_file():
        item["checks"]["file_exists"] = False
        return item
    meta = ffprobe(path)
    item["ffprobe"] = meta
    if not meta.get("ok"):
        item["checks"]["probe_ok"] = False
        return item
    streams = meta.get("streams", [])
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    has_audio_stream = bool(audio_streams)
    duration = float(meta.get("format", {}).get("duration") or 0)
    width = int(video_streams[0].get("width") or 0) if video_streams else 0
    height = int(video_streams[0].get("height") or 0) if video_streams else 0
    duration_ok = True
    if expected_duration:
        duration_ok = (expected_duration - tolerance) <= duration <= (expected_duration + tolerance)
    checks = {
        "file_exists": True,
        "nonzero_file": item["size_bytes"] > 0,
        "probe_ok": True,
        "has_video": bool(video_streams),
        "has_dimensions": width > 0 and height > 0,
        "audio_requirement_satisfied": has_audio_stream if require_audio else True,
        "duration_in_range": duration_ok,
    }
    item.update(
        {
            "duration_seconds": duration,
            "width": width,
            "height": height,
            "has_audio_stream": has_audio_stream,
            "checks": checks,
            "ok": all(checks.values()),
        }
    )
    return item


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, required=True)
    parser.add_argument("--contract", type=Path)
    parser.add_argument("--output", type=Path, default=Path("final_report.json"))
    parser.add_argument("--expected-duration", type=float)
    parser.add_argument("--duration-tolerance", type=float, default=3.5)
    parser.add_argument("--no-require-audio", action="store_true")
    parser.add_argument("--make-contact-sheet", action="store_true")
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    contract = load_json(args.contract)
    expected_duration = args.expected_duration
    if expected_duration is None:
        generation = contract.get("generation") if isinstance(contract, dict) else {}
        if isinstance(generation, dict) and generation.get("duration"):
            expected_duration = float(generation["duration"])
    output = args.output.expanduser()
    video = args.video.expanduser()
    item = inspect_video(video, expected_duration, args.duration_tolerance, not args.no_require_audio)
    contact_sheet = None
    if args.make_contact_sheet:
        sheet_path = output.parent / "contact_sheet.jpg"
        contact_sheet = create_contact_sheet(video, sheet_path)

    report = {
        "schema_version": "seedance-face-swap.final_report.v1",
        "created_at": utc_now(),
        "ok": bool(item.get("ok")) and (contact_sheet is None or bool(contact_sheet.get("ok"))),
        "video": item,
        "contract_path": str(args.contract) if args.contract else "",
        "contact_sheet": contact_sheet,
        "manual_visual_checks_required": [
            "target identity from person_image remains stable in every shot",
            "original source-video face does not return",
            "mouth movement matches spoken script or audio intent",
            "no newly added subtitles, captions, platform UI, watermark, or readable text; preserve existing source text/UI when required",
            "hands, face, and expression quality are acceptable for delivery",
        ],
    }
    write_json(output, report)
    print(json.dumps({"ok": report["ok"], "output": str(output), "contact_sheet": contact_sheet}, ensure_ascii=False))
    return 0 if report["ok"] or not args.strict else 1


if __name__ == "__main__":
    raise SystemExit(main())
