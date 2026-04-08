"""
Community posts and replies: Supabase CRUD operations.
"""

from supabase import Client

from app.models.community import PostDetail, PostListResponse, PostSummary, ReplyOut


def list_community_posts(
    client: Client,
    course_code: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> PostListResponse:
    offset = (page - 1) * page_size
    query = client.table("community_posts_with_author").select("*", count="exact")
    if course_code:
        query = query.eq("course_code", course_code)
    response = query.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
    posts = [PostSummary.model_validate(row) for row in (response.data or [])]
    total = response.count or 0
    return PostListResponse(posts=posts, total=total, page=page, page_size=page_size)


def create_community_post(
    client: Client,
    user_id: str,
    title: str,
    body: str,
    course_code: str | None = None,
) -> PostSummary:
    row: dict = {"user_id": user_id, "title": title, "body": body}
    if course_code:
        row["course_code"] = course_code
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


def create_community_reply(client: Client, user_id: str, post_id: str, body: str) -> None:
    check = client.table("community_posts").select("id").eq("id", post_id).limit(1).execute()
    if not check.data:
        raise LookupError(f"Post {post_id} not found")
    client.table("community_replies").insert(
        {"user_id": user_id, "post_id": post_id, "body": body}
    ).execute()
