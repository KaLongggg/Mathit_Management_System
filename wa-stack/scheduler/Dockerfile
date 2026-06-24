FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# ?? make stdout/err unbuffered so `docker logs` shows immediately
ENV PYTHONUNBUFFERED=1

CMD ["python", "app.py"]
