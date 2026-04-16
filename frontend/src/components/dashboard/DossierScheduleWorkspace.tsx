"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, LayoutGrid, Maximize2, Map as MapIcon, BarChart2, Layers, Minimize2, X } from "lucide-react";
import { isExamSection } from "@/lib/mappers/dossiersToScheduleItems";
import { ClassCard } from "@/components/dashboard/ClassCard";
import { DossierDashboardModal } from "@/components/dashboard/DossierDashboardModal";
import { CampusPathMap } from "@/components/dashboard/CampusPathMap";
import { EvaluatorFooter } from "@/components/dashboard/EvaluatorFooter";
import { DifficultyScoreHud } from "@/components/dashboard/DifficultyScoreHud";
import { ExamsPanel } from "@/components/dashboard/ExamsPanel";
import { ScheduleToolbar } from "@/components/dashboard/ScheduleToolbar";
import { CommitmentsPanel } from "@/components/dashboard/CommitmentsPanel";
import { AddCommitmentModal } from "@/components/dashboard/modals/AddCommitmentModal";
import { EditBlockModal } from "@/components/dashboard/modals/EditBlockModal";
import { COMMITMENT_PRESETS } from "@/components/dashboard/commitmentPresets";
import { WeeklyCalendar, type CourseBlock, type CommitmentBlock, COL_TO_DAY, parseDaysToCols, removeDayFromString, minutesToTimeStr, minutesToTimeInput } from "@/components/dashboard/WeeklyCalendar";
import { useCalendarSyncHandler } from "@/components/layout/calendar-sync-context";
import { useCalendarState } from "@/components/layout/calendar-state-context";
import { useScheduleEditor, useScheduleFingerprint } from "@/hooks/useScheduleEditor";
import type { ClassDossier, ScheduleCommitment, ScheduleEvaluation, ScheduleItem, TransitionInsight, TransitProfile } from "@/types/dossier";

function isDossierRemoteOnly(dossier: ClassDossier): boolean {
  const regular = dossier.meetings.filter((m) => !isExamSection(m.section_type));
  return regular.length > 0 && regular.every((m) => m.geocode_status === "remote");
}

function buildDossierMarkerMap(
  scheduleItems: ScheduleItem[],
  classes: ClassDossier[],
): Map<string, number> {
  const result = new Map<string, number>();
  let counter = 1;
  for (const dossier of classes) {
    if (isDossierRemoteOnly(dossier)) continue;
    if (scheduleItems.some((item) => item.id.startsWith(dossier.id + "-"))) {
      result.set(dossier.id, counter++);
    }
  }
  return result;
}

