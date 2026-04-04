from typing import Any, Literal

from pydantic import BaseModel, Field


class SavedPlanCreate(BaseModel):
    title: str
    quarter_label: str = ""
    status: Literal["draft", "complete"] = "draft"
    payload_version: int = 1
    payload: dict[str, Any] = Field(default_factory=dict)
    source_image_path: str | None = None
