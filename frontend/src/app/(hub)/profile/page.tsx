import { redirect } from "next/navigation";
import { ProfileHub } from "@/components/profile/ProfileHub";
import { formatUpdatedAt } from "@/lib/hub/format-updated";
import { createClient } from "@/lib/supabase/server";
import type { VaultItem } from "@/types/dossier";
import type { SavedPlanRow } from "@/types/saved-plan";

function buildQuarterRollup(
  plans: Pick<SavedPlanRow, "id" | "quarter_label">[],
) {
  const map = new Map<string, { label: string; planCount: number }>();
  for (const p of plans) {
    const label = p.quarter_label?.trim() || "Unassigned quarter";
    const cur = map.get(label);
    if (cur) cur.planCount += 1;
    else map.set(label, { label, planCount: 1 });
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, college, expected_grad_term")
    .eq("id", user.id)
    .maybeSingle();

  const { data: plansRaw } = await supabase
    .from("saved_plans")
    .select("id, title, quarter_label, status, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const plans =
    (plansRaw as Pick<
      SavedPlanRow,
      "id" | "title" | "quarter_label" | "status" | "updated_at"
    >[]) ?? [];

  const { data: vaultRaw } = await supabase
    .from("vault_items")
    .select("id, name, kind, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  const vaultFromDb =
    (vaultRaw as {
      id: string;
      name: string;
      kind: VaultItem["kind"];
      updated_at: string;
    }[] | null) ?? [];
  const vaultItems: VaultItem[] = vaultFromDb.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    updatedAt: formatUpdatedAt(row.updated_at),
  }));

  const displayName =
    profile?.display_name?.trim() ||
    user.email?.split("@")[0] ||
    "User";
  const email = user.email ?? "";
  const quarters = buildQuarterRollup(plans);

  return (
    <ProfileHub
      displayName={displayName}
      email={email}
      college={profile?.college ?? null}
      expectedGrad={profile?.expected_grad_term ?? null}
      plans={plans}
      quarters={quarters}
      vaultItems={vaultItems}
    />
  );
}
