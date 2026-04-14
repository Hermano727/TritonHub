"""
Tier 0: Reddit search — no API key required.

Strategy (in order):
  1. Reddit public JSON API  — reddit.com/r/ucsd/search.json (no auth, just User-Agent)
  2. PullPush fallback        — api.pullpush.io (Pushshift successor, free, no key needed)

Both return RedditPost objects.  All errors return [] silently — callers never
need to handle Reddit failures.

No env vars required; the client works out-of-the-box.
"""

from __future__ import annotations

import asyncio
import logging

import httpx

from app.models.research import RedditPost

_log = logging.getLogger(__name__)

# Reddit's public JSON endpoints require a descriptive User-Agent or they 429.
_USER_AGENT = "Reg2Schedg/1.0 (academic planner; contact via GitHub)"

_REDDIT_SEARCH_URL = "https://www.reddit.com/r/ucsd/search.json"
_PULLPUSH_SEARCH_URL = "https://api.pullpush.io/reddit/search/submission/"

_TIMEOUT = 10.0
_MAX_COMMENT_CHARS = 400
_MAX_BODY_CHARS = 600


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def search_reddit_ucsd(
    course_code: str,
    *,
    max_posts: int = 10,
    timeout_seconds: float = _TIMEOUT,
) -> list[RedditPost]:
    """
    Search r/ucsd for posts mentioning course_code.

    Tries the Reddit public JSON API first; falls back to PullPush if Reddit
    returns fewer than 3 results.  Returns [] on any error.
    """
    try:
        return await asyncio.wait_for(
            _search_with_fallback(course_code, max_posts=max_posts),
            timeout=timeout_seconds,
        )
    except asyncio.TimeoutError:
        _log.warning("[reddit] search timed out for %s", course_code)
        return []
    except Exception as exc:
        _log.warning("[reddit] search failed for %s: %s", course_code, exc)
        return []


# ---------------------------------------------------------------------------
# Internal: Reddit public JSON API (Tier 0a)
# ---------------------------------------------------------------------------

async def _search_reddit_json(
    query: str,
    *,
    limit: int,
    client: httpx.AsyncClient,
) -> list[RedditPost]:
    """Hit reddit.com/r/ucsd/search.json — no auth, just User-Agent."""
    try:
        resp = await client.get(
            _REDDIT_SEARCH_URL,
            params={
                "q": query,
                "restrict_sr": "1",
                "sort": "relevance",
                "type": "link",
                "limit": str(min(limit, 25)),  # Reddit caps at 25 without auth
                "t": "all",
            },
        )
        if resp.status_code != 200:
            _log.debug("[reddit:json] status %s for %r", resp.status_code, query)
            return []

        data = resp.json()
        children = data.get("data", {}).get("children", [])
        posts: list[RedditPost] = []
        for child in children:
            p = child.get("data", {})
            title = p.get("title", "").strip()
            if not title:
                continue
            permalink = p.get("permalink", "")
            url = f"https://www.reddit.com{permalink}" if permalink else p.get("url", "")
            body = (p.get("selftext") or "")[:_MAX_BODY_CHARS]
            score = p.get("score", 0) or 0

            # Fetch top comments for this post
            top_comments = await _fetch_comments_reddit_json(permalink, client=client)

            posts.append(RedditPost(
                title=title,
                body=body,
                url=url,
                score=score,
                top_comments=top_comments,
            ))

        return posts

    except Exception as exc:
        _log.debug("[reddit:json] error for %r: %s", query, exc)
        return []


async def _fetch_comments_reddit_json(
    permalink: str,
    *,
    client: httpx.AsyncClient,
) -> list[str]:
    """Fetch the top 5 comments for a post via the .json endpoint."""
    if not permalink:
        return []
    try:
        url = f"https://www.reddit.com{permalink}.json?limit=5&sort=top"
        resp = await client.get(url)
        if resp.status_code != 200:
            return []
        data = resp.json()
        # data[1] is the comments listing
        if not isinstance(data, list) or len(data) < 2:
            return []
        comments_listing = data[1].get("data", {}).get("children", [])
        result: list[str] = []
        for child in comments_listing:
            body = child.get("data", {}).get("body", "")
            if body and body not in ("[deleted]", "[removed]"):
                result.append(body[:_MAX_COMMENT_CHARS])
            if len(result) >= 5:
                break
        return result
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Internal: PullPush fallback (Tier 0b)
# ---------------------------------------------------------------------------