function minutesFromTimeInput(iso: string): number | null {
  if (!iso) return null;
  const [hStr, mStr] = iso.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

type WalkAdvisory = { key: string; message: string };

function parseMinutesFromAmPm(t: string): number | null {
  const m = t.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const period = m[3].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function computeWalkAdvisories(classes: ClassDossier[]): WalkAdvisory[] {
  // Collect all meetings with resolved lat/lng and a parseable end_time
  type MeetingInfo = {
    courseCode: string;
    locationName: string;
    day: string;
    startMin: number;
    endMin: number;
    lat: number;
    lng: number;
  };
  const meetings: MeetingInfo[] = [];
  for (const c of classes) {
    for (const m of c.meetings) {
      if (!m.lat || !m.lng || m.geocode_status === "unresolved") continue;
      const start = parseMinutesFromAmPm(m.start_time);
      const end = parseMinutesFromAmPm(m.end_time);
      if (start === null || end === null) continue;
      const days = m.days ? m.days.split("") : [];
      // Flatten by day so we can sort per-day
      const parsedDays: string[] = [];
      let i = 0;
      while (i < m.days.length) {
        if (i + 1 < m.days.length && ["Tu", "Th", "Sa", "Su"].includes(m.days.slice(i, i + 2))) {
          parsedDays.push(m.days.slice(i, i + 2));
          i += 2;
        } else {
          parsedDays.push(m.days[i]);
          i += 1;
        }
      }
      for (const day of parsedDays) {
        meetings.push({
          courseCode: c.courseCode,
          locationName: m.buildingDisplayName ?? m.location ?? m.building_code ?? "Unknown",
          day,
          startMin: start,
          endMin: end,
          lat: m.lat,
          lng: m.lng,
        });
      }
    }
  }

  // Group by day, sort by start time, check back-to-back gaps
  const byDay = new Map<string, MeetingInfo[]>();
  for (const m of meetings) {
    const list = byDay.get(m.day) ?? [];
    list.push(m);
    byDay.set(m.day, list);
  }

  const advisories: WalkAdvisory[] = [];
  for (const list of byDay.values()) {
    list.sort((a, b) => a.startMin - b.startMin);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      // Only flag if gap between classes is ≤ 20 minutes (potentially tight)
      const gapMin = b.startMin - a.endMin;
      if (gapMin > 20) continue;
      const dist = haversineDistanceMiles(a.lat, a.lng, b.lat, b.lng);
      if (dist > 0.5) {
        advisories.push({
          key: `${a.courseCode}-${b.courseCode}-${a.day}`,
          message: `Logistics Note: ${a.locationName} → ${b.locationName} (${dist.toFixed(1)} mi, ${gapMin} min gap). Verify if attendance is mandatory or tardiness is acceptable.`,
        });
      }
    }
  }
  return advisories;
}

type MainTab = "dossier" | "schedule";
type WorkspacePhase = "overview" | "dossiers" | "logistics" | "review";

const PHASES: { id: WorkspacePhase; label: string; icon: typeof BarChart2; description: string }[] = [
  { id: "overview", label: "Overview", icon: BarChart2, description: "Difficulty analysis" },
  { id: "dossiers", label: "Courses", icon: LayoutGrid, description: "Deep dive" },
  { id: "logistics", label: "Logistics", icon: MapIcon, description: "Map & schedule" },
  { id: "review", label: "Review", icon: Layers, description: "Full dashboard" },
];

export type DossierScheduleWorkspaceHandle = {
  getCurrentClasses: () => ClassDossier[];
  getCurrentCommitments: () => ScheduleCommitment[];
};

type Props = {
  viewClasses: ClassDossier[];
  evaluation: ScheduleEvaluation;
  hydrateKey: string;
  scheduleItems?: ScheduleItem[];
  transitionInsights?: TransitionInsight[];
  calendarHeaderActions?: ReactNode;
  initialCommitments?: ScheduleCommitment[];
  // Save flow
  onSave?: () => Promise<void>;
  isSaving?: boolean;
  lastSavedAt?: Date | null;
  saveError?: string | null;
  showSavePrompt?: boolean;
  onSavePromptDismiss?: () => void;
  // Personalization
  transitProfile?: TransitProfile;
};

function formatSaveTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export const DossierScheduleWorkspace = forwardRef(function DossierScheduleWorkspace(
  {
    viewClasses,
    evaluation,
    hydrateKey,
    scheduleItems = [],
    transitionInsights = [],
    calendarHeaderActions,
    initialCommitments = [],
    onSave,
    isSaving = false,
    lastSavedAt,
    saveError,
    showSavePrompt = false,
    onSavePromptDismiss,
    transitProfile,
  }: Props,
  ref: React.Ref<DossierScheduleWorkspaceHandle | null>,
) {
  const fingerprint = useScheduleFingerprint(viewClasses);
  const fullKey = `${hydrateKey}|${fingerprint}`;

  const {
    classes, commitments, apply, undo, redo, resetToBaseline,
    addCommitment, removeCommitment, editCommitment,
    canUndo, canRedo, isDirty,
  } = useScheduleEditor(viewClasses, fullKey, initialCommitments);

  useImperativeHandle(ref, () => ({
    getCurrentClasses: () => classes,
    getCurrentCommitments: () => commitments,
  }), [classes, commitments]);

  const [mainTab, setMainTab] = useState<MainTab>("dossier");
  const [currentPhase, setCurrentPhase] = useState<WorkspacePhase>("overview");
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [hoveredClassId, setHoveredClassId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [dashboardOpenIndex, setDashboardOpenIndex] = useState<number | null>(null);
  const formId = useId();

  // Add-block form state
  const [newTitle, setNewTitle] = useState("Work");
  const [newDay, setNewDay] = useState(0);
  const [newStart, setNewStart] = useState("14:00");
  const [newEnd, setNewEnd] = useState("15:00");
  const [newColor, setNewColor] = useState<string>(COMMITMENT_PRESETS[0].value);
  const [blockError, setBlockError] = useState<string | null>(null);

  // Edit-block form state
  const [editingBlock, setEditingBlock] = useState<CourseBlock | CommitmentBlock | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDay, setEditDay] = useState(0);
  const [editStart, setEditStart] = useState("08:00");
  const [editEnd, setEditEnd] = useState("09:00");
  const [editColor, setEditColor] = useState<string>(COMMITMENT_PRESETS[0].value);
  const [editLocation, setEditLocation] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const onSyncCalendar = useCalendarSyncHandler();
  const { calendarVisible, reportCalendarVisible, registerOpenFullscreen, openCalendar } = useCalendarState();
  const calendarRef = useRef<HTMLDivElement>(null);
  const dossierMarkerMap = useMemo(() => buildDossierMarkerMap(scheduleItems, classes), [scheduleItems, classes]);
  const walkAdvisories = useMemo(
    () => (transitProfile === "walking" ? computeWalkAdvisories(classes) : []),
    [transitProfile, classes],
  );

  useEffect(() => {
    registerOpenFullscreen(() => setFullscreenOpen(true));
  }, [registerOpenFullscreen]);

  useEffect(() => {
    const el = calendarRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => reportCalendarVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reportCalendarVisible]);

  useEffect(() => {
    if (!addOpen && !fullscreenOpen && !editingBlock) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (addOpen) setAddOpen(false);
      else if (editingBlock) setEditingBlock(null);
      else setFullscreenOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen, fullscreenOpen, editingBlock]);

  const openAddModal = useCallback(() => { setBlockError(null); setAddOpen(true); }, []);

  const deleteMeeting = useCallback((block: CourseBlock) => {
    const updatedClasses = classes.map((d) => {
      if (d.id !== block.dossierId) return d;
      return { ...d, meetings: d.meetings.filter((_, idx) => idx !== block.meetingIdx) };
    });
    apply({ classes: updatedClasses, commitments });
    setEditingBlock(null);
  }, [apply, classes, commitments]);

  const openEditModal = useCallback((block: CourseBlock | CommitmentBlock) => {
    setEditError(null);
    if (block.kind === "commitment") {
      const c = block.commitment;
      setEditTitle(c.title);
      setEditDay(c.dayCol);
      setEditStart(minutesToTimeInput(c.startMin));
      setEditEnd(minutesToTimeInput(c.endMin));
      setEditColor(c.color);
    } else {
      setEditDay(block.col);
      setEditStart(minutesToTimeInput(block.startMin));
      setEditEnd(minutesToTimeInput(block.endMin));
      setEditLocation(block.meeting.location);
    }
    setEditingBlock(block);
  }, []);

  const submitEdit = useCallback(() => {
    if (!editingBlock) return;
    const s = minutesFromTimeInput(editStart);
    const e = minutesFromTimeInput(editEnd);
    if (s === null || e === null) { setEditError("Please enter valid start and end times."); return; }
    if (e <= s) { setEditError("End time must be after the start time."); return; }
    if (e - s > 8 * 60) { setEditError("Blocks longer than 8 hours aren't supported."); return; }
    setEditError(null);

    if (editingBlock.kind === "commitment") {
      editCommitment({ ...editingBlock.commitment, title: editTitle.trim() || "Untitled", dayCol: editDay, startMin: s, endMin: e, color: editColor });
    } else {
      const newDayToken = COL_TO_DAY[editDay];
      const updatedClasses = classes.map((d) => {
        if (d.id !== editingBlock.dossierId) return d;
        const meetings = [...d.meetings];
        const orig = meetings[editingBlock.meetingIdx];
        const origCols = parseDaysToCols(orig.days);
        const updatedMeeting = { ...orig, days: newDayToken, start_time: minutesToTimeStr(s), end_time: minutesToTimeStr(e), location: editLocation };
        if (origCols.length === 1) {
          meetings[editingBlock.meetingIdx] = updatedMeeting;
        } else {
          meetings[editingBlock.meetingIdx] = { ...orig, days: removeDayFromString(orig.days, editingBlock.col) };
          meetings.push(updatedMeeting);
        }
        return { ...d, meetings };
      });
      apply({ classes: updatedClasses, commitments });
    }
    setEditingBlock(null);
  }, [editingBlock, editStart, editEnd, editTitle, editDay, editColor, editLocation, editCommitment, apply, classes, commitments]);

  const submitCommitment = useCallback(() => {
    const s = minutesFromTimeInput(newStart);
    const e = minutesFromTimeInput(newEnd);
    if (s === null || e === null) { setBlockError("Please enter valid start and end times."); return; }
    if (e <= s) { setBlockError("End time must be after the start time. Blocks can't span midnight — keep start and end on the same day."); return; }
    if (e - s > 8 * 60) { setBlockError("Blocks longer than 8 hours aren't supported. Consider splitting into multiple shorter blocks."); return; }
    setBlockError(null);
    addCommitment({
      id: `commit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: newTitle.trim() || "Untitled",
      color: newColor,
      dayCol: newDay,
      startMin: s,
      endMin: e,
    });
    setAddOpen(false);
  }, [addCommitment, newColor, newDay, newEnd, newStart, newTitle]);

  const syncBtn = (size: "sm" | "lg") => (
    <button
      type="button"
      onClick={onSyncCalendar}
      className={
        size === "lg"
          ? "inline-flex items-center gap-2 rounded-lg border border-hub-cyan/35 bg-hub-cyan/12 px-3 py-2 text-xs font-semibold text-hub-cyan transition hover:bg-hub-cyan/20"
          : "inline-flex items-center gap-1.5 rounded-lg border border-hub-cyan/35 bg-hub-cyan/10 px-2.5 py-1.5 text-[11px] font-semibold text-hub-cyan transition hover:bg-hub-cyan/18"
      }
    >
      <CalendarDays className={size === "lg" ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5 shrink-0"} aria-hidden />
      {size === "lg" ? "Sync to Google Calendar" : <><span className="hidden sm:inline">Sync to Google Calendar</span><span className="sm:hidden">Sync</span></>}
    </button>
  );

  const defaultCalendarActions = (
    <>
      {syncBtn("sm")}
      <button
        type="button"
        onClick={() => setFullscreenOpen(true)}
        title="Expand schedule to full screen"
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-hub-bg/55 px-2.5 py-1.5 text-[11px] font-medium text-hub-text-secondary transition hover:border-hub-cyan/25 hover:text-hub-text"
      >
        <Maximize2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Full screen</span>
      </button>
    </>
  );

  const toolbar = (
    <ScheduleToolbar
      canUndo={canUndo} canRedo={canRedo} isDirty={isDirty}
      onUndo={undo} onRedo={redo} onReset={resetToBaseline} onAdd={openAddModal}
    />
  );

  const calendarNode = (px: number, calHeader: ReactNode | null) => (
    <div className="flex flex-col space-y-3">
      {toolbar}
      <div className="lg:min-h-[min(520px,calc(100vh-14rem))]">
        <WeeklyCalendar
          classes={classes} commitments={commitments} onApply={apply}
          pxPerHour={px} headerActions={calHeader ?? undefined}
          hideScheduleHeading={calHeader === null} onBlockDoubleClick={openEditModal}
        />
      </div>
      <CommitmentsPanel commitments={commitments} onRemove={removeCommitment} />
    </div>
  );

  return (
    <>
      {/* Mobile tab switcher */}
      <div className="mb-4 flex lg:hidden">
        <div className="flex w-full rounded-xl border border-white/[0.08] bg-hub-bg/40 p-1">
          {(["dossier", "schedule"] as MainTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMainTab(tab)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition ${
                mainTab === tab ? "bg-hub-surface-elevated text-hub-text shadow-sm" : "text-hub-text-muted hover:text-hub-text-secondary"
              }`}
            >
              {tab === "dossier" ? <><LayoutGrid className="h-4 w-4 opacity-70" aria-hidden />Courses</> : "Schedule"}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile: linear stack */}
      <div className="flex min-h-0 flex-col gap-6 lg:hidden">
        <div ref={calendarRef} className={mainTab === "dossier" ? "hidden" : ""}>
          {calendarNode(78, calendarHeaderActions ? <>{defaultCalendarActions}{calendarHeaderActions}</> : defaultCalendarActions)}
        </div>
        <motion.div
          className={`grid gap-4 sm:grid-cols-2 ${mainTab === "schedule" ? "hidden" : ""}`}
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }}
        >
          {classes.map((c, idx) => (
            <ClassCard
              key={c.id} dossier={c}
              isSelected={selectedClassId === c.id}
              markerIndex={dossierMarkerMap.get(c.id)}
              onSelect={() => setSelectedClassId((prev) => prev === c.id ? null : c.id)}
              onHover={() => setHoveredClassId(c.id)}
              onHoverEnd={() => setHoveredClassId(null)}
              onOpenDashboard={() => setDashboardOpenIndex(idx)}
            />
          ))}
        </motion.div>
        {scheduleItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className={mainTab === "schedule" ? "hidden" : ""}
          >
            <CampusPathMap scheduleItems={scheduleItems} transitionInsights={transitionInsights} dossierMarkerMap={dossierMarkerMap} />
          </motion.div>
        )}
        <div className={mainTab === "schedule" ? "hidden" : ""}>
          <ExamsPanel classes={classes} />
        </div>
        <div className={mainTab === "schedule" ? "hidden" : ""}>
          <EvaluatorFooter evaluation={evaluation} />
        </div>
      </div>

      {/* Desktop: 4-phase guided workspace */}
      <div className="hidden lg:block space-y-8 workspace-grid rounded-xl p-1">

        {/* Phase navigation — flat tab row, no surrounding border box */}
        <nav className="flex items-center gap-1 border-b border-white/[0.06] pb-1" aria-label="Workspace phases">
          {PHASES.map((phase) => {
            const Icon = phase.icon;
            const isActive = currentPhase === phase.id;
            return (
              <button
                key={phase.id}
                type="button"
                onClick={() => setCurrentPhase(phase.id)}
                className={`relative flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-sm transition-all duration-200 active:scale-[0.98] ${
                  isActive
                    ? "font-semibold text-white/90"
                    : "font-medium text-white/40 hover:text-white/70"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-hub-cyan" : ""}`} aria-hidden />
                {phase.label}
                {/* Active underline indicator */}
                {isActive && (
                  <motion.span
                    layoutId="phase-underline"
                    className="absolute inset-x-2 -bottom-1 h-px rounded-full bg-hub-cyan"
                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                  />
                )}
              </button>
            );
          })}

          {/* Save plan — far right of phase nav */}
          {onSave && (
            <div className="ml-auto flex items-center gap-3 pl-4">
              <AnimatePresence mode="wait">
                {saveError ? (
                  <motion.span
                    key="save-error"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-xs text-hub-danger"
                  >
                    {saveError}
                  </motion.span>
                ) : lastSavedAt ? (
                  <motion.span
                    key="save-ts"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-xs text-white/40"
                  >
                    Last saved {formatSaveTime(lastSavedAt)}
                  </motion.span>
                ) : null}
              </AnimatePresence>
              <button
                type="button"
                onClick={() => void onSave()}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-hub-cyan/35 bg-hub-cyan/10 px-3 py-1.5 text-xs font-semibold text-hub-cyan transition hover:bg-hub-cyan/18 disabled:opacity-50"
              >
                {isSaving ? "Saving…" : "Save plan"}
              </button>
            </div>
          )}
        </nav>

        {/* Phase 1: Overview — 60/40 hero layout */}
        {currentPhase === "overview" && (
          <motion.div
            key="phase-overview"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-[3fr_2fr] gap-12 items-start"
          >
            <DifficultyScoreHud evaluation={evaluation} isHero />
            <ExamsPanel classes={classes} />
          </motion.div>
        )}

        {/* Phase 2: Dossiers — hero-sized cards */}
        {currentPhase === "dossiers" && (
          <motion.div
            key="phase-dossiers"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className={`grid gap-8 ${
                classes.length <= 2 ? "grid-cols-2" :
                classes.length === 3 ? "grid-cols-3" :
                "grid-cols-2 xl:grid-cols-3"
              }`}
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } }}
            >
              {classes.map((c, idx) => (
                <ClassCard
                  key={c.id} dossier={c}
                  isSelected={selectedClassId === c.id}
                  markerIndex={dossierMarkerMap.get(c.id)}
                  onSelect={() => setSelectedClassId((prev) => prev === c.id ? null : c.id)}
                  onHover={() => setHoveredClassId(c.id)}
                  onHoverEnd={() => setHoveredClassId(null)}
                  onOpenDashboard={() => setDashboardOpenIndex(idx)}
                />
              ))}
            </motion.div>
          </motion.div>
        )}

        {/* Phase 3: Logistics — 60/40 dual-instrument split */}
        {currentPhase === "logistics" && (
          <motion.div
            key="phase-logistics"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-3"
          >
            {/* Walk advisories — only shown when transit profile is walking */}
            {walkAdvisories.length > 0 && (
              <div className="rounded-xl border border-hub-gold/20 bg-hub-gold/[0.06] px-4 py-3 space-y-1.5">
                <p className="text-xs font-semibold text-hub-gold">Walk advisories</p>
                {walkAdvisories.map((a) => (
                  <p key={a.key} className="text-xs text-white/60">{a.message}</p>
                ))}
              </div>
            )}
          <div className="flex h-[85vh] overflow-hidden rounded-xl border border-white/[0.06]"
          >
            {/* Left pane: Map — 60% */}
            <div className="relative flex-[3] min-w-0 overflow-hidden">
              {scheduleItems.length > 0 ? (
                <CampusPathMap
                  scheduleItems={scheduleItems} transitionInsights={transitionInsights}
                  highlightedDossierId={selectedClassId} dossierMarkerMap={dossierMarkerMap}
                  mapHeight="h-[85vh]"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/40">
                  No on-campus courses to map
                </div>
              )}
              <button
                type="button"
                onClick={() => setMapFullscreen(true)}
                className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-md border border-white/[0.12] bg-hub-bg/80 px-3 py-1.5 text-xs font-medium text-white/70 backdrop-blur-sm transition hover:border-white/[0.2] hover:text-white/90 active:scale-[0.98]"
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                Full screen
              </button>
            </div>

            {/* Divider */}
            <div className="w-px shrink-0 bg-white/[0.05]" />

            {/* Right pane: Calendar — 40%, docked */}
            <div
              ref={calendarRef}
              className="flex-[2] min-w-0 overflow-y-auto hub-scroll bg-hub-surface/95"
            >
              <div className="p-5">
                <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-white/40">
                  Weekly schedule
                </p>
                {toolbar}
                <div className="mt-4">
                  <WeeklyCalendar
                    classes={classes} commitments={commitments} onApply={apply}
                    pxPerHour={52} hideScheduleHeading
                    onBlockDoubleClick={openEditModal}
                    onBlockClick={(id) => setSelectedClassId((prev) => prev === id ? null : id)}
                    highlightedDossierId={selectedClassId}
                  />
                </div>
                <div className="mt-4">
                  <CommitmentsPanel commitments={commitments} onRemove={removeCommitment} />
                </div>
              </div>
            </div>
          </div>
          </motion.div>
        )}

        {/* Phase 4: Review — Bento command center */}
        {currentPhase === "review" && (
          <motion.div
            key="phase-review"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
            {/* One-time save prompt — shown on first visit to Review after a fresh upload */}
            <AnimatePresence>
              {showSavePrompt && (
                <motion.div
                  key="save-prompt"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-start justify-between gap-4 rounded-xl border border-hub-cyan/20 bg-hub-cyan/[0.07] px-5 py-4"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-white/90">
                      Do you want to save this schedule?
                    </p>
                    <p className="text-xs text-white/50">
                      Note: You can save your schedule at any time using the Save plan button above.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { void onSave?.(); onSavePromptDismiss?.(); }}
                      className="rounded-lg bg-hub-cyan px-3 py-1.5 text-xs font-semibold text-hub-bg transition hover:bg-hub-cyan/85"
                    >
                      Save schedule
                    </button>
                    <button
                      type="button"
                      onClick={onSavePromptDismiss}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/50 transition hover:text-white/70"
                    >
                      Not now
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-3 gap-8 items-start">
            {/* Left 2/3: HUD + Cards */}
            <div className="col-span-2 space-y-8">
              <DifficultyScoreHud evaluation={evaluation} />
              <motion.div
                className={`grid gap-6 ${classes.length <= 2 ? "grid-cols-2" : "grid-cols-2 xl:grid-cols-3"}`}
                initial="hidden" animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }}
              >
                {classes.map((c, idx) => (
                  <ClassCard
                    key={c.id} dossier={c}
                    isSelected={selectedClassId === c.id}
                    markerIndex={dossierMarkerMap.get(c.id)}
                    onSelect={() => setSelectedClassId((prev) => prev === c.id ? null : c.id)}
                    onHover={() => setHoveredClassId(c.id)}
                    onHoverEnd={() => setHoveredClassId(null)}
                    onOpenDashboard={() => setDashboardOpenIndex(idx)}
                  />
                ))}
              </motion.div>
            </div>

            {/* Right 1/3: Map + Calendar + Exams — sticky command panel */}
            <div className="sticky top-4 space-y-6 overflow-y-auto hub-scroll" style={{ maxHeight: "calc(100vh - 5rem)" }}>
              {scheduleItems.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                >
                  <CampusPathMap
                    scheduleItems={scheduleItems} transitionInsights={transitionInsights}
                    highlightedDossierId={selectedClassId} dossierMarkerMap={dossierMarkerMap}
                    mapHeight="h-[40vh]"
                  />
                </motion.div>
              )}
              <div ref={calendarRef} className="rounded-xl border border-white/[0.08] p-4">
                {toolbar}
                <div className="mt-4">
                  <WeeklyCalendar
                    classes={classes} commitments={commitments} onApply={apply}
                    pxPerHour={52} hideScheduleHeading={false}
                    headerActions={calendarHeaderActions ? <>{defaultCalendarActions}{calendarHeaderActions}</> : defaultCalendarActions}
                    onBlockDoubleClick={openEditModal}
                    highlightedDossierId={selectedClassId}
                  />
                </div>
                <div className="mt-4">
                  <CommitmentsPanel commitments={commitments} onRemove={removeCommitment} />
                </div>
              </div>
              <ExamsPanel classes={classes} />
            </div>
            </div>{/* end grid grid-cols-3 */}
          </motion.div>
        )}
      </div>

      {/* Map fullscreen overlay — Phase 3 */}
      <AnimatePresence>
        {mapFullscreen && (
          <motion.div
            key="map-fs"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] bg-hub-bg"
            role="dialog" aria-modal="true" aria-label="Full screen campus map"
          >
            <CampusPathMap
              scheduleItems={scheduleItems} transitionInsights={transitionInsights}
              highlightedDossierId={selectedClassId} dossierMarkerMap={dossierMarkerMap}
              mapHeight="h-screen"
            />
            <button
              type="button"
              onClick={() => setMapFullscreen(false)}
              className="absolute right-5 top-5 z-[61] flex items-center gap-2 rounded-md border border-white/[0.14] bg-hub-bg/80 px-3 py-2 text-xs font-medium text-white/80 backdrop-blur-sm transition hover:border-white/[0.25] hover:text-white active:scale-[0.98]"
            >
              <Minimize2 className="h-3.5 w-3.5" aria-hidden />
              Exit full screen
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen calendar overlay */}
      <AnimatePresence>
        {fullscreenOpen && (
          <motion.div
            key="fs-cal"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex flex-col bg-[color-mix(in_srgb,var(--hub-bg)_96%,transparent)] p-4 backdrop-blur-md md:p-6"
            role="dialog" aria-modal="true" aria-label="Full screen schedule"
            onClick={() => setFullscreenOpen(false)}
          >
            <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                <div className="min-w-0">
                  <p className="font-[family-name:var(--font-outfit)] text-base font-semibold tracking-tight text-hub-text">Weekly schedule</p>
                  <p className="text-[11px] text-hub-text-muted">Full view · drag blocks to rearrange</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {syncBtn("lg")}
                  <button
                    type="button"
                    onClick={() => setFullscreenOpen(false)}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-hub-bg/50 px-3 py-2 text-xs font-medium text-hub-text-secondary transition hover:border-white/20 hover:text-hub-text"
                  >
                    <X className="h-4 w-4" aria-hidden />
                    Exit full screen
                  </button>
                </div>
              </div>
              {toolbar}
              <div className="min-h-0 flex-1 overflow-auto rounded-xl">
                <WeeklyCalendar
                  classes={classes} commitments={commitments} onApply={apply}
                  pxPerHour={96} hideScheduleHeading onBlockDoubleClick={openEditModal}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View Calendar FAB — only in overview/dossiers phases */}
      <AnimatePresence>
        {!calendarVisible && !fullscreenOpen && currentPhase !== "logistics" && currentPhase !== "review" && (
          <motion.button
            key="view-cal-fab" type="button"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            onClick={openCalendar}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-hub-cyan/40 bg-hub-surface/90 px-4 py-2.5 text-xs font-semibold text-hub-cyan shadow-lg backdrop-blur-sm transition hover:bg-hub-cyan/10"
          >
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
            View Calendar
          </motion.button>
        )}
      </AnimatePresence>

      {/* Add commitment modal */}
      <AddCommitmentModal
        open={addOpen} formId={formId}
        title={newTitle} day={newDay} start={newStart} end={newEnd} color={newColor} error={blockError}
        onTitleChange={setNewTitle} onDayChange={setNewDay} onStartChange={setNewStart}
        onEndChange={setNewEnd} onColorChange={setNewColor}
        onClose={() => setAddOpen(false)} onSubmit={submitCommitment}
      />

      {/* Edit block modal */}
      <EditBlockModal
        block={editingBlock}
        title={editTitle} day={editDay} start={editStart} end={editEnd} color={editColor} location={editLocation}
        error={editError}
        onTitleChange={setEditTitle} onDayChange={setEditDay} onStartChange={setEditStart}
        onEndChange={setEditEnd} onColorChange={setEditColor} onLocationChange={setEditLocation}
        onClose={() => setEditingBlock(null)} onSubmit={submitEdit}
        onDeleteCommitment={() => {
          if (editingBlock?.kind === "commitment") { removeCommitment(editingBlock.commitment.id); setEditingBlock(null); }
        }}
        onDeleteMeeting={() => {
          if (editingBlock?.kind === "course") deleteMeeting(editingBlock);
        }}
      />

      {/* ── Course Dashboard Modal ── */}
      <DossierDashboardModal
        dossiers={classes}
        openIndex={dashboardOpenIndex}
        onClose={() => setDashboardOpenIndex(null)}
        onNavigate={setDashboardOpenIndex}
      />
    </>
  );
});
