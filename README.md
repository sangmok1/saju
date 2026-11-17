# 사주 만세력

생년월일시를 입력하면 사주 원국, 대운, 세운을 계산하고 해석해 주는 로컬 웹앱입니다.
계산과 기본 해석은 모두 브라우저에서 처리합니다.

## 실행

```bash
python3 server.py
```

브라우저에서 http://localhost:8787 을 엽니다.

## AI 심층 해석 (선택)

Claude로 심층 해석을 받으려면 Anthropic API 키가 필요합니다.

```bash
pip3 install --user anthropic
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env
```

`.env`는 `.gitignore`에 들어 있어 커밋되지 않습니다.

## 사용한 라이브러리

- [lunar-javascript](https://github.com/6tail/lunar-javascript) (`static/vendor/lunar.js`): 음양력 변환과 간지 계산
