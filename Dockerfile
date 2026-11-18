FROM python:3.12-slim
WORKDIR /app
COPY server.py .
COPY static ./static
# 코드 파일은 root 소유·읽기 전용, 서버는 권한 없는 사용자로 실행 → 컨테이너 안에서 코드 수정 불가
RUN chmod -R a-w /app && useradd --no-create-home --shell /usr/sbin/nologin app
USER app
ENV HOST=0.0.0.0 PORT=8080 PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
CMD ["python3", "server.py"]
