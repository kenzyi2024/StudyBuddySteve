"""
Turn raw syllabus text into structured calendar events.

Two-tier by design:
  * fast path (this module): regex + dateparser over each line — cheap, covers
    well-formatted syllabi and schedule tables.
  * smart path (llm.py, optional): hand messy/relative dates to an LLM.

Every event carries a confidence score and source snippet so the review UI can
flag the ones a human should double-check.
"""
from __future__ import annotations

import re
from datetime import datetime

try:  # dateparser is the preferred engine; fall back if unavailable
    import dateparser

    _HAS_DATEPARSER = True
except Exception:  # pragma: no cover
    dateparser = None
    _HAS_DATEPARSER = False


# --- event typing ------------------------------------------------------

# Ordered: earlier keywords win when several match.
TYPE_KEYWORDS = [
    ("exam", ["final exam", "midterm", "exam", "test"]),
    ("quiz", ["quiz"]),
    ("assignment", ["problem set", "pset", "assignment", "homework", "hw",
                    "lab", "project", "essay", "paper", "report", "due"]),
    ("reading", ["reading", "read ", "chapter", "ch.", "textbook"]),
]

MONTHS = ("jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec"
          "|january|february|march|april|june|july|august|september"
          "|october|november|december")

# Matches: "Oct 20", "October 20th", "10/20", "10/20/2026", "2026-10-20"
DATE_PATTERNS = [
    re.compile(rf"\b(?:{MONTHS})\.?\s+\d{{1,2}}(?:st|nd|rd|th)?(?:,?\s*\d{{4}})?\b", re.I),
    re.compile(r"\b\d{1,2}/\d{1,2}(?:/\d{2,4})?\b"),
    re.compile(r"\b\d{4}-\d{1,2}-\d{1,2}\b"),
]

TIME_PATTERN = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)\b", re.I)

# Header hints for course code + term.
COURSE_CODE = re.compile(r"\b([A-Z]{2,4})\s?-?\s?(\d{2,4}[A-Z]?)\b")
TERM_RE = re.compile(r"\b(fall|spring|summer|winter)\s+(\d{4})\b", re.I)


def guess_type(context: str) -> str:
    low = context.lower()
    for label, kws in TYPE_KEYWORDS:
        if any(kw in low for kw in kws):
            return label
    return "other"


def find_course(text: str) -> str | None:
    """Infer a course code from the first chunk of the document."""
    head = "\n".join(text.splitlines()[:15])
    m = COURSE_CODE.search(head)
    return f"{m.group(1)} {m.group(2)}" if m else None


def find_term(text: str) -> str | None:
    head = "\n".join(text.splitlines()[:20])
    m = TERM_RE.search(head)
    return f"{m.group(1).title()} {m.group(2)}" if m else None


def _parse_date(raw: str, base_year: int | None) -> datetime | None:
    settings = {"PREFER_DATES_FROM": "future"}
    if base_year:
        settings["RELATIVE_BASE"] = datetime(base_year, 1, 1)
    if _HAS_DATEPARSER:
        return dateparser.parse(raw, settings=settings)
    return _fallback_parse(raw, base_year)


def _fallback_parse(raw: str, base_year: int | None) -> datetime | None:
    """Minimal parser used only when dateparser isn't installed."""
    raw = raw.strip()
    year = base_year or datetime.now().year
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            pass
    # "Oct 20" / "October 20th"
    cleaned = re.sub(r"(st|nd|rd|th)", "", raw, flags=re.I)
    for fmt in ("%b %d", "%B %d", "%b %d %Y", "%B %d %Y"):
        try:
            dt = datetime.strptime(cleaned, fmt)
            return dt.replace(year=year) if dt.year == 1900 else dt
        except ValueError:
            pass
    return None


TYPE_HINT_WORDS = re.compile(
    r"\b(exam|midterm|final|quiz|test|problem set|pset|assignment|homework|hw|"
    r"lab|project|essay|paper|report|reading|response|proposal|draft)\b",
    re.I,
)
# Noise to strip from candidate titles: times, "due", table week markers, "at".
NOISE = re.compile(
    r"(\b\d{1,2}(?::\d{2})?\s*[ap]\.?m\.?\b"      # 11:59pm
    r"|\bfrom\b|\bto\b|\bat\b|\bdue\b"            # filler words
    r"|\bweek\s*\d+\b)",                          # "Week 5"
    re.I,
)


def _clean(fragment: str) -> str:
    fragment = re.sub(r"[|\t]+", " ", fragment)
    fragment = NOISE.sub(" ", fragment)
    fragment = fragment.strip(" -–—:•.,\t")
    return re.sub(r"\s+", " ", fragment)


def _title_from(line: str, date_span: tuple[int, int]) -> str:
    """Use the text around the date as the event title, cleaned up.

    Prefer whichever side names an actual deliverable (exam, quiz, essay…);
    otherwise fall back to the side with more words. Times and filler words are
    stripped so titles read cleanly.
    """
    before = _clean(line[: date_span[0]])
    after = _clean(line[date_span[1]:])

    before_has = bool(TYPE_HINT_WORDS.search(before))
    after_has = bool(TYPE_HINT_WORDS.search(after))

    if before_has and not after_has:
        candidate = before
    elif after_has and not before_has:
        candidate = after
    else:
        candidate = before if len(before.split()) >= len(after.split()) else after

    return candidate[:120] or "Deadline"


def _confidence(raw_date: str, had_time: bool, type_: str) -> float:
    score = 0.6
    if re.search(r"\d{4}", raw_date) or "/" in raw_date:
        score += 0.15  # explicit numeric date
    if had_time:
        score += 0.1
    if type_ != "other":
        score += 0.1
    return round(min(score, 0.99), 2)


def extract_events(text: str) -> list[dict]:
    base_year = None
    term = find_term(text)
    if term:
        base_year = int(term.split()[-1])

    seen: set[tuple[str, str]] = set()
    events: list[dict] = []

    for line in text.splitlines():
        line = line.strip()
        if len(line) < 4:
            continue

        for pat in DATE_PATTERNS:
            m = pat.search(line)
            if not m:
                continue
            raw_date = m.group(0)
            dt = _parse_date(raw_date, base_year)
            if not dt:
                continue

            # attach a time if the line has one
            had_time = False
            tm = TIME_PATTERN.search(line)
            if tm:
                hh = int(tm.group(1)) % 12
                if tm.group(3).lower().startswith("p"):
                    hh += 12
                mm = int(tm.group(2) or 0)
                dt = dt.replace(hour=hh, minute=mm)
                had_time = True

            title = _title_from(line, m.span())
            type_ = guess_type(line)

            key = (title.lower(), dt.strftime("%Y-%m-%d"))
            if key in seen:
                break
            seen.add(key)

            events.append(
                {
                    "title": title,
                    "type": type_,
                    "due": dt.replace(second=0, microsecond=0).isoformat(),
                    "allDay": not had_time,
                    "confidence": _confidence(raw_date, had_time, type_),
                    "source": {"snippet": line[:160]},
                }
            )
            break  # one event per line

    events.sort(key=lambda e: e["due"])
    return events


def parse_text(text: str) -> dict:
    return {
        "course": find_course(text),
        "term": find_term(text),
        "parsedAt": datetime.utcnow().isoformat(),
        "events": extract_events(text),
    }
