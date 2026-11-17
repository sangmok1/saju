FROM python:3.12-slim
WORKDIR /app
COPY server.py .
COPY static ./static
ENV HOST=0.0.0.0 PORT=8080 PYTHONUNBUFFERED=1
CMD ["python3", "server.py"]
