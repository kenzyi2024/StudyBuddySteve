"""
Study Buddy Steve — AI parsing service (stub).

FastAPI app exposing /parse. This stub wires up the structure and a naive
regex date extractor so the pipeline is runnable end-to-end. Swap in the LLM
smart-path and OCR where marked with TODO.
"""
from __future__ import annotations

import io
import re
from datetime import datetime

import dateparser
from fastapi import FastAPI, UploadFile, File

app = FastAPI(title="Study Buddy Steve Parser")

# Very rough keyword -> event-type mapping for the demo.
TYPE_KEYWORDS = {
    "exam": "exam",
    "midterm": "exam",
    "final": "exam",
    "quiz": "quiz",
    "assignment": "assignment",
    "homework": "assignment",
    "problem set": "assignment",
    "pset": "assignment",
    "reading": "reading",
    "due": "assignment",
}

DATE_LINE = re.compile(r"(.{0,60}?)\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|"
                       r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2})",
                       re.IGNORECASE)


def extract_text(filename: str, data: bytes) -> str:
    """Extract raw text from PDF / DOCX / image. TODO: OCR + pdfplumber + docx."""
    name = filename.lower()
    if name.endswith(".txt"):
        return data.decode("utf-8", errors="ignore")
    # TODO: pdfplumber for .pdf, python-docx for .docx, pytesseract for images.
    return data.decode("utf-8", errors="ignore")


def guess_type(context: str) -> str:
    low = context.lower()
    for kw, t in TYPE_KEYWORDS.items():
        if kw in low:
            return t
    return "other"


def extract_events(text: str) -> list[dict]:
    """Naive regex + dateparser pass. Replace/augment with an LLM smart path."""
    events: list[dict] = []
    for context, raw_date in DATE_LINE.findall(text):
        dt = dateparser.parse(raw_date, settings={"PREFER_DATES_FROM": "future"})
        if not dt:
            continue
        title = context.strip(" -:\t") or "Untitled deadline"
        events.append(
            {
                "title": title[:120],
                "type": guess_type(context),
                "due": dt.isoformat(),
                "confidence": 0.55,  # regex path is low-confidence by design
                "source": {"snippet": context.strip()[:160]},
            }
        )
    return events


@app.get("/health")
def health():
    return {"ok": True, "service": "steve-parser"}


@app.post("/parse")
async def parse(file: UploadFile = File(...)):
    data = await file.read()
    text = extract_text(file.filename or "upload", data)
    events = extract_events(text)
    return {
        "course": None,  # TODO: infer course name/term from header text
        "parsedAt": datetime.utcnow().isoformat(),
        "events": events,
    }
