#!/usr/bin/env python3
"""Resume an already submitted Kuaizi / Seedance face-swap task.

This adapter intentionally never creates a new provider task. It only polls the
saved task id, downloads the terminal video, and runs the existing QA script.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

DEFAULT_SUBMITTER = (
    Path(__file__).resolve().parents[2]
    / "runtime"
    / "seedance-face-swap"
    / "scripts"
    / "submit_face_swap_task.py"
)


def load_submitter() -> Any:
    script = Path(os.environ.get("REPLICATION_FACE_SWAP_SUBMITTER", DEFAULT_SUBMITTER))
    spec = importlib.util.spec_from_file_location("replication_face_swap_submitter", script)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load face-swap submitter: {script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.expanduser().read_text(encoding="utf-8"))


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--poll-attempts", type=int, default=240)
    parser.add_argument("--poll-interval", type=int, default=15)
    args = parser.parse_args()

    submitter = load_submitter()
    runner = submitter.load_runner()
    contract_path = args.contract.expanduser().resolve()
    contract = load_json(contract_path)
    out_dir = Path(contract.get("out_dir") or contract_path.parent).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    row_id = str(contract.get("row_id") or "FACE-SWAP")
    row_slug = submitter.clean_id(row_id)
    generation = contract.get("generation") if isinstance(contract.get("generation"), dict) else {}
    resolution = generation.get("resolution") or "480p"
    duration = int(generation.get("duration") or 15)

    manifest_path = out_dir / "manifest.json"
    if manifest_path.exists():
        manifest = load_json(manifest_path)
    else:
        manifest = {
            "schema_version": "seedance-face-swap.manifest.v1",
            "created_at": submitter.utc_now(),
            "contract": str(contract_path),
            "out_dir": str(out_dir),
            "mode": "resume",
            "events": [],
        }
    submitter.append_event(manifest, "resume_started", task_id=args.task_id)
    write_json(manifest_path, manifest)

    client = runner.KuaiziClient()
    client.authorize()
    task_endpoint = submitter.endpoint_url(runner)
    poll_url = submitter.task_status_url(task_endpoint, args.task_id)

    last: dict[str, Any] = {}
    for index in range(args.poll_attempts):
        response = client.session.get(poll_url, headers=client.api_headers, timeout=60)
        try:
            last = response.json()
        except Exception:
            last = {"raw": response.text[:1000]}
        status = str(last.get("status") or submitter.pick(last, ["status"]) or "")
        print(
            json.dumps(
                {"phase": "resume_poll", "try": index + 1, "status": status},
                ensure_ascii=False,
            ),
            flush=True,
        )
        if status in {"succeeded", "failed", "cancelled", "canceled"}:
            break
        time.sleep(args.poll_interval)

    poll_path = out_dir / f"kuaizi_seedance2_{row_slug}_poll_response.json"
    write_json(poll_path, last)
    final_status = str(last.get("status") or submitter.pick(last, ["status"]) or "")
    submitter.append_event(manifest, "resume_poll_finished", status=final_status, poll_response=str(poll_path))
    write_json(manifest_path, manifest)

    if final_status != "succeeded":
        write_json(
            out_dir / "final_report.json",
            {
                "schema_version": "seedance-face-swap.final_report.v1",
                "created_at": submitter.utc_now(),
                "ok": False,
                "status": final_status or "unknown",
                "task_id": args.task_id,
                "poll_response": str(poll_path),
            },
        )
        return 2

    video_url = submitter.find_video_url(last)
    if not video_url:
        raise RuntimeError("Task succeeded but no video URL was returned.")
    (out_dir / f"kuaizi_seedance2_{row_slug}_video_url.txt").write_text(
        video_url,
        encoding="utf-8",
    )

    video_path = out_dir / f"{row_slug}_seedance2_{resolution}_{duration}s.mp4"
    if not video_path.exists() or video_path.stat().st_size <= 0:
        downloaded = client.session.get(video_url, timeout=300)
        if downloaded.status_code >= 400:
            raise RuntimeError(f"Video download failed HTTP {downloaded.status_code}")
        video_path.write_bytes(downloaded.content)
        submitter.append_event(
            manifest,
            "resume_downloaded_video",
            video_path=str(video_path),
            size_bytes=video_path.stat().st_size,
        )

    if args.verify:
        submitter.run_final_qa(video_path, contract_path, out_dir)
        manifest["status"] = "verified"
    else:
        write_json(
            out_dir / "final_report.json",
            {
                "schema_version": "seedance-face-swap.final_report.v1",
                "created_at": submitter.utc_now(),
                "ok": True,
                "status": "downloaded",
                "task_id": args.task_id,
                "video_path": str(video_path),
                "verify": False,
            },
        )
        manifest["status"] = "downloaded"

    manifest["ended_at"] = submitter.utc_now()
    write_json(manifest_path, manifest)
    print(
        json.dumps(
            {
                "ok": True,
                "status": manifest["status"],
                "task_id": args.task_id,
                "video_path": str(video_path),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
