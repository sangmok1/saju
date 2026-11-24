#!/usr/bin/env python3
"""사주 만세력 서버.

- 정적 파일(static/)을 제공한다. 만세력 계산과 기본 해석은 모두 브라우저에서 처리한다.
- POST /api/ai: AI 해석. 서버에 있는 Gemini 키로 서버가 대신 호출한다(방문자는 키 불필요).
  하루 전체 호출 수와 1인(IP)당 호출 수를 제한하고, 횟수는 GCS 파일에 남겨
  인스턴스가 재시작돼도 초기화되지 않게 한다.

실행: python3 server.py  →  http://localhost:8787
환경변수:
  GEMINI_API_KEY   Gemini API 키 (Cloud Run에서는 Secret Manager로 주입)
  USAGE_BUCKET     사용량을 저장할 GCS 버킷 (없으면 메모리에만 저장 — 로컬 개발용)
  AI_DAILY_LIMIT   하루 전체 상한 (기본 200)
  AI_PER_IP_LIMIT  1인 하루 상한 (기본 5)
"""
import datetime
import hashlib
import json
import os
import threading
import urllib.error
import urllib.parse
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")
PORT = int(os.environ.get("PORT", "8787"))
HOST = os.environ.get("HOST", "127.0.0.1")  # 컨테이너(Cloud Run)에서는 0.0.0.0

GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:streamGenerateContent?alt=sse"
DAILY_LIMIT = int(os.environ.get("AI_DAILY_LIMIT", "200"))
PER_IP_LIMIT = int(os.environ.get("AI_PER_IP_LIMIT", "5"))
USAGE_BUCKET = os.environ.get("USAGE_BUCKET", "")
MAX_BODY = 16 * 1024

SYSTEM_PROMPT = """당신은 한국 명리학(사주팔자)에 정통한 상담가입니다.
사용자의 원국·대운·세운은 이미 만세력 프로그램이 정확히 계산해 두었습니다. 기둥(간지)을 다시 계산하거나 바꾸지 말고, 주어진 데이터를 근거로 해석하세요.
프로그램이 제시한 용신은 규칙 기반 추정치이므로, 원국 전체(조후, 격국, 합충, 통근 여부)를 보고 동의하거나 다르게 판단되면 이유와 함께 말해 주세요.
사주 해석과 관계없는 요청(코드 작성, 다른 주제의 글쓰기 등)은 정중히 거절하고 사주 해석만 하세요.

다음 순서로 한국어 마크다운으로 답하세요(각 소제목은 '## '로 시작).

먼저 바쁜 사람이 이것만 읽어도 되는 요약을 씁니다:
## 핵심 요약
- **한 줄**: 이 사주를 한 문장으로
- **질문에 대한 결론**: 사용자가 질문을 남겼을 때만, 결론을 1~2문장으로 먼저
- **좋은 시기**: 2~3개. "2027~2036년(38~47세, 丙午 대운): 이유 한 줄" 형식
- **조심할 시기**: 2~3개. 같은 형식
- **올해·내년**: 각각 한 줄
시기는 데이터에 있는 대운 시작 연도와 세운 연도를 그대로 써서 연도와 나이를 함께 적고, 질문이 있으면 그 질문과 관련된 시기를 우선합니다.

그다음 상세 내용:
## 타고난 성향과 기질
## 사주의 구조와 용신 판단
## 재물·직업 방향
## 관계·배우자·가족
## 대운 흐름 (지금 대운과 앞으로의 큰 전환점)
## 올해와 내년
## 실천 조언 (3~5개, 구체적으로)
사용자가 질문을 남겼다면 마지막에 '## 질문에 대한 답'으로 근거를 자세히 풀어 주세요.

원칙: 근거가 되는 글자(예: 월지 午의 정관)를 짚으며 설명하고, 운명론적 단정·공포 조장·의료/법률/투자에 대한 확정적 지시는 피하며, 균형 있고 실용적으로 씁니다. 전체 분량은 1500~2500자 정도로 간결하게."""

