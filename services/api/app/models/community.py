from typing import Optional
from pydantic import Field

from app.models.domain import CamelModel


class CreatePostRequest(CamelModel):
    title: str
    body: str
    course_code: Optional[str] = None
    professor_name: Optional[str] = None
    is_anonymous: bool = False
    general_tags: list[str] = Field(default_factory=list)


class CreateReplyRequest(CamelModel):
    body: str
    parent_reply_id: Optional[str] = None
    is_anonymous: bool = False


class PostSummary(CamelModel):
    id: str
    user_id: str
    title: str
    body: str
    course_code: Optional[str] = None
    professor_name: Optional[str] = None
    is_anonymous: bool = False
    general_tags: list[str] = Field(default_factory=list)
    author_display_name: str
    created_at: str
    updated_at: str
    reply_count: int = 0
    upvote_count: int = 0
    downvote_count: int = 0
    user_has_upvoted: bool = False
    user_has_downvoted: bool = False


class ReplyOut(CamelModel):
    id: str
    post_id: str
    user_id: str
    body: str
    parent_reply_id: Optional[str] = None
    is_anonymous: bool = False
    author_display_name: str
    created_at: str
    updated_at: str
    upvote_count: int = 0
    downvote_count: int = 0
    user_has_upvoted: bool = False
    user_has_downvoted: bool = False


class PostDetail(PostSummary):
    replies: list[ReplyOut] = Field(default_factory=list)


class PostListResponse(CamelModel):
    posts: list[PostSummary]
    total: int
    page: int
    page_size: int


class UpvoteResponse(CamelModel):
    """Kept for backward compatibility."""
    upvoted: bool
    upvote_count: int


class VoteResponse(CamelModel):
    voted: bool
    upvote_count: int
    downvote_count: int


class NotificationOut(CamelModel):
    id: str
    user_id: str
    type: str
    payload: Optional[dict] = None
    read: bool
    created_at: str
