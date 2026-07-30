#!/usr/bin/env python3
"""Create deterministic artifacts for a Seedance face-swap video-reference run."""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from inspect_inputs import build_report, write_json


DEFAULT_MODEL = "doubao-seedance-2-0-260128"
DEFAULT_ROOT = Path.home() / "Movies" / "Replication"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def slugify(value: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9\u4e00-\u9fff]+", "_", value).strip("_")
    return slug[:80] or "seedance_face_swap"


def absolute(path: Path | None) -> str | None:
    if path is None:
        return None
    expanded = path.expanduser()
    return str(expanded.resolve()) if expanded.exists() else str(expanded)


def read_text(path: Path | None) -> str:
    if not path:
        return ""
    return path.expanduser().read_text(encoding="utf-8").strip()


def make_out_dir(args: argparse.Namespace) -> Path:
    if args.out_dir:
        out_dir = args.out_dir.expanduser()
    else:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_dir = DEFAULT_ROOT / f"{slugify(args.title)}_{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir.resolve()


def prompt_template(args: argparse.Namespace, row_id: str) -> str:
    spoken = args.spoken_script or read_text(args.spoken_script_file)
    spoken_block = spoken or "Use the user-provided spoken script. If no spoken script is supplied, generate natural short UGC speech matching the user's latest request."
    expression_block = expression_text(args.expression_intensity)
    return f"""Vertical {args.ratio} realistic phone-shot video, {args.duration} seconds, generated with Seedance 2.0 video reference.

Use @Video 1 only as the source reference for shot order, camera motion, body action, framing, pacing, lighting rhythm, and scene continuity. Replace the original visible person completely.

Use @Image 1 as the replacement person identity throughout the entire video: same face, hair, skin tone, age impression, facial structure, and visible styling. @Image 1 always wins over other references.
If @Image 1 was generated as a US-market/American-native-feeling creator, use that only for the foreground person's identity, styling, expression, and voice vibe. Do not let the US-market identity change the source scene, location, product context, on-screen language, UI, or background.

If @Video 2 is provided, use it only for mouth movement, speaking rhythm, expression energy, natural lip-sync behavior, and talking-head performance. Do not use @Video 2 to change the identity from @Image 1.

If @Audio 1 is provided, use it only for timbre, accent, pace, pauses, emotional temperature, and delivery feel.

BACKGROUND / SCENE LOCK:
Preserve @Video 1 background exactly: all existing product images, wheels, page layout, screen/UI elements, existing source-video text, lighting, wall/screen composition, object positions, and spatial relationships must remain consistent with the source video.
Only replace the foreground presenter/person identity with @Image 1. Do not use @Image 1 background, studio backdrop, white seamless paper, lighting, or environment as the scene.
Scene preservation has higher priority than nationality/market styling. Even if @Image 1 looks American, keep @Video 1's original warehouse, showroom, shop, website, subtitles, UI, product arrangement, signage, lighting, and camera composition unchanged.
Do not add new text or new UI. Existing background text/UI from @Video 1 should remain as part of the source scene.

{expression_block}

Spoken script / beat sheet:
{spoken_block}

Keep the same visual rhythm as @Video 1 while making the generated person clearly become @Image 1. No newly added subtitles, no newly added captions, no newly added platform UI, no watermark, no newly generated readable text, no username added by the model, no duplicate people, no face morphing, no original source face returning, no frozen expression, no blank stare, no stiff body.

RUN ID: {row_id}
"""


def expression_text(intensity: str) -> str:
    if intensity == "subtle":
        level = "Use subtle expression enrichment only: small eye movement, light smile changes, tiny head nods, restrained hand movement, and natural mouth shapes."
    elif intensity == "high-energy":
        level = "Use high-energy UGC presenter performance: stronger eye contact, clear eyebrow lifts, bigger smile changes, visible hand emphasis, confident head nods, and lively torso micro-movement."
    else:
        level = "Use expressive but natural creator performance: warm eye contact, eyebrow movement on emphasis, smile variation, small head nods, subtle shoulder shifts, and purposeful hand gestures."
    return f"""EXPRESSION / PERFORMANCE LOCK:
{level}
Preserve the source video's timing and rough gesture path, but make the replacement person more alive, confident, and camera-aware. Do not overact, dance, wave randomly, or break the source composition."""


