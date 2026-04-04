"use client";

import { useCallback, type ReactNode } from "react";
import { CalendarSyncProvider } from "@/components/layout/calendar-sync-context";
import { Header } from "@/components/layout/Header";
import type { HubUser } from "@/types/hub-user";

type HubShellProps = {
  children: ReactNode;
  user: HubUser | null;
};

export function HubShell({ children, user }: HubShellProps) {
  const handleSyncCalendar = useCallback(() => {
    alert("Google Calendar sync will call your FastAPI backend after OAuth.");
  }, []);

  return (
    <CalendarSyncProvider onSync={handleSyncCalendar}>
      <div className="flex min-h-screen flex-col">
        <Header user={user} />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </CalendarSyncProvider>
  );
}
