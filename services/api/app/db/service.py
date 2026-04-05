from typing import Any

from supabase import Client

from app.models.plan import SavedPlanCreate


def insert_saved_plan(client: Client, user_id: str, body: SavedPlanCreate) -> dict[str, Any]:
    row = {
        "user_id": user_id,
        "title": body.title,
        "quarter_label": body.quarter_label,
        "status": body.status,
        "payload_version": body.payload_version,
        "payload": body.payload,
        "source_image_path": body.source_image_path,
    }
    response = client.table("saved_plans").insert(row).select("*").single().execute()
    if response.data is None:
        raise RuntimeError("saved_plans insert returned no data")
    return response.data