def content_preview(prompt: str, has_talking_video: bool, has_audio: bool) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = [
        {"type": "text", "text": prompt},
        {"type": "video_url", "role": "reference_video", "video_url": {"url": "<uploaded_reference_video_url>"}},
        {"type": "image_url", "role": "reference_image", "image_url": {"url": "<uploaded_person_image_url>"}},
    ]
    if has_talking_video:
        content.append({"type": "video_url", "role": "reference_video", "video_url": {"url": "<uploaded_talking_video_url>"}})
    if has_audio:
        content.append({"type": "audio_url", "role": "reference_audio", "audio_url": {"url": "<uploaded_audio_reference_url>"}})
    return content


def build_source_json(args: argparse.Namespace, row_id: str, prompt_path: Path) -> dict[str, Any]:
    spoken = args.spoken_script or read_text(args.spoken_script_file)
    return {
        "schema_version": "seedance-face-swap.source.v1",
        "row_id": row_id,
        "title": args.title,
        "分镜脚本": "Use the source reference video as shot/action timeline. Replace the original person with the supplied target identity image.",
        "总控prompt": f"Seedance 2.0 video reference face replacement. Ratio {args.ratio}, duration {args.duration}s, resolution {args.resolution}.",
        "英文口播 Beat Sheet": spoken,
        "人物三视图": {"local_files": [absolute(args.person_image)]},
        "视频参考": {"local_files": [absolute(args.reference_video)], "role": "source_video_motion_camera_action_pacing"},
        "口播视频参考": {"local_files": [absolute(args.talking_video)] if args.talking_video else [], "role": "talking_mouth_expression_delivery_only"},
        "音频参考": absolute(args.audio_reference),
        "final_prompt_path": str(prompt_path),
        "expression_intensity": args.expression_intensity,
        "reference_policy": {
            "reference_video": "scene/background/layout/motion/camera/action/pacing; preserve everything except original foreground identity",
            "person_image": "replacement identity; wins all conflicts",
            "talking_video": "mouth/expression/delivery only",
            "audio_reference": "timbre/delivery only",
        },
    }


def build_contract(args: argparse.Namespace, row_id: str, out_dir: Path, prompt_path: Path, inspection: dict[str, Any]) -> dict[str, Any]:
    stop_rules = [
        "Never submit paid generation without current-task explicit approval.",
        "Never preserve the original source-video face when a replacement person image is supplied.",
        "Never remove, repaint, localize, translate, replace, or Americanize the source-video background, product images, UI, existing text, lighting, or object layout unless the user explicitly asks.",
        "If the replacement person image has a US-market/American-native feel, apply it only to the person identity and delivery, never to the source scene.",
        "Stop if the target identity image is missing or ambiguous.",
        "Stop if talking_video and person_image conflict and the user expects both to define identity.",
        "Stop if an existing task id is present and the user did not request rerun.",
        "Never write credentials, signed URLs, passwords, cookies, or API keys into artifacts or replies.",
    ]
    if args.mode == "submit" and not args.confirm_submit_authorization:
        inspection.setdefault("hard_stops", []).append("Submit mode requested without --confirm-submit-authorization.")
        inspection["status"] = "blocked"
    return {
        "schema_version": "seedance-face-swap.request_contract.v1",
        "created_at": utc_now(),
        "created_by": os.environ.get("USER", "unknown"),
        "mode": args.mode,
        "submit_authorized": bool(args.confirm_submit_authorization),
        "row_id": row_id,
        "title": args.title,
        "out_dir": str(out_dir),
        "input_paths": {
            "reference_video": absolute(args.reference_video),
            "person_image": absolute(args.person_image),
            "talking_video": absolute(args.talking_video),
            "audio_reference": absolute(args.audio_reference),
            "spoken_script_file": absolute(args.spoken_script_file),
            "final_prompt_file": str(prompt_path),
        },
        "generation": {
            "model": args.model,
            "resolution": args.resolution,
            "ratio": args.ratio,
            "duration": args.duration,
            "generate_audio": bool(args.generate_audio),
            "expression_intensity": args.expression_intensity,
        },
        "reference_roles": {
            "reference_video": "source scene/background/layout plus motion, shot logic, camera behavior, action rhythm, scene continuity",
            "person_image": "replacement identity; highest priority",
            "talking_video": "optional talking/mouth/expression delivery reference only",
            "audio_reference": "optional voice/timbre/delivery reference only",
        },
        "stop_rules": stop_rules,
        "artifact_paths": {
            "inspection_report": str(out_dir / "inspection_report.json"),
            "action_plan": str(out_dir / "action_plan.json"),
            "source_face_swap": str(out_dir / "source_face_swap.json"),
            "payload_preview_redacted": str(out_dir / "payload_preview_redacted.json"),
            "requirement_audit": str(out_dir / "requirement_audit.json"),
        },
    }


