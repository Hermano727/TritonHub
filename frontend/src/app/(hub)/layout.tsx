import type { ReactNode } from "react";
import { HubShell } from "@/components/layout/HubShell";
import { createClient } from "@/lib/supabase/server";

export default async function HubLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hubUser = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    const email = user.email ?? "";
    hubUser = {
      email,
      displayName: profile?.display_name?.trim() || email.split("@")[0] || "User",
    };
  }

  return <HubShell user={hubUser}>{children}</HubShell>;
}
