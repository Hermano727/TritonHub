from supabase import Client
from app.models.domain import QuarterRow, VaultItemRow, ClassDossierRow


def get_all_quarters(client: Client) -> list[QuarterRow]:
    response = client.table("quarters").select("*").execute()
    return [QuarterRow.model_validate(row) for row in response.data]


def get_active_quarter(client: Client) -> QuarterRow | None:
    response = (
        client.table("quarters").select("*").eq("is_active", True).limit(1).execute()
    )
    if not response.data:
        return None
    return QuarterRow.model_validate(response.data[0])


def get_vault_items_for_quarter(client: Client, quarter_id: str) -> list[VaultItemRow]:
    response = (
        client.table("vault_items")
        .select("*")
        .eq("quarter_id", quarter_id)
        .execute()
    )
    return [VaultItemRow.model_validate(row) for row in response.data]


def get_dossiers_for_quarter(client: Client, quarter_id: str) -> list[ClassDossierRow]:
    response = (
        client.table("class_dossiers")
        .select("*")
        .eq("quarter_id", quarter_id)
        .execute()
    )
    return [ClassDossierRow.model_validate(row) for row in response.data]


def get_dossier_by_id(client: Client, dossier_id: str) -> ClassDossierRow | None:
    response = (
        client.table("class_dossiers")
        .select("*")
        .eq("id", dossier_id)
        .limit(1)
        .execute()
    )
    if not response.data:
        return None
    return ClassDossierRow.model_validate(response.data[0])
