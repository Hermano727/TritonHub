"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type CalendarStateContextType = {
  calendarVisible: boolean;
  reportCalendarVisible: (v: boolean) => void;
  registerOpenFullscreen: (fn: () => void) => void;
  openCalendar: () => void;
};

const CalendarStateContext = createContext<CalendarStateContextType | undefined>(
  undefined,
);

export function CalendarStateProvider({ children }: { children: ReactNode }) {
  const [calendarVisible, setCalendarVisible] = useState(true);
  const openFnRef = useRef<(() => void) | null>(null);

  const reportCalendarVisible = useCallback((v: boolean) => {
    setCalendarVisible(v);
  }, []);

  const registerOpenFullscreen = useCallback((fn: () => void) => {
    openFnRef.current = fn;
  }, []);

  const openCalendar = useCallback(() => {
    openFnRef.current?.();
  }, []);

  return (
    <CalendarStateContext.Provider
      value={{ calendarVisible, reportCalendarVisible, registerOpenFullscreen, openCalendar }}
    >
      {children}
    </CalendarStateContext.Provider>
  );
}

export function useCalendarState(): CalendarStateContextType {
  return (
    useContext(CalendarStateContext) ?? {
      calendarVisible: true,
      reportCalendarVisible: () => {},
      registerOpenFullscreen: () => {},
      openCalendar: () => {},
    }
  );
}
