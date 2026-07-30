#!/usr/bin/env python3
"""Minimal credential and upload client used by Replication's packaged runtime."""

from __future__ import annotations

import json
import mimetypes
import os
import re
from pathlib import Path
from typing import Any

import requests


BASE_CONSOLE = "https://aiopenapi.kuaizi.cn/ai-open-platform-api/v1"
BASE_API = "https://aiopenapi.kuaizi.cn/ai-open-platform-api/api/v3"
DEFAULT_CREDENTIALS = Path.home() / ".config" / "replication" / "credentials.json"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def credentials_path() -> Path:
    explicit = os.environ.get("REPLICATION_CREDENTIALS_FILE")
    return Path(explicit).expanduser() if explicit else DEFAULT_CREDENTIALS


def load_private_credentials() -> dict[str, Any]:
    path = credentials_path()
    if not path.exists():
        return {}
    try:
        data = load_json(path)
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


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
        result: dict[str, Any] = {}
        for key, value in obj.items():
            lowered = key.lower()
            if any(part in lowered for part in ("token", "key", "secret", "password", "authorization")):
                result[key] = "<redacted>"
            else:
                result[key] = redact(value)
        return result
    if isinstance(obj, list):
        return [redact(value) for value in obj]
    return obj


class KuaiziClient:
    def __init__(self) -> None:
        stored = load_private_credentials()
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "replication/0.2"})
        self.console_token = os.environ.get("KUAIZI_CONSOLE_TOKEN") or stored.get("console_token")
        self.api_key = os.environ.get("KUAIZI_API_KEY") or stored.get("api_key")
        self.username = os.environ.get("KUAIZI_USERNAME") or stored.get("username")
        self.password = os.environ.get("KUAIZI_PASSWORD") or stored.get("password")

    def post_json(
        self,
        url: str,
        headers: dict[str, str] | None = None,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        response = self.session.post(url, headers=headers or {}, json=body or {}, timeout=120)
        try:
            data = response.json()
        except Exception:
            data = {"raw": response.text[:1000]}
        if response.status_code >= 400:
            safe = json.dumps(redact(data), ensure_ascii=False)[:1200]
            raise RuntimeError(f"POST {url} HTTP {response.status_code}: {safe}")
        return data

    def authorize(self) -> None:
        if not self.console_token:
            if not self.username or not self.password:
                raise RuntimeError(
                    "Configure KUAIZI_USERNAME/KUAIZI_PASSWORD, KUAIZI_CONSOLE_TOKEN, "
                    f"or the private credential file at {credentials_path()}."
                )
            login = self.post_json(
                f"{BASE_CONSOLE}/login",
                body={"username": self.username, "password": self.password},
            )
            self.console_token = pick(login, ["token", "access_token", "jwt", "authorization"])
            if not self.console_token:
                raise RuntimeError("Login succeeded but no console token was returned.")

        if not self.api_key:
            listing = self.post_json(
                f"{BASE_CONSOLE}/console/api_key/list",
                headers=self.console_headers,
                body={"page": 1, "page_size": 20},
            )
            self.api_key = pick(listing, ["api_key", "apiKey", "key", "secret_key", "sk"])
            if not self.api_key:
                text = json.dumps(listing, ensure_ascii=False)
                match = re.search(r"(sk-[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{32,})", text)
                self.api_key = match.group(1) if match else None
            if not self.api_key:
                raise RuntimeError("No API key was found in the Kuaizi account.")

    @property
    def console_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.console_token}",
            "Content-Type": "application/json",
        }

    @property
    def api_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def upload(self, path: Path, name: str) -> dict[str, Any]:
        suffix = path.suffix.lstrip(".").lower()
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if suffix == "mp3":
            content_type = "audio/mpeg"
        elif suffix == "png":
            content_type = "image/png"

        signed = self.post_json(
            f"{BASE_CONSOLE}/file/sign_upload",
            headers=self.console_headers,
            body={
                "file_name": name,
                "file_suffix": suffix,
                "size": path.stat().st_size,
                "content_type": content_type,
            },
        )
        data = signed.get("data") if isinstance(signed, dict) else None
        if not isinstance(data, dict):
            data = signed
        upload_url = pick(data, ["upload_url", "uploadUrl", "put_url", "putUrl"])
        download_url = pick(data, ["download_url", "downloadUrl", "url"])
        file_id = pick(data, ["file_id", "fileId", "id"])
        if not upload_url or not download_url:
            raise RuntimeError("Kuaizi sign_upload did not return upload/download URLs.")

        with path.open("rb") as handle:
            uploaded = requests.put(
                upload_url,
                data=handle,
                headers={"Content-Type": content_type},
                timeout=300,
            )
        if uploaded.status_code >= 400:
            raise RuntimeError(f"PUT upload failed HTTP {uploaded.status_code}.")
        return {
            "name": name,
            "file_id": file_id,
            "download_url": download_url,
            "content_type": content_type,
            "size": path.stat().st_size,
        }
