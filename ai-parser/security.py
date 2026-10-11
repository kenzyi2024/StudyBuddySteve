"""
Caller authentication for the parser service.

The parser is reachable on a public Cloud Run URL and may hold an LLM API key,
so only the gateway should be able to call /parse. The gateway sends a shared
secret in the X-Parser-Key header; when PARSER_SHARED_SECRET is unset (local
dev) every caller is allowed.
"""
from __future__ import annotations

import hmac

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # matches the gateway's multer limit


def is_authorized(provided: str | None, secret: str | None) -> bool:
    if not secret:
        return True
    if not provided:
        return False
    return hmac.compare_digest(provided.encode(), secret.encode())
