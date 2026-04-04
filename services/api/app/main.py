from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException

from app.auth.deps import get_current_user_access
from app.db.client import get_supabase_client, get_supabase_for_access_token
from app.db.service import insert_saved_plan
from app.models.plan import SavedPlanCreate


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_supabase_client()
    yield


app = FastAPI(title="TritonHub API", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/db-health")
def db_health() -> dict[str, str]:
    client = get_supabase_client()
    try:
        client.table("profiles").select("id").limit(1).execute()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"DB unreachable: {exc}") from exc
    return {"status": "ok", "db": "connected"}


@app.post("/plans")
def create_plan(
    body: SavedPlanCreate,
    auth: tuple[str, str] = Depends(get_current_user_access),
) -> dict:
    user_id, access_token = auth
    client = get_supabase_for_access_token(access_token)
    try:
        return insert_saved_plan(client, user_id, body)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Could not create plan: {exc}",
        ) from exc
