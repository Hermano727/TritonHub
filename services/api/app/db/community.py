"""
Community posts and replies: Supabase CRUD operations.
"""

from supabase import Client

from app.models.community import (
    NotificationOut,
    PostDetail,
    PostListResponse,
    PostSummary,
    ReplyOut,
)


def list_community_posts(
    client: Client,
    course_code: str | None = None,
    professor_name: str | None = None,
    search: str | None = None,
    sort_by: str = "newest",
    department: str | None = None,
    course_number: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PostListResponse:
    offset = (page - 1) * page_size
    query = client.table("community_posts_with_author").select("*", count="exact")

    # Legacy exact filters (kept for any direct API usage)
    if course_code:
        query = query.eq("course_code", course_code)
    if professor_name:
        query = query.ilike("professor_name", f"%{professor_name}%")

    # Department / course-number hierarchical filter
    if department and course_number:
        query = query.ilike("course_code", f"{department} {course_number}")
    elif department:
        query = query.ilike("course_code", f"{department} %")
    elif course_number:
        query = query.ilike("course_code", f"% {course_number}")

    # Full-text search across title + body
    if search:
        query = query.ilike("title", f"%{search}%")

    # Ordering
    if sort_by == "best":
        # Supabase PostgREST doesn't support computed order; order by upvote_count desc as proxy.
        # downvote_count is available but composite expressions need raw SQL / RPC.
        query = query.order("upvote_count", desc=True).order("created_at", desc=True)
    else:
        query = query.order("created_at", desc=True)

    response = query.range(offset, offset + page_size - 1).execute()
    posts = [PostSummary.model_validate(row) for row in (response.data or [])]
    total = response.count or 0
    return PostListResponse(posts=posts, total=total, page=page, page_size=page_size)


def get_departments(client: Client) -> list[str]:
    """Return distinct department prefixes (e.g. CSE, MATH) from posts with a course_code."""
    resp = (
        client.table("community_posts")
        .select("course_code")
        .not_.is_("course_code", "null")
        .execute()
    )
    seen: set[str] = set()
    for row in resp.data or []:
        code = (row.get("course_code") or "").strip()
        if " " in code:
            dept = code.split(" ")[0].upper()
            seen.add(dept)
    return sorted(seen)


def create_community_post(
    client: Client,
    user_id: str,
    title: str,
    body: str,
    course_code: str | None = None,
    professor_name: str | None = None,
    is_anonymous: bool = False,
    general_tags: list[str] | None = None,
) -> PostSummary:
    row: dict = {
        "user_id": user_id,
        "title": title,
        "body": body,
        "is_anonymous": is_anonymous,
        "general_tags": general_tags or [],
    }
    if course_code:
        row["course_code"] = course_code
    if professor_name:
        row["professor_name"] = professor_name
    insert_resp = client.table("community_posts").insert(row).execute()
    post_id = insert_resp.data[0]["id"]
    fetch_resp = (
        client.table("community_posts_with_author")
        .select("*")
        .eq("id", post_id)
        .single()
        .execute()
    )
    return PostSummary.model_validate(fetch_resp.data)


def get_community_post_with_replies(client: Client, post_id: str) -> PostDetail | None:
    post_resp = (
        client.table("community_posts_with_author")
        .select("*")
        .eq("id", post_id)
        .limit(1)
        .execute()
    )
    if not post_resp.data:
        return None
    replies_resp = (
        client.table("community_replies_with_author")
        .select("*")
        .eq("post_id", post_id)
        .order("created_at")
        .execute()
    )
    replies = [ReplyOut.model_validate(r) for r in (replies_resp.data or [])]
    return PostDetail(**PostSummary.model_validate(post_resp.data[0]).model_dump(), replies=replies)


def create_community_reply(
    client: Client,
    user_id: str,
    post_id: str,
    body: str,
    parent_reply_id: str | None = None,
    is_anonymous: bool = False,
) -> None:
    check = client.table("community_posts").select("id").eq("id", post_id).limit(1).execute()
    if not check.data:
        raise LookupError(f"Post {post_id} not found")
    row: dict = {
        "user_id": user_id,
        "post_id": post_id,
        "body": body,
        "is_anonymous": is_anonymous,
    }
    if parent_reply_id:
        row["parent_reply_id"] = parent_reply_id
    client.table("community_replies").insert(row).execute()


# ---------------------------------------------------------------------------
# Post votes
# ---------------------------------------------------------------------------

def toggle_upvote(client: Client, post_id: str, user_id: str) -> tuple[bool, int]:
    """Toggle an upvote on a post. Returns (upvoted, new_upvote_count)."""
    existing = (
        client.table("community_post_upvotes")
        .select("post_id")
        .eq("post_id", post_id)
        .eq("user_id", user_id)
        .execute()
    )
    if existing.data:
        client.table("community_post_upvotes").delete().eq("post_id", post_id).eq(
            "user_id", user_id
        ).execute()
        upvoted = False
    else:
        client.table("community_post_upvotes").insert(
            {"post_id": post_id, "user_id": user_id}
        ).execute()
        upvoted = True

        # Notify post author (skip self-upvote)
        post_resp = (
            client.table("community_posts")
            .select("user_id, title")
            .eq("id", post_id)
            .limit(1)
            .execute()
        )
        if post_resp.data:
            post_data = post_resp.data[0]
            if post_data["user_id"] != user_id:
                client.table("notifications").insert(
                    {
                        "user_id": post_data["user_id"],
                        "type": "upvote",
                        "payload": {"post_id": post_id, "post_title": post_data["title"]},
                    }
                ).execute()

    count_resp = (
        client.table("community_post_upvotes")
        .select("*", count="exact")
        .eq("post_id", post_id)
        .execute()
    )
    return upvoted, count_resp.count or 0


def toggle_post_downvote(
    client: Client, post_id: str, user_id: str
) -> tuple[bool, int, int]:
    """Toggle a downvote on a post. Returns (downvoted, upvote_count, downvote_count)."""
    existing = (
        client.table("community_post_downvotes")
        .select("post_id")
        .eq("post_id", post_id)
        .eq("user_id", user_id)
        .execute()
    )
    if existing.data:
        client.table("community_post_downvotes").delete().eq("post_id", post_id).eq(
            "user_id", user_id
        ).execute()
        downvoted = False
    else:
        client.table("community_post_downvotes").insert(
            {"post_id": post_id, "user_id": user_id}
        ).execute()
        downvoted = True

    up_resp = (
        client.table("community_post_upvotes")
        .select("*", count="exact")
        .eq("post_id", post_id)
        .execute()
    )
    down_resp = (
        client.table("community_post_downvotes")
        .select("*", count="exact")
        .eq("post_id", post_id)
        .execute()
    )
    return downvoted, up_resp.count or 0, down_resp.count or 0


# ---------------------------------------------------------------------------
# Reply votes
# ---------------------------------------------------------------------------

def toggle_reply_upvote(
    client: Client, reply_id: str, user_id: str
) -> tuple[bool, int, int]:
    """Toggle an upvote on a reply. Returns (upvoted, upvote_count, downvote_count)."""
    existing = (
        client.table("community_reply_upvotes")
        .select("reply_id")
        .eq("reply_id", reply_id)
        .eq("user_id", user_id)
        .execute()
    )
    if existing.data:
        client.table("community_reply_upvotes").delete().eq("reply_id", reply_id).eq(
            "user_id", user_id
        ).execute()
        upvoted = False
    else:
        client.table("community_reply_upvotes").insert(
            {"reply_id": reply_id, "user_id": user_id}
        ).execute()
        upvoted = True

    up_resp = (
        client.table("community_reply_upvotes")
        .select("*", count="exact")
        .eq("reply_id", reply_id)
        .execute()
    )
    down_resp = (
        client.table("community_reply_downvotes")
        .select("*", count="exact")
        .eq("reply_id", reply_id)
        .execute()
    )
    return upvoted, up_resp.count or 0, down_resp.count or 0


def toggle_reply_downvote(
    client: Client, reply_id: str, user_id: str
) -> tuple[bool, int, int]:
    """Toggle a downvote on a reply. Returns (downvoted, upvote_count, downvote_count)."""
    existing = (
        client.table("community_reply_downvotes")
        .select("reply_id")
        .eq("reply_id", reply_id)
        .eq("user_id", user_id)
        .execute()
    )
    if existing.data:
        client.table("community_reply_downvotes").delete().eq("reply_id", reply_id).eq(
            "user_id", user_id
        ).execute()
        downvoted = False
    else:
        client.table("community_reply_downvotes").insert(
            {"reply_id": reply_id, "user_id": user_id}
        ).execute()
        downvoted = True

    up_resp = (
        client.table("community_reply_upvotes")
        .select("*", count="exact")
        .eq("reply_id", reply_id)
        .execute()
    )
    down_resp = (
        client.table("community_reply_downvotes")
        .select("*", count="exact")
        .eq("reply_id", reply_id)
        .execute()
    )
    return downvoted, up_resp.count or 0, down_resp.count or 0


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

def get_notifications(
    client: Client, user_id: str, limit: int = 20
) -> list[NotificationOut]:
    resp = (
        client.table("notifications")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return [NotificationOut.model_validate(row) for row in (resp.data or [])]


def mark_notifications_read(client: Client, user_id: str) -> None:
    client.table("notifications").update({"read": True}).eq("user_id", user_id).eq(
        "read", False
    ).execute()


def get_user_posts(client: Client, user_id: str) -> list[PostSummary]:
    resp = (
        client.table("community_posts_with_author")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    return [PostSummary.model_validate(row) for row in (resp.data or [])]