# 브라우저 보안 헤더. 스크립트는 이 사이트 파일만 실행되고(인라인·외부 스크립트 차단),
# 네트워크 요청은 이 사이트로만 나갈 수 있다. 누가 페이지에 스크립트를 끼워 넣어도
# 실행되지 않고, 다른 서버로 정보를 빼돌리지 못하게 한다.
CSP = "; ".join([
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
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


# ---------- 사용량 제한 ----------
def kst_today():
    return (datetime.datetime.utcnow() + datetime.timedelta(hours=9)).strftime("%Y-%m-%d")


class Usage:
    """하루 사용량. GCS 객체(usage/YYYY-MM-DD.json)에 저장하고, 동시 수정은 generation 조건으로 막는다.
    IP는 그대로 저장하지 않고 날짜를 섞은 해시로만 남긴다."""

    def __init__(self, bucket):
        self.bucket = bucket
        self.lock = threading.Lock()
        self.mem = {}

    # --- GCS (메타데이터 서버 토큰, 표준 라이브러리만 사용) ---
    def _token(self):
        req = urllib.request.Request(
            "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
            headers={"Metadata-Flavor": "Google"})
        with urllib.request.urlopen(req, timeout=5) as r:
            return json.load(r)["access_token"]

    def _read(self, name, tok):
        url = f"https://storage.googleapis.com/storage/v1/b/{self.bucket}/o/{urllib.parse.quote(name, safe='')}?alt=media"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {tok}"})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                gen = r.headers.get("x-goog-generation", "0")
                return json.load(r), gen
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {"total": 0, "ip": {}}, "0"
            raise

    def _write(self, name, data, gen, tok):
        url = (f"https://storage.googleapis.com/upload/storage/v1/b/{self.bucket}/o"
               f"?uploadType=media&name={urllib.parse.quote(name, safe='')}&ifGenerationMatch={gen}")
        req = urllib.request.Request(url, data=json.dumps(data).encode(), method="POST",
                                     headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5):
                return True
        except urllib.error.HTTPError as e:
            if e.code == 412:  # 그사이 다른 요청이 먼저 수정함 → 다시 읽어서 재시도
                return False
            raise

    def change(self, ip, delta):
        """delta=+1: 한 번 쓰기(한도 초과면 None), -1: 실패 시 되돌리기. 반환: (전체 남은 수, 개인 남은 수)"""
        day = kst_today()
        who = hashlib.sha256(f"{day}|{ip}|saju".encode()).hexdigest()[:16]
        with self.lock:
            if not self.bucket:
                data = self.mem.setdefault(day, {"total": 0, "ip": {}})
                return self._apply(data, who, delta)
            name = f"usage/{day}.json"
            tok = self._token()
            for _ in range(5):
                data, gen = self._read(name, tok)
                res = self._apply(data, who, delta)
                if res is None:
                    return None
                if self._write(name, data, gen, tok):
                    return res
            raise RuntimeError("사용량 기록 충돌")

    @staticmethod
    def _apply(data, who, delta):
        mine = data["ip"].get(who, 0)
        if delta > 0 and (data["total"] >= DAILY_LIMIT or mine >= PER_IP_LIMIT):
            return None
        data["total"] = max(0, data["total"] + delta)
        data["ip"][who] = max(0, mine + delta)
        return DAILY_LIMIT - data["total"], PER_IP_LIMIT - data["ip"][who]


USAGE = Usage(USAGE_BUCKET)


class Handler(SimpleHTTPRequestHandler):
    server_version = "saju"
    sys_version = ""
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".webmanifest": "application/manifest+json"}

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
        if self.path.split("?")[0].endswith((".js", ".css", ".html", "/")) or self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    # ---------- AI ----------
    def client_ip(self):
        # Cloud Run(구글 프런트엔드)은 실제 접속 IP를 X-Forwarded-For 마지막에 붙인다.
        # 앞쪽 값은 방문자가 임의로 넣을 수 있으므로 쓰지 않는다.
        xff = self.headers.get("X-Forwarded-For", "")
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        return parts[-1] if parts else self.client_address[0]

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/api/ai":
            self.send_error(404)
            return
        # 다른 사이트에서 이 API를 몰래 호출하지 못하게 같은 출처만 허용
        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "")
        if origin and urllib.parse.urlparse(origin).netloc != host:
            self.send_json(403, {"error": "허용되지 않은 요청입니다."})
            return
        if not GEMINI_KEY:
            self.send_json(503, {"error": "AI 해석이 아직 설정되지 않았습니다."})
            return
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n <= 0 or n > MAX_BODY:
                raise ValueError
            req = json.loads(self.rfile.read(n))
            chart = str(req.get("chart", ""))[:6000]
            q = str(req.get("q", ""))[:500]
            if not chart.strip():
                raise ValueError
        except Exception:
            self.send_json(400, {"error": "잘못된 요청입니다."})
            return

        ip = self.client_ip()
        try:
            left = USAGE.change(ip, +1)
        except Exception:
            self.send_json(503, {"error": "잠시 후 다시 시도해 주세요."})
            return
        if left is None:
            self.send_json(429, {"error": f"오늘 AI 해석 사용 한도에 도달했습니다. (1인 하루 {PER_IP_LIMIT}회, 전체 하루 {DAILY_LIMIT}회) 내일 다시 이용해 주세요."})
            return

        user_msg = "[사주 데이터]\n" + chart + (("\n\n[사용자 질문]\n" + q) if q.strip() else "")
        payload = json.dumps({
            "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [{"role": "user", "parts": [{"text": user_msg}]}],
            "generationConfig": {"maxOutputTokens": 8192},
        }).encode()
        up = urllib.request.Request(GEMINI_URL, data=payload, method="POST",
                                    headers={"Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY})
        try:
            resp = urllib.request.urlopen(up, timeout=120)
        except urllib.error.HTTPError as e:
            USAGE.change(ip, -1)
            print("gemini error", e.code, e.read()[:300], flush=True)
            msg = "요청이 많아 잠시 후 다시 시도해 주세요." if e.code == 429 else f"AI 서버 오류입니다 ({e.code}). 잠시 후 다시 시도해 주세요."
            self.send_json(502, {"error": msg})
            return
        except Exception as e:
            USAGE.change(ip, -1)
            print("gemini connect error", e, flush=True)
            self.send_json(502, {"error": "AI 서버에 연결하지 못했습니다."})
            return

        # 응답은 한 줄에 JSON 하나씩(NDJSON) 흘려보낸다: {"t": 글}, 끝에 {"done": 사유, "left": 남은 횟수}
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()
        finish, got = "", False

        def emit(obj):
            self.wfile.write((json.dumps(obj, ensure_ascii=False) + "\n").encode())
            self.wfile.flush()

        try:
            with resp:
                for raw in resp:
                    line = raw.decode("utf-8", "replace").strip()
                    if not line.startswith("data:"):
                        continue
                    try:
                        ev = json.loads(line[5:])
                    except ValueError:
                        continue
                    cands = ev.get("candidates") or []
                    if not cands:
                        if (ev.get("promptFeedback") or {}).get("blockReason"):
                            finish = "BLOCKED"
                        continue
                    c = cands[0]
                    text = "".join(p.get("text", "") for p in (c.get("content") or {}).get("parts", []) if not p.get("thought"))
                    if text:
                        got = True
                        emit({"t": text})
                    if c.get("finishReason"):
                        finish = c["finishReason"]
            if not got:
                left = USAGE.change(ip, -1) or left
            emit({"done": finish, "left": {"total": left[0], "mine": left[1], "perIp": PER_IP_LIMIT}})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            print("stream error", e, flush=True)
            try:
                emit({"error": "응답을 받는 중 연결이 끊겼습니다."})
            except Exception:
                pass


def main():
    handler = partial(Handler, directory=STATIC)
    httpd = ThreadingHTTPServer((HOST, PORT), handler)
    print("사주 만세력: http://localhost:%d (AI %s)" % (PORT, "사용" if GEMINI_KEY else "키 없음"), flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
