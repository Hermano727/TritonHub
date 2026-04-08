"""
SunSET grade distribution: converts a raw DB row into a structured
SunsetGradeDistribution with a computed SetSummary.
"""

from __future__ import annotations

import re
from typing import Any

from app.models.domain import SunsetGradeDistributionRow
from app.models.research import SetSummary, SunsetGradeDistribution

_GRADE_TO_GPA: dict[str, float] = {
    "A+": 4.0, "A": 4.0, "A-": 3.7,
    "B+": 3.3, "B": 3.0, "B-": 2.7,
    "C+": 2.3, "C": 2.0, "C-": 1.7,
    "D+": 1.3, "D": 1.0, "D-": 0.7,
    "F": 0.0,
}


def _parse_count(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        try:
            return int(value)
        except Exception:
            return 0
    s = re.sub(r"[^0-9.\-]", "", str(value).strip().replace(",", ""))
    try:
        return int(float(s))
    except Exception:
        return 0


def _parse_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = re.sub(r"[^0-9.\-]", "", str(value).strip().replace(",", ""))
    if not s:
        return None
    try:
        return float(s)
    except Exception:
        return None


def _compute_set_summary(payload: dict[str, Any]) -> SetSummary:
    nested = payload.get("distribution")
    grade_dist = nested if isinstance(nested, dict) else payload
    counts: dict[str, int] = {}
    total = 0
    weighted = 0.0

    for k, v in (grade_dist or {}).items():
        label = str(k).strip()
        cnt = _parse_count(v)
        if cnt <= 0:
            continue
        counts[label] = counts.get(label, 0) + cnt
        total += cnt
        if label in _GRADE_TO_GPA:
            weighted += cnt * _GRADE_TO_GPA[label]

    explicit_avg = _parse_float(payload.get("average_gpa"))
    explicit_total = _parse_count(payload.get("total_students")) or None
    avg = explicit_avg if explicit_avg is not None else ((weighted / total) if total > 0 else None)

    median: float | None = None
    if total > 0:
        bucketed = [(gpa, cnt) for lbl, cnt in counts.items() if (gpa := _GRADE_TO_GPA.get(lbl)) is not None]
        if bucketed:
            bucketed.sort(key=lambda x: -x[0])
            cum = 0
            half = total / 2.0
            for gpa, cnt in bucketed:
                cum += cnt
                if cum >= half:
                    median = gpa
                    break

    passing = sum(cnt for lbl, cnt in counts.items() if (_GRADE_TO_GPA.get(lbl) or 0) > 0)
    pass_rate = (passing / total * 100.0) if total > 0 else None
    sample_size = explicit_total if explicit_total is not None else (total if total > 0 else None)

    return SetSummary(
        average_gpa=round(avg, 2) if avg is not None else None,
        median_gpa=round(median, 2) if median is not None else None,
        pass_rate_percent=round(pass_rate, 1) if pass_rate is not None else None,
        sample_size=sample_size,
        grade_counts=counts,
    )


def build_sunset_grade_distribution(
    row: SunsetGradeDistributionRow | None,
    *,
    is_cross_course_fallback: bool = False,
    source_course_code: str | None = None,
) -> SunsetGradeDistribution | None:
    if row is None:
        return None
    summary = _compute_set_summary(row.grade_distribution or {})
    return SunsetGradeDistribution(
        term_label=row.term_label,
        professor_name=row.professor_name or None,
        grade_distribution=row.grade_distribution,
        recommend_professor_percent=row.recommend_professor_percent,
        submission_time=row.submission_time,
        source_url=row.source_url,
        set_summary=summary,
        is_cross_course_fallback=is_cross_course_fallback,
        source_course_code=source_course_code if is_cross_course_fallback else None,
    )
