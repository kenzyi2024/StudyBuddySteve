# AI Parser — Python Document & Date Extraction Service

A small FastAPI service that turns an unstructured syllabus into structured
calendar events. The Node gateway calls this over HTTP.

## Pipeline
1. **Ingest** — detect file type (PDF / DOCX / image).
2. **Text extraction**
   - PDF → `pdfplumber` (falls back to OCR for scanned PDFs)
   - DOCX → `python-docx`
   - Image → `pytesseract` OCR
3. **Date & entity extraction**
   - Fast path: regex + `dateparser` for explicit dates ("Due: Oct 20").
   - Smart path: an LLM prompt that returns strict JSON of
     `{course, title, type, due, confidence}` for messy / relative dates
     ("the Friday before Thanksgiving").
4. **Normalize** — resolve relative dates against the term calendar, dedupe,
   attach confidence + source snippet.

## Endpoints
```
POST /parse            # multipart file -> { course, events: [...] }
GET  /health
```

## Run
```bash
cd ai-parser
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
