"""
Browser Use Cloud integration: client setup, task prompt construction,
JSON output parsing, and single-course logistics execution.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

from pydantic import ValidationError

from app.models.research import (
    CourseLogistics,
    CourseRunCost,
    CourseRunOutcome,
    CourseResearchRunError,
)


# ---------------------------------------------------------------------------
# Client setup
# ---------------------------------------------------------------------------

def resolve_browser_use_api_key() -> str:
    for env_name in ("BROWSER_USE_API_KEY", "BROWSERUSE_API_KEY", "BROWSER_USE_KEY"):
        api_key = os.getenv(env_name)
        if api_key:
            if not api_key.startswith("bu_"):
                raise RuntimeError(
                    f"{env_name} was found, but Browser Use Cloud keys should start with 'bu_'."
                )
            os.environ["BROWSER_USE_API_KEY"] = api_key
            return api_key
    raise RuntimeError(
        "Missing Browser Use API key. Set BROWSER_USE_API_KEY in your environment or .env file."
    )


def create_browser_use_client(api_key: str) -> Any:
    try:
        from browser_use_sdk.v3 import AsyncBrowserUse
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Browser Use Cloud SDK v3 is not available in this environment. "
            "Run `pip install --upgrade browser-use-sdk` and try again."
        ) from exc
    return AsyncBrowserUse(api_key=api_key)


# ---------------------------------------------------------------------------
# Task prompt
# ---------------------------------------------------------------------------

def _normalize_param(value: str | None, *, fallback: str) -> str:
    cleaned = " ".join((value or "").split())
    return cleaned or fallback


def build_task(course: str, instructor: str | None) -> str:
    subject = _normalize_param(course, fallback="unknown course")
    normalized_instructor = _normalize_param(instructor, fallback="unknown")
    if normalized_instructor == "unknown":
        instructor_rule = (
            "- The instructor is unknown, so leave Rate My Professors fields null unless an exact "
            "UCSD match is obvious.\n"
        )
    else:
        instructor_rule = (
            f"- The instructor is {normalized_instructor}. Use that exact UCSD instructor for Rate "
            "My Professors.\n"
        )

    return (
        f"Find a fast, minimal data snapshot for {subject}.\n\n"
        "Priority sources:\n"
        "1. Official UCSD course webpage, syllabus, department page, or podcast/lecture page.\n"
        "2. Rate My Professors page for the UCSD instructor.\n"
        "3. Reddit — search reddit.com/r/ucsd for the course code and professor. "
        "If you see a relevant thread title, you MUST click the link and read the actual post body "
        "and top-voted comments. Do not stop at search results — navigate into the thread.\n"
        "4. Other public web pages only if the first three source types do not answer a field.\n\n"
        "Reddit deep-click protocol:\n"
        f"- Search Google for: site:reddit.com/r/ucsd {subject}\n"
        "- If no results, navigate directly to reddit.com/r/ucsd and use the subreddit search bar.\n"
        "- When you see a thread title that matches the course, CLICK IT and load the page.\n"
        "- If a sign-in or age-verification overlay appears, dismiss it or scroll past it.\n"
        "- Read the original post body and the top 3 upvoted comments.\n"
        "- Extract a verbatim quote (do not paraphrase) and record the direct permalink URL.\n\n"
        "Goal:\n"
        "Return only these fields:\n"
        "- attendance_required as true or false\n"
        "- grade_breakdown as one short string\n"
        "- course_webpage_url\n"
        "- textbook_required as true or false\n"
        "- podcasts_available as true or false\n"
        "- student_sentiment_summary as one short sentence based only on Reddit and Rate My Professors\n"
        "- rate_my_professor.rating\n"
        "- rate_my_professor.would_take_again_percent\n"
        "- rate_my_professor.difficulty\n"
        "- rate_my_professor.url\n"
        "- evidence: array of objects, each with:\n"
        "    source: 'Reddit Insight' | 'Syllabus Snippet' | 'Course Page' | 'RMP'\n"
        "    content: exact verbatim quote from the page (never paraphrase)\n"
        "    url: direct permalink to the post, comment, or page\n"
        "    relevance_score: 0.0 to 1.0\n"
        "  If you opened a Reddit thread and found relevant content, evidence MUST contain at least one entry.\n"
        "  If evidence is empty but you saw a relevant thread title, go back and click it.\n"
        "- professor_info_found: set to false ONLY if no specific RMP data, no Reddit posts, and no syllabus\n"
        "  were found for this specific professor teaching this course. Otherwise set to true.\n"
        "- general_course_overview: populate ONLY if professor_info_found is false. Write 2-3 sentences\n"
        "  describing the course's content and learning objectives from the UCSD catalog or department page.\n"
        "- general_professor_overview: populate ONLY if professor_info_found is false. Write 1-2 sentences\n"
        "  about the professor's background, research area, or teaching style from their UCSD faculty page.\n\n"
        "Fallback behavior when professor_info_found is false:\n"
        "1. Search the UCSD course catalog for the course description and learning objectives.\n"
        "2. Search for the professor's UCSD faculty or department page.\n"
        "3. Search Rate My Professors for the professor by name (e.g. 'Bryan Chin UCSD') — "
        "their overall RMP profile applies regardless of which course they teach, so always populate "
        "rate_my_professor fields if you find their profile, even if they haven't taught this specific course before.\n"
        "4. Synthesize both to write a student_sentiment_summary that sets expectations.\n"
        "5. Populate general_course_overview and general_professor_overview with factual summaries.\n\n"
        "Rules:\n"
        "- Prefer official UCSD pages for attendance, grading, textbook, podcasts, and course webpage.\n"
        "- For course_webpage_url: return the actual human-readable web page URL (not a CSV export, not a file download). "
        "A valid URL loads in a browser as a readable page, not a file download. "
        "If the only URL you found is a download link (e.g. ends in .csv, .xlsx, or contains 'export' or 'download'), set course_webpage_url to null.\n"
        "- Prefer Rate My Professors only for the instructor stats fields.\n"
        "- Use Reddit and Rate My Professors for student_sentiment_summary, not official UCSD pages.\n"
        "- Keep student_sentiment_summary concise and balanced, summarizing common opinions rather than a single extreme review.\n"
        f"{instructor_rule}"
        "- Only use an official course page or syllabus if the page clearly matches both the course code and the requested instructor.\n"
        "- If an official page is for the same course code but a different instructor, do not use it for course_webpage_url or any logistics fields.\n"
        "- Verify the instructor from the page header, syllabus, or another explicit page element before using that source.\n"
        "- If you cannot find an official UCSD page that matches the requested instructor, return null for course_webpage_url and any official-page-only fields you cannot confirm.\n"
        "- If multiple official UCSD pages match both the course and instructor, choose the most recent quarter.\n"
        "- Compare quarter recency chronologically. Example: Spring 2026 is newer than Winter 2026, which is newer than Fall 2025.\n"
        "- Prefer the most recent official UCSD offering that matches both the course and instructor, but instructor match is more important than quarter recency.\n"
        "- Use null for any field you cannot confirm quickly.\n"
        "- Keep the run short and stop once the requested fields are filled or confirmed unavailable.\n"
        "- Return raw JSON only. Do not include markdown fences, explanations, or extra text.\n"
    )


# ---------------------------------------------------------------------------
# Output parsing
# ---------------------------------------------------------------------------

def _summarize_output(output: Any) -> str:
    if output is None:
        return "None"
    if isinstance(output, str):
        return repr(output[:200])
    return repr(output)[:200]


def _extract_first_json_object(text: str) -> str | None:
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start: index + 1]
    return None


def _iter_json_candidates(text: str) -> list[str]:
    stripped = text.strip()
    candidates: list[str] = [stripped]
    for match in re.finditer(r"```(?:json)?\s*(.*?)```", stripped, re.DOTALL | re.IGNORECASE):
        block = match.group(1).strip()
        if block:
            candidates.append(block)
    extracted = _extract_first_json_object(stripped)
    if extracted:
        candidates.append(extracted)
    seen: set[str] = set()
    unique: list[str] = []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            unique.append(c)
    return unique


def parse_course_logistics_output(raw_output: Any) -> CourseLogistics:
    if isinstance(raw_output, CourseLogistics):
        return raw_output
    if isinstance(raw_output, str):
        last_error: ValidationError | None = None
        for candidate in _iter_json_candidates(raw_output):
            try:
                return CourseLogistics.model_validate_json(candidate)
            except ValidationError as exc:
                last_error = exc
            try:
                return CourseLogistics.model_validate(json.loads(candidate))
            except (ValidationError, json.JSONDecodeError):
                continue
        if last_error is not None:
            raise last_error
        return CourseLogistics.model_validate_json(raw_output)
    return CourseLogistics.model_validate(raw_output)


# ---------------------------------------------------------------------------
# Cost helpers
# ---------------------------------------------------------------------------

def _parse_cost(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def build_cost_metadata(result: Any) -> CourseRunCost:
    return CourseRunCost(
        session_id=str(getattr(result, "id", "")) or None,
        status=str(getattr(result, "status", "")) or None,
        llm_cost_usd=_parse_cost(getattr(result, "llm_cost_usd", None)),
        browser_cost_usd=_parse_cost(getattr(result, "browser_cost_usd", None)),
        proxy_cost_usd=_parse_cost(getattr(result, "proxy_cost_usd", None)),
        total_cost_usd=_parse_cost(getattr(result, "total_cost_usd", None)),
    )


# ---------------------------------------------------------------------------
# Single-course execution
# ---------------------------------------------------------------------------

async def run_course_logistics(
    client: Any,
    course_code: str,
    instructor: str | None,
    model: str,
) -> CourseRunOutcome:
    run = client.run(build_task(course_code, instructor), model=model)
    async for _ in run:
        pass

    if run.result is None:
        raise CourseResearchRunError("Browser Use run completed without a result.")

    cost = build_cost_metadata(run.result)
    raw_output = getattr(run.result, "output", None)

    try:
        logistics = parse_course_logistics_output(raw_output)
    except ValidationError as exc:
        status = getattr(run.result, "status", None)
        last_step_summary = getattr(run.result, "last_step_summary", None)
        raise CourseResearchRunError(
            "Browser Use returned non-structured output "
            f"(status={status!r}, last_step_summary={last_step_summary!r}, "
            f"output={_summarize_output(raw_output)}). Validation error: {exc}",
            cost=cost,
        ) from exc

    return CourseRunOutcome(logistics=logistics, cost=cost)
