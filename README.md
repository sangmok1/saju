# 사주 만세력

생년월일시를 입력하면 사주 원국, 대운, 세운을 계산하고 해석해 주는 로컬 웹앱입니다.
계산과 기본 해석은 모두 브라우저에서 처리합니다.

## 실행

```bash
python3 server.py
```

브라우저에서 http://localhost:8787 을 엽니다.

## AI 심층 해석 (Gemini)

방문자는 키 없이 [AI 해석 받기]를 누르면 됩니다. 서버가 `gemini-3.5-flash-lite`를 대신 호출합니다.

- 키: 서버 환경변수 `GEMINI_API_KEY` (Cloud Run에서는 Secret Manager `gemini-api-key`를 주입)
- 사용 제한: 하루 전체 `AI_DAILY_LIMIT`(200)회, 1인(IP) 하루 `AI_PER_IP_LIMIT`(5)회. 한국 시간 자정에 초기화
- 사용량 기록: `USAGE_BUCKET`(GCS)의 `usage/날짜.json`. IP는 해시로만 남고 30일 뒤 자동 삭제. 버킷이 없으면 메모리에만 저장(로컬용)
- 시스템 프롬프트는 서버에 있어 사주 해석 외 용도로 쓰기 어렵습니다.

로컬에서 AI까지 쓰려면: `GEMINI_API_KEY=... python3 server.py`

## 배포 (Cloud Run)

```bash
gcloud run deploy saju --source . --project personal-stock-trader --region asia-northeast3 \
  --service-account saju-runtime@personal-stock-trader.iam.gserviceaccount.com --max-instances 1 \
  --set-secrets=GEMINI_API_KEY=gemini-api-key:latest \
  --set-env-vars=USAGE_BUCKET=personal-stock-trader-saju-usage,AI_DAILY_LIMIT=200,AI_PER_IP_LIMIT=5
```

`saju-runtime` 계정은 위 시크릿 읽기와 사용량 버킷 쓰기 권한만 있습니다.

## 사용한 라이브러리

- [lunar-javascript](https://github.com/6tail/lunar-javascript) (`static/vendor/lunar.js`): 음양력 변환과 간지 계산
