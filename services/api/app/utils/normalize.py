"""
Canonical normalization helpers shared across the entire backend.

All modules that need to normalize course codes or professor names must import
from here — never reimplement locally — so that cache keys, signature hashes,
and DB lookups are always identical.
"""

from __future__ import annotations

import hashlib
import re


def normalize_course_code(course_code: str) -> str:
    """
    'cse  110 ' → 'CSE 110'
    Collapses internal whitespace and upper-cases.
    """
    return " ".join(course_code.upper().split())


def normalize_professor_name(professor_name: str | None) -> str:
    """
    'Bryan  chin' → 'BRYAN CHIN'
    Accepts None → returns ''.
    """
    return " ".join((professor_name or "").upper().split())


def normalize_professor_name_loose(professor_name: str | None) -> str:
    """
    Like normalize_professor_name but strips trailing middle initials.

    This bridges the gap between names stored from sunset_grade_distributions
    (e.g. 'CHIN, BRYAN W.') and names parsed from WebReg screenshots by Gemini
    (e.g. 'Chin, Bryan' — no middle initial).

    'CHIN, BRYAN W.'        → 'CHIN, BRYAN'
    'COTTRELL, GARRISON W'  → 'COTTRELL, GARRISON'
    'POLITZ, JOSEPH GIBBS'  → 'POLITZ, JOSEPH GIBBS'  (GIBBS is not an initial)
    'HUANG, RUANQIANQIAN (LISA)' → 'HUANG, RUANQIANQIAN (LISA)'  (no change)
    'Bryan Chin'            → 'BRYAN CHIN'  (no comma format, no change)
    """
    normalized = normalize_professor_name(professor_name)
    if "," in normalized:
        last, rest = normalized.split(",", 1)
        # Strip one or more trailing single-letter words (with optional period)
        rest = re.sub(r"(\s+[A-Z]\.?)+$", "", rest.rstrip())
        normalized = f"{last},{rest}" if rest.strip() else last.strip()
    return normalized


def compute_schedule_signature(entries: list[tuple[str, str | None]]) -> str:
    """
    Deterministically hash a list of (course_code, professor_name) pairs into a
    hex SHA-256 signature.

    Input is first normalized and lexicographically sorted so that the same set of
    courses always produces the same signature regardless of upload order.

    Args:
        entries: list of (course_code, professor_name_or_None) tuples.

    Returns:
        64-char lowercase hex SHA-256 digest.

    Example:
        >>> compute_schedule_signature([("CSE 110", "Smith"), ("MATH 20C", None)])
        'abc123...'
    """
    normalized = sorted(
        f"{normalize_course_code(code)}|{normalize_professor_name(prof)}"
        for code, prof in entries
    )
    raw = "|".join(normalized)
    return hashlib.sha256(raw.encode()).hexdigest()
