"""Google Calendar OAuth + sync routes."""

from __future__ import annotations

import secrets
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

from app.auth.deps import get_current_user_access
from app.config import get_settings

router = APIRouter(prefix="/calendar", tags=["calendar"])

# In-memory stores — sufficient for development.
# In production, persist these in the database.
_pending_auth: dict[str, str] = {}   # oauth_state -> user_id
_token_store: dict[str, dict[str, Any]] = {}  # user_id -> google credentials dict


def _make_flow():  # type: ignore[return]
    """Build a google_auth_oauthlib Flow, or raise 503 if Google is not configured."""
    try:
        from google_auth_oauthlib.flow import Flow  # type: ignore[import-untyped]
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="google-auth-oauthlib is not installed. Run: pip install -r requirements.txt",
        ) from exc

    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=503,
            detail="Google Calendar not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to services/api/.env",
        )

    return Flow.from_client_config(
        {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uris": [settings.google_redirect_uri],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=["https://www.googleapis.com/auth/calendar"],
        redirect_uri=settings.google_redirect_uri,
    )


@router.get("/authorize")
def authorize(
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> dict[str, str]:
    """Return a Google OAuth URL for the authenticated user to visit."""
    user_id, _ = auth
    flow = _make_flow()
    state = secrets.token_urlsafe(32)
    _pending_auth[state] = user_id

    url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )
    return {"url": url}


@router.get("/callback")
def callback(code: str, state: str) -> RedirectResponse:
    """Handle the OAuth callback from Google and store the user's tokens."""
    user_id = _pending_auth.pop(state, None)
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")

    flow = _make_flow()
    # Re-attach the state so the library accepts it
    flow.oauth2session.state = state  # type: ignore[attr-defined]
    flow.fetch_token(code=code)

    creds = flow.credentials
    _token_store[user_id] = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes or []),
    }

    frontend_origin = get_settings().frontend_origin
    return RedirectResponse(url=f"{frontend_origin}/?calendar_connected=true")


@router.post("/sync")
def sync_calendar(
    events: list[dict[str, Any]],
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> dict[str, Any]:
    """Insert a list of Google Calendar event objects for the authenticated user."""
    user_id, _ = auth
    if user_id not in _token_store:
        raise HTTPException(
            status_code=401,
            detail="Google Calendar not authorized. Visit /api/calendar/authorize first.",
        )

    try:
        from google.oauth2.credentials import Credentials  # type: ignore[import-untyped]
        from googleapiclient.discovery import build  # type: ignore[import-untyped]
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="google-api-python-client is not installed. Run: pip install -r requirements.txt",
        ) from exc

    creds = Credentials(**_token_store[user_id])
    service = build("calendar", "v3", credentials=creds)

    created_ids: list[str] = []
    for event in events:
        result = service.events().insert(calendarId="primary", body=event).execute()
        created_ids.append(result.get("id", ""))

    return {"created": created_ids, "count": len(created_ids)}
