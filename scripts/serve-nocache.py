"""Static web server for web/ that forces browsers to revalidate on every request.

Plain `python3 -m http.server` sends no cache-control headers, which lets
browsers cache JSON/JS forever — causing "I deployed fresh data but the
browser still shows old content" bugs. This variant sends `Cache-Control:
no-cache, must-revalidate` on every response.

Usage: python3 scripts/serve-nocache.py [port]   (default port 8080)
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    web_dir = Path(__file__).resolve().parent.parent / "web"
    import os
    os.chdir(web_dir)
    httpd = ThreadingHTTPServer(("", port), NoCacheHandler)
    print(f"No-cache server on http://localhost:{port}/  serving {web_dir}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()


if __name__ == "__main__":
    main()
