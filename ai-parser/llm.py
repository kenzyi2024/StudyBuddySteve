"""
LLM "smart path" — resolves messy / relative dates the regex fast path misses,
e.g. "the Friday before Thanksgiving", "two weeks after the midterm",
"the last day of classes".

Provider-agnostic: uses Anthropic if ANTHROPIC_API_KEY is set, else OpenAI if
OPENAI_API_KEY is set. If neither is present (or the call fails), every function
degrades to a no-op so the fast path still works. Nothing here is required for
the service to run.
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime

# Cues that suggest a date the regex layer probably can't resolve on its own.
RELATIVE_CUES = re.compile(
    r"\b(the\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)"
    r"|before|after|following|prior to|week of|last day|first day"
    r"|thanksgiving|spring break|fall break|winter break|reading (?:day|week)"
    r"|labor day|memorial day|finals week|end of (?:the )?semester)\b",
    re.I,
)

MODEL_ANTHROPIC = os.environ.get("STEVE_ANTHROPIC_MODEL", "claude-sonnet-5")
MODEL_OPENAI = os.environ.get("STEVE_OPENAI_MODEL", "gpt-4o-mini")

SYSTEM = (
    "You extract academic deadlines from syllabus text. Resolve every date to a "
    "concrete calendar date, including relative ones (e.g. 'the Friday before "
    "Thanksgiving'). Use the provided term/year for context. Respond with ONLY a "
    "JSON object, no prose."
)

SCHEMA_HINT = (
    'Return: {"events":[{"title":str,"type":one of '
    '["assignment","exam","quiz","reading","other"],'
    '"due":"YYYY-MM-DDTHH:MM:SS","allDay":bool,"confidence":0..1}]}'
)


def smart_available() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("OPENAI_API_KEY"))


def has_relative_dates(text: str) -> bool:
    return bool(RELATIVE_CUES.search(text))


def _build_prompt(text: str, term: str | None, base_year: int | None) -> str:
    ctx = []
    if term:
        ctx.append(f"Term: {term}.")
    if base_year:
        ctx.append(f"Assume year {base_year} unless a date states otherwise.")
    ctx.append(SCHEMA_HINT)
    ctx.append("Syllabus text follows:\n---\n" + text[:12000])
    return "\n".join(ctx)


def _call_anthropic(prompt: str) -> str:
    import requests  # lazy

    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": MODEL_ANTHROPIC,
            "max_tokens": 2000,
            "system": SYSTEM,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=45,
    )
    resp.raise_for_status()
    data = resp.json()
    return "".join(block.get("text", "") for block in data.get("content", []))


def _call_openai(prompt: str) -> str:
    import requests  # lazy

    resp = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}",
            "Content-Type": "application/json",
        },
        json={
            "model": MODEL_OPENAI,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=45,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _extract_json(raw: str) -> dict:
    """Pull the first JSON object out of the model response, tolerantly."""
    raw = raw.strip()
    # strip ```json fences if present
    raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.I | re.M).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.S)
        if m:
            return json.loads(m.group(0))
    return {}


VALID_TYPES = {"assignment", "exam", "quiz", "reading", "other"}


def _normalize(events: list[dict]) -> list[dict]:
    out = []
    for e in events or []:
        due = e.get("due")
        if not due:
            continue
        # validate the date; drop anything unparseable
        try:
            dt = datetime.fromisoformat(due.replace("Z", ""))
        except (ValueError, AttributeError):
            continue
        out.append(
            {
                "title": (e.get("title") or "Deadline")[:120],
                "type": e.get("type") if e.get("type") in VALID_TYPES else "other",
                "due": dt.replace(second=0, microsecond=0).isoformat(),
                "allDay": bool(e.get("allDay", False)),
                "confidence": float(e.get("confidence", 0.8)),
                "source": {"method": "llm"},
            }
        )
    return out


def extract_events_llm(text: str, term: str | None, base_year: int | None) -> list[dict]:
    """Return LLM-extracted events, or [] if unavailable / on any error."""
    if not smart_available():
        return []
    prompt = _build_prompt(text, term, base_year)
    try:
        raw = _call_anthropic(prompt) if os.environ.get("ANTHROPIC_API_KEY") else _call_openai(prompt)
    except Exception:
        return []
    return _normalize(_extract_json(raw).get("events", []))