async def _search_pullpush(
    query: str,
    *,
    limit: int,
    client: httpx.AsyncClient,
) -> list[RedditPost]:
    """
    Query PullPush (https://pullpush.io) — free Pushshift successor, no auth.
    Returns Reddit posts from r/ucsd sorted by most recent.
    """
    try:
        resp = await client.get(
            _PULLPUSH_SEARCH_URL,
            params={
                "q": query,
                "subreddit": "ucsd",
                "size": str(min(limit, 25)),
                "sort": "desc",
                "sort_type": "score",
            },
        )
        if resp.status_code != 200:
            _log.debug("[pullpush] status %s for %r", resp.status_code, query)
            return []

        data = resp.json()
        items = data.get("data", [])
        posts: list[RedditPost] = []
        for item in items:
            title = item.get("title", "").strip()
            if not title:
                continue
            permalink = item.get("permalink", "")
            if permalink and not permalink.startswith("http"):
                permalink = f"https://www.reddit.com{permalink}"
            elif not permalink:
                post_id = item.get("id", "")
                subreddit = item.get("subreddit", "ucsd")
                slug = item.get("url", post_id)
                permalink = f"https://www.reddit.com/r/{subreddit}/comments/{post_id}/"

            body = (item.get("selftext") or "")[:_MAX_BODY_CHARS]
            score = item.get("score", 0) or 0

            posts.append(RedditPost(
                title=title,
                body=body,
                url=permalink,
                score=score,
                top_comments=[],  # PullPush submission API doesn't include comments
            ))

        return posts

    except Exception as exc:
        _log.debug("[pullpush] error for %r: %s", query, exc)
        return []


# ---------------------------------------------------------------------------
# Internal: combined search with fallback
# ---------------------------------------------------------------------------

async def _search_with_fallback(
    course_code: str,
    *,
    max_posts: int,
) -> list[RedditPost]:
    headers = {"User-Agent": _USER_AGENT}

    async with httpx.AsyncClient(
        headers=headers,
        timeout=_TIMEOUT,
        follow_redirects=True,
    ) as client:
        # Primary: Reddit public JSON
        posts = await _search_reddit_json(course_code, limit=max_posts, client=client)
        _log.info("[reddit:json] %d posts for %r", len(posts), course_code)

        # Retry with numeric part only if too few results (e.g. "110" from "CSE 110")
        if len(posts) < 3:
            numeric = _extract_numeric_part(course_code)
            if numeric and numeric != course_code:
                extra = await _search_reddit_json(numeric, limit=max_posts - len(posts), client=client)
                seen = {p.url for p in posts}
                for p in extra:
                    if p.url not in seen:
                        posts.append(p)

        # Fallback: PullPush if still thin
        if len(posts) < 3:
            _log.info("[reddit] Reddit JSON thin (%d posts), trying PullPush for %r", len(posts), course_code)
            pp_posts = await _search_pullpush(course_code, limit=max_posts, client=client)
            seen = {p.url for p in posts}
            for p in pp_posts:
                if p.url not in seen:
                    posts.append(p)
            _log.info("[pullpush] total after fallback: %d posts for %r", len(posts), course_code)

    return posts[:max_posts]


def _extract_numeric_part(course_code: str) -> str | None:
    """'CSE 110' → '110', 'CSE 110L' → '110L'. Returns None if no numeric part found."""
    parts = course_code.strip().split()
    for part in reversed(parts):
        if part[0].isdigit() or (len(part) > 1 and part[:-1].isdigit()):
            return part
    return None
