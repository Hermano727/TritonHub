from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.jwt import verify_access_token

security = HTTPBearer(auto_error=False)


def bearer_credentials(
    creds: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(security),
    ],
) -> HTTPAuthorizationCredentials:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return creds


def get_current_user_access(
    creds: Annotated[HTTPAuthorizationCredentials, Depends(bearer_credentials)],
) -> tuple[str, str]:
    user_id = verify_access_token(creds.credentials)
    return user_id, creds.credentials
