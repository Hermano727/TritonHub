"use client";

import { createContext, useContext, type ReactNode } from "react";

const CalendarSyncContext = createContext<(() => void) | undefined>(undefined);

export function CalendarSyncProvider({
  onSync,
  children,
}: {
  onSync: () => void;
  children: ReactNode;
}) {
  return (
    <CalendarSyncContext.Provider value={onSync}>
      {children}
    </CalendarSyncContext.Provider>
  );
}

export function useCalendarSyncHandler(): () => void {
  return useContext(CalendarSyncContext) ?? (() => {});
}
