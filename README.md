# 사주 만세력

생년월일시를 입력하면 사주 원국, 대운, 세운을 계산하고 해석해 주는 로컬 웹앱입니다.
계산과 기본 해석은 모두 브라우저에서 처리합니다.

## 실행

```bash
python3 server.py
```

브라우저에서 http://localhost:8787 을 엽니다.

## AI 심층 해석 (선택, Gemini)

결과 화면 아래 "AI 심층 해석"에 Gemini API 키를 넣으면 AI 해석을 받을 수 있습니다.

1. [Google AI Studio](https://aistudio.google.com/apikey)에서 API 키를 발급받습니다.
2. 화면의 키 입력칸에 붙여넣고 [저장]을 누릅니다.
3. (선택) 궁금한 점을 적고 [AI 해석 받기]를 누릅니다.

- 키는 이 브라우저(localStorage)에만 저장되고, 서버나 저장소에는 남지 않습니다. [삭제]로 지울 수 있습니다.
- 해석을 요청할 때 브라우저가 Google Gemini API(`gemini-2.5-flash`)로 직접 보냅니다.
- 비용은 [AI 해석 받기]를 누를 때만 1회 나갑니다. 생년월일 계산은 브라우저에서 처리해 무료입니다.

## 사용한 라이브러리

- [lunar-javascript](https://github.com/6tail/lunar-javascript) (`static/vendor/lunar.js`): 음양력 변환과 간지 계산
