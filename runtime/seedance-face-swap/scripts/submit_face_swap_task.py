#!/usr/bin/env python3
"""Submit one Seedance face-swap task from request_contract.json after explicit authorization."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


RUNTIME_CLIENT = Path(__file__).with_name("kuaizi_runtime.py")
DEFAULT_MODEL = "doubao-seedance-2-0-260128"
DEFAULT_BASE_API = "https://aiopenapi.kuaizi.cn/ai-open-platform-api/api/v3"


def load_runner() -> Any:
    spec = importlib.util.spec_from_file_location("replication_kuaizi_runtime", RUNTIME_CLIENT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load packaged Kuaizi runtime: {RUNTIME_CLIENT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.expanduser().read_text(encoding="utf-8"))


def append_event(manifest: dict[str, Any], phase: str, **data: Any) -> None:
    manifest.setdefault("events", []).append({"at": utc_now(), "phase": phase, **data})


def pick(obj: Any, names: list[str]) -> str | None:
    if isinstance(obj, dict):
        for name in names:
            value = obj.get(name)
            if isinstance(value, str) and value:
                return value
        for value in obj.values():
            found = pick(value, names)
            if found:
                return found
    elif isinstance(obj, list):
        for value in obj:
            found = pick(value, names)
            if found:
                return found
    return None


def redact(obj: Any) -> Any:
    if isinstance(obj, dict):
        out = {}
        for key, value in obj.items():
            lower = key.lower()
            if any(token in lower for token in ["token", "key", "secret", "password", "authorization"]):
                out[key] = "<redacted>"
            elif lower in {"url", "download_url", "downloadurl", "upload_url", "uploadurl"} and isinstance(value, str):
                out[key] = "<redacted_url>"
            else:
                out[key] = redact(value)
        return out
    if isinstance(obj, list):
        return [redact(value) for value in obj]
    return obj


def endpoint_url(runner: Any) -> str:
    explicit = os.environ.get("SEEDANCE_TASKS_ENDPOINT")
    if explicit:
        return explicit
    base = os.environ.get("SEEDANCE_API_BASE") or getattr(runner, "BASE_API", DEFAULT_BASE_API)
    return base.rstrip("/") + "/contents/generations/tasks"


def task_status_url(task_endpoint: str, task_id: str) -> str:
    return task_endpoint.rstrip("/") + "/" + task_id


def clean_id(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", value).strip("_").lower() or "face_swap"


def resolve_path(raw: str | None) -> Path | None:
    if not raw:
        return None
    return Path(raw).expanduser().resolve()


def contract_paths(contract: dict[str, Any]) -> dict[str, Path | None]:
    paths = contract.get("input_paths", {})
    if not isinstance(paths, dict):
        paths = {}
    return {
        "reference_video": resolve_path(paths.get("reference_video")),
        "person_image": resolve_path(paths.get("person_image")),
        "talking_video": resolve_path(paths.get("talking_video")),
        "audio_reference": resolve_path(paths.get("audio_reference")),
        "final_prompt_file": resolve_path(paths.get("final_prompt_file")),
    }


def file_ready(path: Path | None) -> bool:
    return bool(path and path.exists() and path.is_file() and path.stat().st_size > 0)


def preflight(contract: dict[str, Any], paths: dict[str, Path | None], out_dir: Path, args: argparse.Namespace) -> list[str]:
    hard_stops: list[str] = []
    for key in ["reference_video", "person_image", "final_prompt_file"]:
        if not file_ready(paths.get(key)):
            hard_stops.append(f"{key} is missing or empty: {paths.get(key)}")
    prompt_path = paths.get("final_prompt_file")
    if prompt_path and "draft" in prompt_path.name and not args.allow_draft_prompt:
        hard_stops.append("final_prompt_file is a draft. Review/refine it or pass --allow-draft-prompt intentionally.")
    if args.submit and not args.confirm_submit_authorization:
        hard_stops.append("Submit requested without --confirm-submit-authorization.")
    inspection_path = out_dir / "inspection_report.json"
    if inspection_path.exists():
        inspection = load_json(inspection_path)
        for item in inspection.get("hard_stops", []):
            hard_stops.append(f"inspection_report hard stop: {item}")
    task_file = out_dir / f"kuaizi_seedance2_{clean_id(str(contract.get('row_id') or 'FACE-SWAP'))}_task_id.txt"
    if args.submit and task_file.exists() and not args.force_submit:
        hard_stops.append(f"task id already exists; use --force-submit only after explicit rerun request: {task_file}")
    return hard_stops


def upload_reference(client: Any, path: Path, row_id: str, role: str) -> dict[str, Any]:
    upload = client.upload(path, f"{row_id}_{role}{path.suffix.lower()}")
    upload["reference_type"] = role
    return upload


def build_content(prompt: str, uploads: list[dict[str, Any]]) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for upload in uploads:
        url = upload["download_url"]
        role = upload.get("reference_type", "")
        content_type = str(upload.get("content_type", ""))
        if role == "reference_video":
            content.append({"type": "video_url", "role": "reference_video", "video_url": {"url": url}})
        elif role == "person_image":
            content.append({"type": "image_url", "role": "reference_image", "image_url": {"url": url}})
        elif role == "talking_video":
            content.append({"type": "video_url", "role": "reference_video", "video_url": {"url": url}})
        elif role == "audio_reference":
            content.append({"type": "audio_url", "role": "reference_audio", "audio_url": {"url": url}})
        elif content_type.startswith("image/"):
            content.append({"type": "image_url", "role": "reference_image", "image_url": {"url": url}})
        elif content_type.startswith("video/"):
            content.append({"type": "video_url", "role": "reference_video", "video_url": {"url": url}})
        elif content_type.startswith("audio/"):
            content.append({"type": "audio_url", "role": "reference_audio", "audio_url": {"url": url}})
    return content


def find_video_url(response: dict[str, Any]) -> str | None:
    content = response.get("content") if isinstance(response, dict) else None
    if isinstance(content, dict):
        value = content.get("video_url") or content.get("kz_video_url")
        if isinstance(value, str):
            return value
    return pick(response, ["video_url", "kz_video_url", "url"])


def run_final_qa(video_path: Path, contract_path: Path, out_dir: Path) -> None:
    script = Path(__file__).with_name("final_qa.py")
    subprocess.run(
        [
            sys.executable,
            str(script),
            "--video",
            str(video_path),
            "--contract",
            str(contract_path),
            "--make-contact-sheet",
            "--output",
            str(out_dir / "final_report.json"),
        ],
        check=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--submit", action="store_true")
    parser.add_argument("--confirm-submit-authorization", action="store_true")
    parser.add_argument("--force-submit", action="store_true")
    parser.add_argument("--allow-draft-prompt", action="store_true")
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--poll-attempts", type=int, default=80)
    parser.add_argument("--poll-interval", type=int, default=15)
    args = parser.parse_args()

    contract_path = args.contract.expanduser().resolve()
    contract = load_json(contract_path)
    out_dir = Path(contract.get("out_dir") or contract_path.parent).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    row_id = str(contract.get("row_id") or "FACE-SWAP")
    row_slug = clean_id(row_id)
    task_file = out_dir / f"kuaizi_seedance2_{row_slug}_task_id.txt"
    paths = contract_paths(contract)
    hard_stops = preflight(contract, paths, out_dir, args)

    manifest = {
        "schema_version": "seedance-face-swap.manifest.v1",
        "created_at": utc_now(),
        "contract": str(contract_path),
        "out_dir": str(out_dir),
        "mode": "submit" if args.submit else "dry-run",
        "events": [],
    }
    append_event(manifest, "preflight", hard_stops=hard_stops)
    write_json(out_dir / "manifest.json", manifest)

    if hard_stops:
        report = {
            "schema_version": "seedance-face-swap.final_report.v1",
            "created_at": utc_now(),
            "ok": False,
            "status": "blocked",
            "hard_stops": hard_stops,
            "out_dir": str(out_dir),
        }
        write_json(out_dir / "final_report.json", report)
        print(json.dumps({"ok": False, "status": "blocked", "hard_stops": hard_stops, "out_dir": str(out_dir)}, ensure_ascii=False))
        return 2

    prompt = paths["final_prompt_file"].read_text(encoding="utf-8")
    generation = contract.get("generation") if isinstance(contract.get("generation"), dict) else {}
    request_body = {
        "model": generation.get("model") or DEFAULT_MODEL,
        "content": [
            {"type": "text", "text": prompt},
            {"type": "video_url", "role": "reference_video", "video_url": {"url": "<uploaded_reference_video_url>"}},
            {"type": "image_url", "role": "reference_image", "image_url": {"url": "<uploaded_person_image_url>"}},
        ],
        "resolution": generation.get("resolution") or "480p",
        "ratio": generation.get("ratio") or "9:16",
        "duration": int(generation.get("duration") or 15),
        "generate_audio": bool(generation.get("generate_audio", True)),
    }
    if paths.get("talking_video"):
        request_body["content"].append({"type": "video_url", "role": "reference_video", "video_url": {"url": "<uploaded_talking_video_url>"}})
    if paths.get("audio_reference"):
        request_body["content"].append({"type": "audio_url", "role": "reference_audio", "audio_url": {"url": "<uploaded_audio_reference_url>"}})
    write_json(out_dir / "payload_preview_redacted.json", request_body)

    if not args.submit:
        manifest["status"] = "dry_complete"
        append_event(manifest, "dry_complete", payload_preview=str(out_dir / "payload_preview_redacted.json"))
        write_json(out_dir / "manifest.json", manifest)
        write_json(
            out_dir / "final_report.json",
            {
                "schema_version": "seedance-face-swap.final_report.v1",
                "created_at": utc_now(),
                "ok": True,
                "status": "dry_complete",
                "submitted": False,
                "payload_preview": str(out_dir / "payload_preview_redacted.json"),
            },
        )
        print(json.dumps({"ok": True, "status": "dry_complete", "out_dir": str(out_dir)}, ensure_ascii=False))
        return 0

    runner = load_runner()
    client = runner.KuaiziClient()
    client.authorize()
    append_event(manifest, "authorized")
    write_json(out_dir / "manifest.json", manifest)

    uploads = [
        upload_reference(client, paths["reference_video"], row_slug, "reference_video"),
        upload_reference(client, paths["person_image"], row_slug, "person_image"),
    ]
    if paths.get("talking_video"):
        uploads.append(upload_reference(client, paths["talking_video"], row_slug, "talking_video"))
    if paths.get("audio_reference"):
        uploads.append(upload_reference(client, paths["audio_reference"], row_slug, "audio_reference"))
    write_json(out_dir / "uploaded_references_redacted.json", redact({"uploads": uploads}))
    append_event(manifest, "uploaded_references", reference_types=[item.get("reference_type") for item in uploads], count=len(uploads))
    write_json(out_dir / "manifest.json", manifest)

    request_body["content"] = build_content(prompt, uploads)
    write_json(out_dir / f"kuaizi_seedance2_{row_slug}_request_redacted.json", redact(request_body))
    task_endpoint = endpoint_url(runner)
    create = client.post_json(task_endpoint, headers=client.api_headers, body=request_body)
    write_json(out_dir / f"kuaizi_seedance2_{row_slug}_create_response.json", create)
    task_id = pick(create, ["id", "task_id", "taskId"])
    if not task_id:
        raise RuntimeError("Generation response did not include a task id.")
    task_file.write_text(task_id, encoding="utf-8")
    append_event(manifest, "submitted_once", task_id=task_id, task_file=str(task_file))
    write_json(out_dir / "manifest.json", manifest)
    print(json.dumps({"ok": True, "phase": "submitted_once", "task_id": task_id}, ensure_ascii=False), flush=True)

    last: dict[str, Any] = {}
    poll_url = task_status_url(task_endpoint, task_id)
    for index in range(args.poll_attempts):
        response = client.session.get(poll_url, headers=client.api_headers, timeout=60)
        try:
            last = response.json()
        except Exception:
            last = {"raw": response.text[:1000]}
        status = str(last.get("status") or pick(last, ["status"]) or "")
        print(json.dumps({"phase": "poll", "try": index + 1, "status": status}, ensure_ascii=False), flush=True)
        if status in {"succeeded", "failed", "cancelled", "canceled"}:
            break
        time.sleep(args.poll_interval)
    poll_path = out_dir / f"kuaizi_seedance2_{row_slug}_poll_response.json"
    write_json(poll_path, last)
    status = str(last.get("status") or pick(last, ["status"]) or "")
    append_event(manifest, "poll_finished", status=status, poll_response=str(poll_path))
    write_json(out_dir / "manifest.json", manifest)
    if status != "succeeded":
        write_json(
            out_dir / "final_report.json",
            {
                "schema_version": "seedance-face-swap.final_report.v1",
                "created_at": utc_now(),
                "ok": False,
                "status": status or "unknown",
                "task_id": task_id,
                "poll_response": str(poll_path),
            },
        )
        return 2

    video_url = find_video_url(last)
    if not video_url:
        raise RuntimeError("Task succeeded but no video URL was returned.")
    (out_dir / f"kuaizi_seedance2_{row_slug}_video_url.txt").write_text(video_url, encoding="utf-8")
    video_path = out_dir / f"{row_slug}_seedance2_{request_body['resolution']}_{request_body['duration']}s.mp4"
    downloaded = client.session.get(video_url, timeout=300)
    if downloaded.status_code >= 400:
        raise RuntimeError(f"Video download failed HTTP {downloaded.status_code}")
    video_path.write_bytes(downloaded.content)
    append_event(manifest, "downloaded_video", video_path=str(video_path), size_bytes=video_path.stat().st_size)
    manifest["status"] = "downloaded"
    write_json(out_dir / "manifest.json", manifest)

    if args.verify:
        run_final_qa(video_path, contract_path, out_dir)
        manifest["status"] = "verified"
    else:
        write_json(
            out_dir / "final_report.json",
            {
                "schema_version": "seedance-face-swap.final_report.v1",
                "created_at": utc_now(),
                "ok": True,
                "status": "downloaded",
                "task_id": task_id,
                "video_path": str(video_path),
                "verify": False,
            },
        )
    manifest["ended_at"] = utc_now()
    write_json(out_dir / "manifest.json", manifest)
    print(json.dumps({"ok": True, "status": manifest["status"], "task_id": task_id, "video_path": str(video_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
