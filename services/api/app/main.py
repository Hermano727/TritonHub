from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.db.client import get_supabase_client
from app.routers.parse import router as parse_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_supabase_client()  # eagerly initialize on startup
    yield


app = FastAPI(title="TritonHub API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(parse_router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/db-health")
def db_health() -> dict[str, str]:
    client = get_supabase_client()
    try:
        client.table("quarters").select("id").limit(0).execute()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"DB unreachable: {exc}") from exc
    return {"status": "ok", "db": "connected"}
