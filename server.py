#!/usr/bin/env python3
"""사주 만세력 로컬 서버.

- 정적 파일(static/) 제공: 만세력 계산·해석은 모두 브라우저에서 즉시 처리
- POST /api/ai : (선택) Claude로 심층 해석 스트리밍. ANTHROPIC_API_KEY 필요
  키는 환경변수 또는 이 폴더의 .env 파일(ANTHROPIC_API_KEY=...)에 넣으세요.

실행: python3 server.py  →  http://localhost:8787
"""
import json
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")
PORT = int(os.environ.get("PORT", "8787"))
MODEL = os.environ.get("SAJU_MODEL", "claude-opus-5-5")

SYSTEM_PROMPT = """당신은 한국 명리학(사주팔자)에 정통한 상담가입니다.
사용자의 원국·대운·세운은 이미 만세력 프로그램이 정확히 계산해 두었습니다. 기둥(간지)을 다시 계산하거나 바꾸지 말고, 주어진 데이터를 근거로 해석하세요.
프로그램이 제시한 용신은 규칙 기반 추정치이므로, 원국 전체(조후, 격국, 합충, 통근 여부)를 보고 동의하거나 다르게 판단되면 이유와 함께 말해 주세요.

다음 순서로 한국어 마크다운으로 답하세요(각 소제목은 '## '로 시작):
## 한 줄 요약
## 타고난 성향과 기질
## 사주의 구조와 용신 판단
## 재물·직업 방향
## 관계·배우자·가족
## 대운 흐름 (지금 대운과 앞으로의 큰 전환점)
## 올해와 내년
## 실천 조언 (3~5개, 구체적으로)
사용자가 질문을 남겼다면 마지막에 '## 질문에 대한 답'을 추가하세요.

원칙: 근거가 되는 글자(예: 월지 午의 정관)를 짚으며 설명하고, 운명론적 단정·공포 조장·의료/법률/투자에 대한 확정적 지시는 피하며, 균형 있고 실용적으로 씁니다. 전체 분량은 1500~2500자 정도로 간결하게."""


def load_key():
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return key.strip()
    env_path = os.path.join(ROOT, ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("ANTHROPIC_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        if "/api/" in (self.path or ""):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def end_headers(self):
        if self.path.endswith((".js", ".css", ".html", "/")):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def _text(self, code, msg):
        body = msg.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/api/ai":
            return self._text(404, "not found")
        length = int(self.headers.get("Content-Length") or 0)
        try:
            data = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self._text(400, "잘못된 요청입니다.")
        chart = str(data.get("chart", ""))[:6000]
        question = str(data.get("question", ""))[:500]
        if not chart:
            return self._text(400, "사주 데이터가 없습니다.")

        key = load_key()
        if not key:
            return self._text(
                503,
                "AI 해석을 쓰려면 API 키가 필요합니다. saju 폴더에 .env 파일을 만들고 "
                "ANTHROPIC_API_KEY=sk-ant-... 한 줄을 넣은 뒤 서버를 다시 실행하세요. "
                "(AI 없이도 위의 만세력·해석은 모두 동작합니다)",
            )
        try:
            import anthropic
        except ImportError:
            return self._text(503, "anthropic 패키지가 없습니다: pip3 install --user anthropic")

        user_msg = "[사주 데이터]\n" + chart
        if question:
            user_msg += "\n\n[사용자 질문]\n" + question

        client = anthropic.Anthropic(api_key=key)
        try:
            stream_ctx = client.beta.messages.stream(
                model=MODEL,
                max_tokens=8000,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_msg}],
                betas=["server-side-fallback-2026-07-01"],
                extra_body={
                    "thinking": {"type": "adaptive"},
                    "output_config": {"effort": "low"},
                    "fallbacks": "default",
                },
            )
            stream = stream_ctx.__enter__()
        except anthropic.AuthenticationError:
            return self._text(401, "API 키가 올바르지 않습니다. .env의 ANTHROPIC_API_KEY를 확인해 주세요.")
        except anthropic.RateLimitError:
            return self._text(429, "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.")
        except anthropic.APIStatusError as e:
            return self._text(502, "AI 호출 실패 (%s): %s" % (e.status_code, e.message))
        except anthropic.APIConnectionError:
            return self._text(502, "Anthropic API에 연결할 수 없습니다. 네트워크를 확인해 주세요.")

        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()
        try:
            for text in stream.text_stream:
                self.wfile.write(text.encode("utf-8"))
                self.wfile.flush()
            final = stream.get_final_message()
            if final.stop_reason == "refusal":
                self.wfile.write("\n\n(AI가 이 요청에 대한 답변을 거절했습니다.)".encode("utf-8"))
            elif final.stop_reason == "max_tokens":
                self.wfile.write("\n\n(답변이 길어 중간에 잘렸습니다.)".encode("utf-8"))
        except (BrokenPipeError, ConnectionResetError):
            pass
        except anthropic.APIError as e:
            try:
                self.wfile.write(("\n\n(스트리밍 중 오류: %s)" % e).encode("utf-8"))
            except OSError:
                pass
        finally:
            stream_ctx.__exit__(None, None, None)
        self.close_connection = True


def main():
    handler = partial(Handler, directory=STATIC)
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    print("사주 만세력: http://localhost:%d  (AI 해석: %s)" % (PORT, "사용 가능" if load_key() else "키 없음 - 선택 기능"))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
