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


# 브라우저 보안 헤더. 스크립트는 이 사이트 파일만 실행되고(인라인·외부 스크립트 차단),
# 네트워크 요청은 Gemini API로만 나갈 수 있다. 누가 페이지에 스크립트를 끼워 넣어도
# 실행되지 않고, 저장된 API 키를 다른 서버로 빼돌리지 못하게 한다.
CSP = "; ".join([
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src https://generativelanguage.googleapis.com",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
])
SECURITY_HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Strict-Transport-Security": "max-age=31536000",
}


class Handler(SimpleHTTPRequestHandler):
    server_version = "saju"
    sys_version = ""

    def log_message(self, fmt, *args):
        pass

    def list_directory(self, path):
        # 폴더 목록은 보여 주지 않는다
        self.send_error(404)
        return None

    def do_GET(self):
        # 숨김 파일(.git 등)은 거절
        if any(part.startswith(".") for part in self.path.split("?")[0].split("/")):
            self.send_error(404)
            return
        super().do_GET()

    def end_headers(self):
        for k, v in SECURITY_HEADERS.items():
            self.send_header(k, v)
        if self.path.split("?")[0].endswith((".js", ".css", ".html", "/")):
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
