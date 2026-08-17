"""
Study Buddy Steve — AI parsing service.

FastAPI app that accepts a syllabus file (PDF / DOCX / image / text), extracts
the raw text, and returns structured calendar events.

Run:
    uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

from fastapi import FastAPI, File, HTTPException, UploadFile

from extractor import extract_text
from parser import parse_text

app = FastAPI(title="Study Buddy Steve Parser", version="0.2.0")


@app.get("/health")
def health():
    return {"ok": True, "service": "steve-parser"}


@app.post("/parse")
async def parse(file: UploadFile = File(...)):
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        text = extract_text(file.filename or "upload", data)
    except ImportError as e:
        # A required extractor dependency isn't installed.
        raise HTTPException(
            status_code=501,
            detail=f"Extraction dependency missing: {e}. See requirements.txt.",
        )
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=422, detail=f"Could not read file: {e}")

    result = parse_text(text)
    result["filename"] = file.filename
    result["charCount"] = len(text)
    return result
