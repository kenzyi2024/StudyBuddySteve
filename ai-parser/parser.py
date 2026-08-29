"""
Turn syllabus content into structured calendar events.

Parsing strategy, best-first:
  1. LLM smart path (llm.py) — if an API key is set. Handles any layout.
  2. Table path — for schedule tables (most syllabi). Walks each row, splits the
     deadline cell into bullets, and dates each one. Far more accurate than flat
     text because it never interleaves columns.
  3. Flat-text regex — last-resort for prose syllabi with no table.

Every event: {title, type, due (ISO), allDay, confidence, source}.
Types: reading | homework | quiz | exam | project | study | other.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta

try:
    import dateparser
    _HAS_DATEPARSER = True
except Exception:  # pragma: no cover
    dateparser = None
    _HAS_DATEPARSER = False


MONTHS_RE = (r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?")
NUM_DATE = re.compile(r"\b(\d{1,2}/\d{1,2}(?:/\d{2,4})?)\b")
MON_DATE = re.compile(rf"\b({MONTHS_RE}\s+\d{{1,2}})(?:,?\s*(\d{{4}}))?", re.I)
TIME_RE = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)\b", re.I)
WEEK_LINE = re.compile(r"(?i)^\s*week\s*\d")
COURSE_CODE = re.compile(r"\b([A-Z]{2,4})\s?-?\s?(\d{2,4}[A-Z]?)\b")
TERM_RE = re.compile(r"\b(fall|spring|summer|winter)\s+(\d{4})\b", re.I)

# Insert bullet boundaries before action verbs so merged cells split cleanly.
VERB_SPLIT = re.compile(
    r"(?<=[a-z0-9)\.]) (?=(?:Submit|Read|Review|Start|Prepare|Complete|Watch|Install|Take|Brief|Quiz|Exam)\b)"
)


def _parse(s: str):
    if not s:
        return None
    if _HAS_DATEPARSER:
        return dateparser.parse(s, settings={"PREFER_DATES_FROM": "future"})
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%B %d %Y", "%b %d %Y", "%B %d", "%b %d"):
        try:
            return datetime.strptime(s.strip(), fmt)
        except ValueError:
            pass
    return None


def _clamp_year(dt, base_year):
    # syllabi often have a stray wrong year ("Nov 2 - Nov 6, 2025"); snap up.
    if dt and base_year and dt.year < base_year:
        return dt.replace(year=base_year)
    return dt


# --- typing ------------------------------------------------------------

def classify(text: str) -> str:
    s = text.lower()
    if "prepar" in s or "start working" in s or "review all" in s:
        return "study"
    if "exam" in s or "midterm" in s or "final" in s and "exam" in s:
        return "exam"
    if "quiz" in s:
        return "quiz"
    if s.startswith("read") or ("chapter" in s and "section" in s and "submit" not in s):
        return "reading"
    if "online problem" in s or "problem set" in s or "pset" in s:
        return "homework"
    if "homework" in s or re.search(r"\bhw\b", s):
        return "homework"
    if "project" in s or "proposal" in s or "paper" in s or "essay" in s:
        return "project"
    if "read" in s:
        return "reading"
    return "other"


# --- header inference --------------------------------------------------

def find_course(text: str):
    head = "\n".join(text.splitlines()[:15])
    m = COURSE_CODE.search(head)
    return f"{m.group(1)} {m.group(2)}" if m else None


def find_term(text: str):
    head = "\n".join(text.splitlines()[:25])
    m = TERM_RE.search(head)
    return f"{m.group(1).title()} {m.group(2)}" if m else None


def _base_year(text: str, term):
    if term:
        return int(term.split()[-1])
    m = re.search(r"\b(20\d{2})\b", text)
    return int(m.group(1)) if m else datetime.now().year


# --- table path --------------------------------------------------------

def _week_end(cell: str, base_year: int):
    flat = cell.replace("\n", " ")
    yr = re.search(r"\b(20\d{2})\b", flat)
    y = int(yr.group(1)) if yr else base_year
    months = MON_DATE.findall(flat)
    if months:
        return _clamp_year(_parse(f"{months[-1][0]} {y}"), base_year)
    return None


def _bullets(cell: str, week_end, base_year: int) -> list[dict]:
    flat = re.sub(r"\s*\n\s*", " ", cell)
    flat = VERB_SPLIT.sub(" • ", flat)
    out = []
    for part in flat.split("•"):
        p = part.strip(" -•\t")
        if len(p) < 5 or WEEK_LINE.search(p):
            continue
        nums = NUM_DATE.findall(p)
        due = None
        all_day = True
        if nums:
            due = _clamp_year(_parse(nums[-1]), base_year)
            all_day = False
            tm = TIME_RE.findall(p)
            if tm and due:
                hh = int(tm[-1][0]) % 12
                if tm[-1][2].lower().startswith("p"):
                    hh += 12
                due = due.replace(hour=hh, minute=int(tm[-1][1] or 0))
            elif due:
                due = due.replace(hour=23, minute=59)  # dated deadline -> end of day
        else:
            due = week_end
        if not due:
            continue
        title = re.sub(r"\([^)]*\d{1,2}/\d{1,2}/\d{2,4}[^)]*\)", "", p)
        if "exam" in p.lower():
            title = re.sub(r"\bopens?\b.*$", "", title, flags=re.I)
        title = re.sub(r"\s+", " ", title).strip(" .,-")
        if len(title) < 4 or not re.search(r"[A-Za-z]", title):
            continue
        out.append(
            {
                "title": title[:120],
                "type": classify(p),
                "due": due,
                "allDay": all_day,
                "confidence": 0.9 if not all_day else 0.75,
            }
        )
    return out


def _events_from_tables(tables, base_year: int) -> list[dict]:
    events = []
    for table in tables:
        for row in table:
            cells = [c or "" for c in row]
            if not any(cells):
                continue
            week_cell = next((c for c in cells if re.search(r"(?i)week\s*\d", c)), cells[0])
            # the deadline cell has the most bullets / submit / read cues
            deadline_cell = max(
                cells,
                key=lambda c: c.count("•") + c.lower().count("submit") + c.lower().count("read"),
            )
            events += _bullets(deadline_cell, _week_end(week_cell, base_year), base_year)
    return events


# --- flat-text fallback ------------------------------------------------

def _events_from_text(text: str, base_year: int) -> list[dict]:
    events = []
    for line in text.splitlines():
        line = line.strip()
        if len(line) < 5 or WEEK_LINE.search(line):
            continue
        m = NUM_DATE.search(line) or MON_DATE.search(line)
        if not m:
            continue
        due = _clamp_year(_parse(m.group(0)), base_year)
        if not due:
            continue
        tm = TIME_RE.search(line)
        all_day = True
        if tm:
            hh = int(tm.group(1)) % 12
            if tm.group(3).lower().startswith("p"):
                hh += 12
            due = due.replace(hour=hh, minute=int(tm.group(2) or 0))
            all_day = False
        else:
            due = due.replace(hour=23, minute=59)
            all_day = False
        title = re.sub(r"\([^)]*\)", "", line[: m.start()] + " " + line[m.end():])
        title = re.sub(r"\s+", " ", title).strip(" .,-:•")
        if len(title) < 4:
            continue
        events.append(
            {"title": title[:120], "type": classify(line), "due": due, "allDay": all_day, "confidence": 0.6}
        )
    return events


# --- study-session generation -----------------------------------------

def _study_sessions(events: list[dict]) -> list[dict]:
    extra = []
    for e in events:
        if e["type"] == "exam" and e.get("due"):
            for days, label in ((3, "Study session"), (1, "Final review")):
                d = e["due"] - timedelta(days=days)
                extra.append(
                    {
                        "title": f"{label}: {e['title'][:50]}",
                        "type": "study",
                        "due": d.replace(hour=0, minute=0),
                        "allDay": True,
                        "confidence": 0.7,
                        "suggested": True,
                    }
                )
    return extra


# --- dedupe + finalize -------------------------------------------------

def _dedupe(events: list[dict]) -> list[dict]:
    seen = {}
    for e in sorted(events, key=lambda x: x["due"]):
        key = re.sub(r"[^a-z0-9]", "", e["title"].lower())
        if key and key not in seen:
            seen[key] = e
    return list(seen.values())


def _to_iso(events: list[dict]) -> list[dict]:
    for e in events:
        due = e["due"]
        e["due"] = (due.replace(second=0, microsecond=0).isoformat() if hasattr(due, "isoformat") else str(due))
        e.setdefault("source", {"method": "table"})
    return events


# --- entry point -------------------------------------------------------

def parse(extraction: dict, use_llm: bool = True) -> dict:
    """extraction = {'text': str, 'tables': [...]} from extractor.extract()."""
    text = extraction.get("text", "") or ""
    tables = extraction.get("tables", []) or []
    term = find_term(text)
    base_year = _base_year(text, term)

    events: list[dict] = []
    method = "table"

    # 1) LLM path (best) if configured
    if use_llm:
        try:
            from llm import smart_available, extract_events_llm

            if smart_available():
                llm_events = extract_events_llm(text, term, base_year)
                if llm_events:
                    events = llm_events
                    method = "llm"
        except Exception:
            pass

    # 2) table path
    if not events and tables:
        events = _events_from_tables(tables, base_year)
        method = "table"

    # 3) flat-text fallback
    if not events:
        events = _events_from_text(text, base_year)
        method = "text"

    events = _dedupe(events)
    # Note: personalized study sessions are generated by the gateway's study
    # planner (from the student's quiz prefs), not here.
    events.sort(key=lambda x: x["due"])
    events = _to_iso(events)

    return {
        "course": find_course(text),
        "term": term,
        "method": method,
        "parsedAt": datetime.utcnow().isoformat(),
        "events": events,
    }


# Backwards-compatible wrapper (text-only callers).
def parse_text(text: str, use_llm: bool = True) -> dict:
    return parse({"text": text, "tables": []}, use_llm=use_llm)