def build_action_plan(args: argparse.Namespace, inspection: dict[str, Any], prompt_path: Path) -> dict[str, Any]:
    blocked = bool(inspection.get("hard_stops"))
    prompt_ready = bool(prompt_path.exists() and prompt_path.stat().st_size > 0)
    submit_decision = "skip"
    submit_reason = "dry run"
    if args.mode == "submit":
        submit_decision = "run" if args.confirm_submit_authorization and not blocked else "need_user_submit_authorization"
        submit_reason = "authorized by --confirm-submit-authorization" if args.confirm_submit_authorization else "wait for abo approval"
    return {
        "schema_version": "seedance-face-swap.action_plan.v1",
        "created_at": utc_now(),
        "status": "blocked" if blocked else "ready",
        "steps": [
            {"id": "inspect_inputs", "decision": "pass" if not blocked else "blocked", "evidence": "inspection_report.json"},
            {"id": "build_final_prompt", "decision": "run" if prompt_ready else "need_prompt", "evidence": str(prompt_path)},
            {"id": "prepare_payload_preview", "decision": "pass", "evidence": "payload_preview_redacted.json"},
            {"id": "upload_references", "decision": submit_decision, "reason": submit_reason},
            {"id": "submit_seedance_task", "decision": submit_decision, "reason": submit_reason},
            {"id": "poll_and_download", "decision": submit_decision, "reason": "after submit task id exists" if submit_decision == "run" else submit_reason},
            {"id": "final_qa", "decision": "run_after_video_exists", "evidence": "final_report.json"},
        ],
    }


