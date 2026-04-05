import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedPlanRow, VaultItemRow } from "@/types/saved-plan";

export async function fetchPlansAndVault(client: SupabaseClient): Promise<{
  plans: SavedPlanRow[];
  vault: VaultItemRow[];
}> {
  const [plansRes, vaultRes] = await Promise.all([
    client.from("saved_plans").select("*").order("updated_at", {
      ascending: false,
    }),
    client.from("vault_items").select("*").order("updated_at", {
      ascending: false,
    }),
  ]);
  return {
    plans: (plansRes.data as SavedPlanRow[] | null) ?? [],
    vault: (vaultRes.data as VaultItemRow[] | null) ?? [],
  };
}
