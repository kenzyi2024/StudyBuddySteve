"""
Text extraction from syllabus files: PDF, DOCX, images, and plain text.

Heavy third-party libraries are imported lazily inside each function so this
module imports cleanly even when they aren't installed (e.g. in CI or when only
the date logic is under test).
"""
from __future__ import annotations

import io
import os


def _ext(filename: str) -> str:
    return os.path.splitext(filename or "")[1].lower()


def from_pdf(data: bytes) -> str:
    """Extract text from a PDF. Falls back to OCR for scanned/image PDFs."""
    import pdfplumber  # lazy

    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text_parts.append(page_text)

    text = "\n".join(text_parts).strip()
    # If the PDF yielded almost nothing, it's probably scanned -> OCR it.
    if len(text) < 40:
        try:
            text = _ocr_pdf(data)
        except Exception:
            pass
    return text


def _ocr_pdf(data: bytes) -> str:
    """OCR a scanned PDF by rasterizing pages (requires pdf2image + tesseract)."""
    from pdf2image import convert_from_bytes  # lazy
    import pytesseract  # lazy

    images = convert_from_bytes(data)
    return "\n".join(pytesseract.image_to_string(img) for img in images)


def from_docx(data: bytes) -> str:
    """Extract text from a .docx, including tables (common for syllabus schedules)."""
    import docx  # python-docx, lazy

    document = docx.Document(io.BytesIO(data))
    parts: list[str] = [p.text for p in document.paragraphs]
    for table in document.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells]
            # keep row cells on one line so "Week 3 | Oct 20 | Midterm" stays together
            parts.append(" | ".join(c for c in cells if c))
    return "\n".join(parts).strip()


def from_image(data: bytes) -> str:
    """OCR an image (PNG/JPG) of a syllabus."""
    from PIL import Image  # lazy
    import pytesseract  # lazy

    img = Image.open(io.BytesIO(data))
    return pytesseract.image_to_string(img).strip()


def extract_text(filename: str, data: bytes) -> str:
    """Dispatch to the right extractor based on file extension / content type."""
    ext = _ext(filename)
    if ext == ".pdf":
        return from_pdf(data)
    if ext in (".docx", ".doc"):
        return from_docx(data)
    if ext in (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp"):
        return from_image(data)
    # plain text / unknown -> best-effort decode
    return data.decode("utf-8", errors="ignore")
