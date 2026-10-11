"""
Study Buddy Steve — AI parsing service.

FastAPI app that accepts a syllabus file (PDF / DOCX / image / text), extracts
the raw text, and returns structured calendar events.

Run:
    uvicorn main:app --reload --port 8000
"""
from __future__ import annotations

import os

from fastapi import FastAPI, File, Header, HTTPException, UploadFile

from extractor import extract
from parser import parse as parse_syllabus
from security import MAX_UPLOAD_BYTES, is_authorized

app = FastAPI(title="Study Buddy Steve Parser", version="0.2.0")

SHARED_SECRET = os.environ.get("PARSER_SHARED_SECRET", "")
if not SHARED_SECRET:
    print("⚠  PARSER_SHARED_SECRET not set — /parse accepts any caller (dev only).")


@app.get("/health")
def health():
    return {"ok": True, "service": "steve-parser"}


@app.post("/parse")
async def parse(
    file: UploadFile = File(...),
    x_parser_key: str | None = Header(default=None),
):
    if not is_authorized(x_parser_key, SHARED_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 20 MB)")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        extraction = extract(file.filename or "upload", data)
    except ImportError as e:
        raise HTTPException(
            status_code=501,
            detail=f"Extraction dependency missing: {e}. See requirements.txt.",
        )
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=422, detail=f"Could not read file: {e}")

    result = parse_syllabus(extraction)
    result["filename"] = file.filename
    result["charCount"] = len(extraction.get("text", ""))
    result["tableCount"] = len(extraction.get("tables", []))
    return result
