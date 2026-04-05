from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class QuarterRow(CamelModel):
    id: str
    label: str
    is_active: bool = False


class VaultItemRow(CamelModel):
    id: str
    quarter_id: str
    name: str
    kind: Literal["syllabus", "webreg", "note"]
    updated_at: str


class StatusChipRow(CamelModel):
    id: str
    label: str
    tone: Literal["cyan", "purple", "green", "muted"]


class ClassConflictRow(CamelModel):
    title: str
    detail: str


class ClassDossierRow(CamelModel):
    id: str
    quarter_id: str
    course_code: str
    course_title: str
    professor_name: str
    professor_initials: str
    condensed_summary: list[str] = []
    tldr: str = ""
    confidence_percent: int = 0
    chips: list[StatusChipRow] = []
    conflict: Optional[ClassConflictRow] = None
