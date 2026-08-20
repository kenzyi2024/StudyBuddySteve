# Python FastAPI parser — needs Tesseract (OCR) and Poppler (PDF rasterizing)
FROM python:3.11-slim

# System deps for OCR + scanned-PDF support.
RUN apt-get update && apt-get install -y --no-install-recommends \
      tesseract-ocr \
      poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080

# Cloud Run injects PORT (8080); shell form so ${PORT} expands (default 8080).
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}
