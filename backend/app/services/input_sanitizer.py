from __future__ import annotations

import html
import re
from typing import Any


SCRIPT_TAG_PATTERN = re.compile(r"<\s*script[^>]*>.*?<\s*/\s*script\s*>", re.IGNORECASE | re.DOTALL)
INLINE_EVENT_PATTERN = re.compile(r"\son\w+\s*=\s*(['\"]).*?\1", re.IGNORECASE | re.DOTALL)
JAVASCRIPT_URI_PATTERN = re.compile(r"javascript\s*:", re.IGNORECASE)


def sanitize_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = SCRIPT_TAG_PATTERN.sub("", value)
    cleaned = INLINE_EVENT_PATTERN.sub("", cleaned)
    cleaned = JAVASCRIPT_URI_PATTERN.sub("", cleaned)
    return html.escape(cleaned.strip(), quote=False)


def sanitize_payload(value: Any) -> Any:
    if isinstance(value, str):
        return sanitize_text(value)
    if isinstance(value, list):
        return [sanitize_payload(item) for item in value]
    if isinstance(value, dict):
        return {key: sanitize_payload(item) for key, item in value.items()}
    return value
