#!/usr/bin/env python3
"""Create Replication's private local credential file without printing secrets."""

from __future__ import annotations

import argparse
import getpass
import json
import os
from pathlib import Path


DEFAULT_PATH = Path.home() / ".config" / "replication" / "credentials.json"


def prompt(label: str, *, secret: bool = False) -> str:
    reader = getpass.getpass if secret else input
    return reader(f"{label}（可留空）: ").strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--path", type=Path, default=DEFAULT_PATH)
    args = parser.parse_args()
    target = args.path.expanduser()
    if target.exists():
        raise SystemExit(f"配置已存在，未覆盖：{target}")

    data = {
        "username": prompt("Kuaizi 用户名"),
        "password": prompt("Kuaizi 密码", secret=True),
        "console_token": prompt("Kuaizi Console Token", secret=True),
        "api_key": prompt("Kuaizi API Key", secret=True),
    }
    has_login = bool(data["username"] and data["password"])
    has_tokens = bool(data["console_token"] and data["api_key"])
    if not has_login and not has_tokens:
        raise SystemExit("至少填写用户名+密码，或 Console Token+API Key。")

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.chmod(target, 0o600)
    print(f"本机私密配置已保存：{target}")
    print("该文件不在 Git 仓库中，请勿上传。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
