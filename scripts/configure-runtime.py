#!/usr/bin/env python3
"""Create Replication's private local credential file without printing secrets."""

from __future__ import annotations

import argparse
import getpass
import json
import os
from pathlib import Path


def default_path() -> Path:
    if os.name == "nt":
        root = Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming")
        return root / "Replication" / "credentials.json"
    root = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config")
    return root / "replication" / "credentials.json"


def prompt(label: str, *, secret: bool = False) -> str:
    reader = getpass.getpass if secret else input
    return reader(f"{label}（可留空）: ").strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", type=Path, default=default_path())
    args = parser.parse_args()
    target = args.path.expanduser()
    if target.exists():
        raise SystemExit(f"配置已存在，未覆盖：{target}")

    data = {
        "provider_name": prompt("视频接口名称") or "自定义视频接口",
        "api_base": prompt("视频 API Base URL"),
        "upload_base": prompt("素材上传 Base URL（留空则同上）"),
        "model": prompt("视频模型名称"),
        "api_key": prompt("视频接口 API Key", secret=True),
        "upload_token": prompt("上传 Token（留空则复用 API Key）", secret=True),
    }
    data["upload_base"] = data["upload_base"] or data["api_base"]
    data["upload_token"] = data["upload_token"] or data["api_key"]
    if not data["api_base"] or not data["model"] or not data["api_key"]:
        raise SystemExit("必须填写视频 API 地址、模型名称和 API Key。")

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(target, 0o600)
    print(f"本机私密配置已保存：{target}")
    print("该文件不在 Git 仓库中，请勿上传。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
