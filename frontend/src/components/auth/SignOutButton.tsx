"use client";

import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import type { ButtonProps } from "@/components/ui/Button";

type SignOutButtonProps = Omit<ButtonProps, "onClick" | "children" | "type"> & {
  redirectTo?: string;
  children?: ReactNode;
};

export function SignOutButton({
  redirectTo = "/login",
  children,
  variant = "ghost",
  className = "",
  ...props
}: SignOutButtonProps) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push(redirectTo);
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      onClick={() => void handleSignOut()}
      {...props}
    >
      <LogOut className="h-4 w-4 shrink-0" aria-hidden />
      {children ?? "Sign out"}
    </Button>
  );
}
