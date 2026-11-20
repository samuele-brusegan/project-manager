#!/usr/bin/env python3
"""Small host-side Git metadata service for the Dockerized Project Hub."""

from __future__ import annotations

import hmac
import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


MAX_BODY_BYTES = 32 * 1024
COMMAND_TIMEOUT_SECONDS = 8


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


TOKEN = required_env("GIT_SERVICE_TOKEN")
ROOTS = tuple(
    Path(value).expanduser().resolve()
    for value in required_env("GIT_SERVICE_ROOTS").split(",")
    if value.strip()
)
if not ROOTS:
    raise RuntimeError("GIT_SERVICE_ROOTS must contain at least one directory")
if any(not root.is_dir() for root in ROOTS):
    missing = ", ".join(str(root) for root in ROOTS if not root.is_dir())
    raise RuntimeError(f"Git root does not exist or is not a directory: {missing}")


def resolve_repo(raw_path: Any) -> Path:
    if not isinstance(raw_path, str) or not raw_path.strip():
        raise ValueError("Missing repository path")

    path = Path(raw_path).expanduser().resolve(strict=True)
    if not path.is_dir():
        raise ValueError("Repository path is not a directory")
    if not any(path == root or root in path.parents for root in ROOTS):
        raise PermissionError("Repository path is outside the authorized roots")
    if not (path / ".git").exists():
        raise ValueError("Directory is not a Git repository")

    # Confirm Git can resolve the work tree before running metadata commands.
    run_git(path, ["rev-parse", "--show-toplevel"])
    return path


def run_git(path: Path, arguments: list[str]) -> str:
    environment = os.environ.copy()
    environment["GIT_OPTIONAL_LOCKS"] = "0"
    result = subprocess.run(
        ["git", "-C", str(path), *arguments],
        check=False,
        capture_output=True,
        text=True,
        timeout=COMMAND_TIMEOUT_SECONDS,
        env=environment,
    )
    if result.returncode != 0:
        raise RuntimeError("Git could not read the repository")
    return result.stdout.strip()


def git_info(path: Path) -> dict[str, Any]:
    line = run_git(path, ["log", "-1", "--format=%s|%cI"])
    subject, separator, commit_date = line.partition("|")
    branches = run_git(
        path,
        [
            "for-each-ref",
            "--format=%(refname:short)|%(objectname:short)|%(subject)",
            "refs/heads",
            "refs/remotes",
        ],
    )
    branch = run_git(path, ["branch", "--show-current"]) or "HEAD"
    return {
        "ok": 1,
        "last_commit": subject,
        "commit_date": commit_date if separator else "",
        "branch": branch,
        "branches": [item for item in branches.splitlines() if item],
    }


def git_tree(path: Path) -> dict[str, Any]:
    log = run_git(
        path,
        [
            "log",
            "--all",
            "--date=short",
            "--pretty=format:%h|%ad|%an|%D|%s",
            "--max-count=120",
        ],
    )
    return {"ok": 1, "commits": [item for item in log.splitlines() if item]}


class GitRequestHandler(BaseHTTPRequestHandler):
    server_version = "ProjectHubGitService/1.0"

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def authorized(self) -> bool:
        supplied = self.headers.get("Authorization", "")
        return hmac.compare_digest(supplied, f"Bearer {TOKEN}")

    def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        if self.path == "/health" and self.authorized():
            self.send_json(200, {"ok": 1})
            return
        self.send_json(401 if self.path == "/health" else 404, {"error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        if not self.authorized():
            self.send_json(401, {"error": "Unauthorized"})
            return
        if self.path not in ("/git-info", "/git-tree"):
            self.send_json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                raise ValueError("Invalid request body")
            request = json.loads(self.rfile.read(length))
            path = resolve_repo(request.get("path"))
            response = git_info(path) if self.path == "/git-info" else git_tree(path)
            self.send_json(200, response)
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Invalid JSON body"})
        except (OSError, ValueError, PermissionError, RuntimeError, subprocess.TimeoutExpired) as error:
            self.send_json(400, {"error": str(error)})

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[git-service] {self.address_string()} - {format % args}", flush=True)


def main() -> None:
    # Loopback by default: the Docker app reaches it via host.docker.internal,
    # so set GIT_SERVICE_BIND explicitly (e.g. the LAN IP or 0.0.0.0) when the
    # container must connect. The bearer token is the only auth — do not expose
    # the port on untrusted networks without a firewall.
    bind = os.environ.get("GIT_SERVICE_BIND", "127.0.0.1")
    port = int(os.environ.get("GIT_SERVICE_PORT", "8090"))
    server = ThreadingHTTPServer((bind, port), GitRequestHandler)
    print(f"Git service listening on {bind}:{port}; authorized roots: {', '.join(map(str, ROOTS))}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
