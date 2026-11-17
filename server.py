#!/usr/bin/env python3
"""사주 만세력 로컬 서버.

정적 파일(static/)만 제공한다. 만세력 계산과 해석은 모두 브라우저에서 처리하고,
AI 해석은 화면에서 넣은 Gemini API 키로 브라우저가 Google에 직접 요청한다.

실행: python3 server.py  →  http://localhost:8787
"""
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")
PORT = int(os.environ.get("PORT", "8787"))
HOST = os.environ.get("HOST", "127.0.0.1")  # 컨테이너(Cloud Run)에서는 0.0.0.0


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        if self.path.endswith((".js", ".css", ".html", "/")):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    handler = partial(Handler, directory=STATIC)
    httpd = ThreadingHTTPServer((HOST, PORT), handler)
    print("사주 만세력: http://localhost:%d" % PORT)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