def build_requirement_audit(args: argparse.Namespace, inspection: dict[str, Any], prompt_path: Path) -> dict[str, Any]:
    hard_stops = inspection.get("hard_stops", [])
    return {
        "schema_version": "seedance-face-swap.requirement_audit.v1",
        "created_at": utc_now(),
        "criteria": [
            {"id": "reference_video_present", "status": "pass" if not any("reference_video" in item for item in hard_stops) else "fail", "evidence": absolute(args.reference_video)},
            {"id": "person_image_present", "status": "pass" if not any("person_image" in item for item in hard_stops) else "fail", "evidence": absolute(args.person_image)},
            {"id": "identity_priority_declared", "status": "pass", "evidence": "request_contract.reference_roles.person_image"},
            {"id": "paid_submit_guard", "status": "pass" if args.mode == "dry-run" or args.confirm_submit_authorization else "blocked", "evidence": {"mode": args.mode, "submit_authorized": bool(args.confirm_submit_authorization)}},
            {"id": "prompt_file_created", "status": "pass" if prompt_path.exists() and prompt_path.stat().st_size > 0 else "fail", "evidence": str(prompt_path)},
            {"id": "expression_enrichment_declared", "status": "pass", "evidence": args.expression_intensity},
            {"id": "background_scene_lock_declared", "status": "pass" if "BACKGROUND / SCENE LOCK" in prompt_path.read_text(encoding="utf-8") else "fail", "evidence": str(prompt_path)},
            {"id": "no_credentials_in_contract", "status": "pass", "evidence": "credentials are env/private-file only"},
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference-video", type=Path, required=True)
    parser.add_argument("--person-image", type=Path, required=True)
    parser.add_argument("--talking-video", type=Path)
    parser.add_argument("--audio-reference", type=Path)
    parser.add_argument("--spoken-script", default="")
    parser.add_argument("--spoken-script-file", type=Path)
    parser.add_argument("--final-prompt-file", type=Path)
    parser.add_argument("--title", default="Seedance face swap")
    parser.add_argument("--row-id", default="")
    parser.add_argument("--out-dir", type=Path)
    parser.add_argument("--mode", choices=["dry-run", "submit"], default="dry-run")
    parser.add_argument("--confirm-submit-authorization", action="store_true")
    parser.add_argument("--require-talking-reference", action="store_true")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--resolution", default="480p")
    parser.add_argument("--ratio", default="9:16")
    parser.add_argument("--duration", type=int, default=15)
    parser.add_argument("--generate-audio", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--expression-intensity", choices=["subtle", "expressive", "high-energy"], default="expressive")
    args = parser.parse_args()

    out_dir = make_out_dir(args)
    row_id = args.row_id or f"FACE-SWAP-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    if args.final_prompt_file:
        prompt_text = read_text(args.final_prompt_file)
        prompt_path = out_dir / "final_prompt.txt"
        prompt_path.write_text(prompt_text + "\n", encoding="utf-8")
    else:
        prompt_path = out_dir / "final_prompt_draft.txt"
        prompt_path.write_text(prompt_template(args, row_id), encoding="utf-8")

    inspection_args = argparse.Namespace(
        reference_video=args.reference_video,
        person_image=args.person_image,
        talking_video=args.talking_video,
        audio_reference=args.audio_reference,
        require_talking_reference=args.require_talking_reference,
        min_person_image_side=512,
        max_reference_seconds=120.0,
    )
    inspection = build_report(inspection_args)
    contract = build_contract(args, row_id, out_dir, prompt_path, inspection)
    action_plan = build_action_plan(args, inspection, prompt_path)
    source_json = build_source_json(args, row_id, prompt_path)
    prompt = prompt_path.read_text(encoding="utf-8")
    payload_preview = {
        "schema_version": "seedance-face-swap.payload_preview.v1",
        "model": args.model,
        "content": content_preview(prompt, bool(args.talking_video), bool(args.audio_reference)),
        "resolution": args.resolution,
        "ratio": args.ratio,
        "duration": args.duration,
        "generate_audio": bool(args.generate_audio),
    }
    requirement_audit = build_requirement_audit(args, inspection, prompt_path)

    write_json(out_dir / "inspection_report.json", inspection)
    write_json(out_dir / "request_contract.json", contract)
    write_json(out_dir / "action_plan.json", action_plan)
    write_json(out_dir / "source_face_swap.json", source_json)
    write_json(out_dir / "payload_preview_redacted.json", payload_preview)
    write_json(out_dir / "requirement_audit.json", requirement_audit)

    result = {
        "ok": inspection["status"] == "ready",
        "out_dir": str(out_dir),
        "contract": str(out_dir / "request_contract.json"),
        "action_plan": str(out_dir / "action_plan.json"),
        "warnings": inspection.get("warnings", []),
        "hard_stops": inspection.get("hard_stops", []),
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
