"""Static web server for web/ with no-cache headers + admin API.

- Every response sends Cache-Control: no-cache so browsers revalidate JSON/JS.
- Admin API (/api/admin/*) for human-maintained data files (deck_codes.json,
  x_posts.json). Reads allowed from any client; WRITES only from loopback
  (127.0.0.1) — admin UI must be opened on the host machine itself, not over
  the LAN. Keeps a write-protected LAN deploy.

Usage: python3 scripts/serve-nocache.py [port]   (default port 8080)
"""
import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = PROJECT_ROOT / "web"

# Files the admin API can manage. Key = URL segment, value = absolute path.
ADMIN_FILES = {
    "deck-codes": PROJECT_ROOT / "deck_codes.json",
    "x-posts": PROJECT_ROOT / "x_posts.json",
}


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    # ─── Admin API ───────────────────────────────────────────────────────
    # Path layout: /api/admin/<key>  where <key> ∈ ADMIN_FILES.
    #   GET  → returns the file's JSON contents
    #   POST → overwrites the file with the request body (must be valid JSON);
    #          loopback-only for safety

    def _is_loopback(self) -> bool:
        addr = self.client_address[0]
        return addr in ("127.0.0.1", "::1", "localhost")

    def _admin_key(self) -> str | None:
        path = self.path.split("?", 1)[0].rstrip("/")
        if not path.startswith("/api/admin/"):
            return None
        key = path[len("/api/admin/"):]
        return key if key in ADMIN_FILES else None

    def _send_json(self, status: int, payload):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        key = self._admin_key()
        if key is None:
            return super().do_GET()
        target = ADMIN_FILES[key]
        if not target.exists():
            return self._send_json(404, {"error": "file not found"})
        try:
            data = json.loads(target.read_text(encoding="utf-8"))
            return self._send_json(200, data)
        except Exception as e:
            return self._send_json(500, {"error": str(e)})

    def do_POST(self):
        key = self._admin_key()
        if key is None:
            return self._send_json(404, {"error": "not an admin endpoint"})
        if not self._is_loopback():
            return self._send_json(
                403,
                {"error": f"admin writes only allowed from loopback (got {self.client_address[0]})"},
            )
        try:
            n = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(n).decode("utf-8")
            parsed = json.loads(raw)  # validate that it's JSON
        except Exception as e:
            return self._send_json(400, {"error": f"invalid JSON body: {e}"})
        target = ADMIN_FILES[key]
        # Write atomically via tmp + rename to avoid half-written file
        tmp = target.with_suffix(target.suffix + ".tmp")
        tmp.write_text(
            json.dumps(parsed, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        tmp.replace(target)
        return self._send_json(200, {"ok": True, "path": str(target), "bytes": target.stat().st_size})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    import os
    os.chdir(WEB_DIR)
    httpd = ThreadingHTTPServer(("", port), NoCacheHandler)
    print(f"No-cache server on http://localhost:{port}/  serving {WEB_DIR}")
    print(f"Admin API (loopback-only writes): /api/admin/{{{','.join(ADMIN_FILES)}}}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()


if __name__ == "__main__":
    main()
