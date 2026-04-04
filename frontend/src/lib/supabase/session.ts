import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

export async function getBrowserSessionUser(
  client: SupabaseClient,
): Promise<User | null> {
  const {
    data: { user },
  } = await client.auth.getUser();
  return user;
}
