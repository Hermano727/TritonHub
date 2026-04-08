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
import {
  AlertCircle,
  AlertTriangle,
  CalendarDays,
  GraduationCap,
  Info,
  LayoutGrid,
  Maximize2,
  Plus,
  Redo2,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";
import { isExamSection } from "@/lib/mappers/dossiersToScheduleItems";
import { Alert } from "@/components/ui/Alert";
import { ClassCard } from "@/components/dashboard/ClassCard";
import { CampusPathMap } from "@/components/dashboard/CampusPathMap";
import { EvaluatorFooter } from "@/components/dashboard/EvaluatorFooter";
import { WeeklyCalendar, type CourseBlock, type CommitmentBlock, COL_TO_DAY, parseDaysToCols, removeDayFromString, minutesToTimeStr, minutesToTimeInput } from "@/components/dashboard/WeeklyCalendar";
import { useCalendarSyncHandler } from "@/components/layout/calendar-sync-context";
import { useCalendarState } from "@/components/layout/calendar-state-context";
import {
  useScheduleEditor,
  useScheduleFingerprint,
} from "@/hooks/useScheduleEditor";
import type { ClassDossier, ScheduleCommitment, ScheduleEvaluation, ScheduleItem, TransitionInsight } from "@/types/dossier";

/**
 * Returns true if ALL regular (non-exam) meetings for this dossier are remote/online
 * and therefore have no physical map location.
 */
function isDossierRemoteOnly(dossier: ClassDossier): boolean {
  const regular = dossier.meetings.filter((m) => !isExamSection(m.section_type));
  return regular.length > 0 && regular.every((m) => m.geocode_status === "remote");
}

/** Assign marker numbers in top-down dossier display order (matches ClassCard list).
 *  Remote-only dossiers are skipped — they get no number and no map pin. */
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

const COMMITMENT_PRESETS = [
  { label: "Coral", value: "#f97316" },
  { label: "Rose", value: "#fb7185" },
  { label: "Violet", value: "#a78bfa" },
  { label: "Mint", value: "#34d399" },
  { label: "Sky", value: "#38bdf8" },
  { label: "Sand", value: "#e3b12f" },
];

function minutesFromTimeInput(iso: string): number | null {
  if (!iso) return null;
  const [hStr, mStr] = iso.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

type MainTab = "dossier" | "schedule";

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
};
export const DossierScheduleWorkspace = forwardRef(function DossierScheduleWorkspace(
  {
    viewClasses,
    evaluation,
    hydrateKey,
    scheduleItems = [],
    transitionInsights = [],
    calendarHeaderActions,
    initialCommitments = [],
  }: Props,
  ref: React.Ref<DossierScheduleWorkspaceHandle | null>,
) {
  const fingerprint = useScheduleFingerprint(viewClasses);
  const fullKey = `${hydrateKey}|${fingerprint}`;

  const {
    classes,
    commitments,
    apply,
    undo,
    redo,
    resetToBaseline,
    addCommitment,
    removeCommitment,
    editCommitment,
    canUndo,
    canRedo,
    isDirty,
  } = useScheduleEditor(viewClasses, fullKey, initialCommitments);

  useImperativeHandle(ref, () => ({
    getCurrentClasses: () => classes,
    getCurrentCommitments: () => commitments,
  }), [classes, commitments]);

  const [mainTab, setMainTab] = useState<MainTab>("dossier");
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [hoveredClassId, setHoveredClassId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const formId = useId();

  const dossierMarkerMap = useMemo(
    () => buildDossierMarkerMap(scheduleItems, classes),
    [scheduleItems, classes],
  );

  const [newTitle, setNewTitle] = useState("Work");
  const [newDay, setNewDay] = useState(0);
  const [newStart, setNewStart] = useState("14:00");
  const [newEnd, setNewEnd] = useState("15:00");
  const [newColor, setNewColor] = useState(COMMITMENT_PRESETS[0].value);
  const [blockError, setBlockError] = useState<string | null>(null);

  const [editingBlock, setEditingBlock] = useState<CourseBlock | CommitmentBlock | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDay, setEditDay] = useState(0);
  const [editStart, setEditStart] = useState("08:00");
  const [editEnd, setEditEnd] = useState("09:00");
  const [editColor, setEditColor] = useState(COMMITMENT_PRESETS[0].value);
  const [editLocation, setEditLocation] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const onSyncCalendar = useCalendarSyncHandler();
  const { calendarVisible, reportCalendarVisible, registerOpenFullscreen, openCalendar } = useCalendarState();

  const calendarRef = useRef<HTMLDivElement>(null);

  // Register the fullscreen opener so the sidebar can trigger it
  useEffect(() => {
    registerOpenFullscreen(() => setFullscreenOpen(true));
  }, [registerOpenFullscreen]);

  // Track whether the calendar is in the viewport
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

  const openAddModal = useCallback(() => {
    setBlockError(null);
    setAddOpen(true);
  }, []);

  const deleteMeeting = useCallback((block: CourseBlock) => {
    const updatedClasses = classes.map((d) => {
      if (d.id !== block.dossierId) return d;
      const meetings = d.meetings.filter((_, idx) => idx !== block.meetingIdx);
      return { ...d, meetings };
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
    if (s === null || e === null) {
      setEditError("Please enter valid start and end times.");
      return;
    }
    if (e <= s) {
      setEditError("End time must be after the start time.");
      return;
    }
    if (e - s > 8 * 60) {
      setEditError("Blocks longer than 8 hours aren't supported.");
      return;
    }
    setEditError(null);

    if (editingBlock.kind === "commitment") {
      editCommitment({
        ...editingBlock.commitment,
        title: editTitle.trim() || "Untitled",
        dayCol: editDay,
        startMin: s,
        endMin: e,
        color: editColor,
      });
    } else {
      // Course block: update the meeting (same logic as drag-drop)
      const newDayToken = COL_TO_DAY[editDay];
      const updatedClasses = classes.map((d) => {
        if (d.id !== editingBlock.dossierId) return d;
        const meetings = [...d.meetings];
        const orig = meetings[editingBlock.meetingIdx];
        const origCols = parseDaysToCols(orig.days);
        const updatedMeeting = {
          ...orig,
          days: newDayToken,
          start_time: minutesToTimeStr(s),
          end_time: minutesToTimeStr(e),
          location: editLocation,
        };
        if (origCols.length === 1) {
          meetings[editingBlock.meetingIdx] = updatedMeeting;
        } else {
          meetings[editingBlock.meetingIdx] = {
            ...orig,
            days: removeDayFromString(orig.days, editingBlock.col),
          };
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
    if (s === null || e === null) {
      setBlockError("Please enter valid start and end times.");
      return;
    }
    if (e <= s) {
      setBlockError(
        "End time must be after the start time. Blocks can't span midnight — keep start and end on the same day.",
      );
      return;
    }
    if (e - s > 8 * 60) {
      setBlockError(
        "Blocks longer than 8 hours aren't supported. Consider splitting into multiple shorter blocks.",
      );
      return;
    }
    setBlockError(null);
    const c: ScheduleCommitment = {
      id: `commit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: newTitle.trim() || "Untitled",
      color: newColor,
      dayCol: newDay,
      startMin: s,
      endMin: e,
    };
    addCommitment(c);
    setAddOpen(false);
  }, [addCommitment, newColor, newDay, newEnd, newStart, newTitle]);

  const scheduleToolbar = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] pb-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.08] bg-hub-bg/40 p-0.5">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo"
            className="rounded-md p-2 text-hub-text-muted transition hover:bg-hub-surface-elevated hover:text-hub-text disabled:pointer-events-none disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" aria-hidden />
            <span className="sr-only">Undo</span>
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo"
            className="rounded-md p-2 text-hub-text-muted transition hover:bg-hub-surface-elevated hover:text-hub-text disabled:pointer-events-none disabled:opacity-30"
          >
            <Redo2 className="h-4 w-4" aria-hidden />
            <span className="sr-only">Redo</span>
          </button>
        </div>
        <button
          type="button"
          onClick={resetToBaseline}
          title="Restore meetings to the last ingested plan"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-hub-bg/35 px-3 py-2 text-xs font-medium text-hub-text-secondary transition hover:border-hub-cyan/30 hover:text-hub-text"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Original schedule
        </button>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hub-cyan/35 bg-hub-cyan/10 px-3 py-2 text-xs font-medium text-hub-cyan transition hover:bg-hub-cyan/15"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add block
        </button>
        {isDirty ? (
          <span className="w-full basis-full text-[10px] text-hub-text-muted lg:basis-auto">
            Unsaved local edits — use Original schedule to discard all moves.
          </span>
        ) : null}
      </div>
    ),
    [
      canRedo,
      canUndo,
      isDirty,
      openAddModal,
      redo,
      resetToBaseline,
      undo,
    ],
  );

  const defaultCalendarHeaderActions = useMemo(
    () => (
      <>
        <button
          type="button"
          onClick={onSyncCalendar}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hub-cyan/35 bg-hub-cyan/10 px-2.5 py-1.5 text-[11px] font-semibold text-hub-cyan transition hover:bg-hub-cyan/18"
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Sync to Google Calendar</span>
          <span className="sm:hidden">Sync</span>
        </button>
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
    ),
    [onSyncCalendar],
  );

  const calendarNode = (px: number, calHeader: ReactNode | null) => (
    <div className="flex flex-col space-y-3">
      {scheduleToolbar}
      <div className="lg:min-h-[min(520px,calc(100vh-14rem))]">
        <WeeklyCalendar
          classes={classes}
          commitments={commitments}
          onApply={apply}
          pxPerHour={px}
          headerActions={calHeader ?? undefined}
          hideScheduleHeading={calHeader === null}
          onBlockDoubleClick={openEditModal}
        />
      </div>
      {commitments.length > 0 ? (
        <div className="rounded-lg border border-white/[0.06] bg-hub-bg/25 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-hub-text-muted">
            Your blocks
          </p>
          <ul className="mt-2 space-y-1.5">
            {commitments.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 text-xs text-hub-text-secondary"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="truncate font-medium text-hub-text">
                    {c.title}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeCommitment(c.id)}
                  className="shrink-0 rounded px-2 py-0.5 text-[10px] text-hub-text-muted hover:bg-white/5 hover:text-hub-danger"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  const fullscreenSyncBtn = (
    <button
      type="button"
      onClick={onSyncCalendar}
      className="inline-flex items-center gap-2 rounded-lg border border-hub-cyan/35 bg-hub-cyan/12 px-3 py-2 text-xs font-semibold text-hub-cyan transition hover:bg-hub-cyan/20"
    >
      <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
      Sync to Google Calendar
    </button>
  );

  return (
    <>
      {/* Mobile / tablet: primary tab switcher */}
      <div className="mb-4 flex lg:hidden">
        <div className="flex w-full rounded-xl border border-white/[0.08] bg-hub-bg/40 p-1">
          <button
            type="button"
            onClick={() => setMainTab("dossier")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition ${
              mainTab === "dossier"
                ? "bg-hub-surface-elevated text-hub-text shadow-sm"
                : "text-hub-text-muted hover:text-hub-text-secondary"
            }`}
          >
            <LayoutGrid className="h-4 w-4 opacity-70" aria-hidden />
            Courses
          </button>
          <button
            type="button"
            onClick={() => setMainTab("schedule")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition ${
              mainTab === "schedule"
                ? "bg-hub-surface-elevated text-hub-text shadow-sm"
                : "text-hub-text-muted hover:text-hub-text-secondary"
            }`}
          >
            Schedule
          </button>
        </div>
      </div>

      {/* ── Mobile: linear stack ── */}
      <div className="flex min-h-0 flex-col gap-6 lg:hidden">
        <div
          ref={calendarRef}
          className={mainTab === "dossier" ? "hidden" : ""}
        >
          {calendarNode(78, calendarHeaderActions ? (
            <>{defaultCalendarHeaderActions}{calendarHeaderActions}</>
          ) : defaultCalendarHeaderActions)}
        </div>

        <div
          className={`grid gap-4 sm:grid-cols-2 ${
            mainTab === "schedule" ? "hidden" : ""
          }`}
        >
          {classes.map((c) => (
            <ClassCard
              key={c.id}
              dossier={c}
              isSelected={selectedClassId === c.id}
              onSelect={() => setSelectedClassId((prev) => prev === c.id ? null : c.id)}
              onHover={() => setHoveredClassId(c.id)}
              onHoverEnd={() => setHoveredClassId(null)}
            />
          ))}
        </div>

        {scheduleItems.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className={mainTab === "schedule" ? "hidden" : ""}
          >
            <CampusPathMap scheduleItems={scheduleItems} transitionInsights={transitionInsights} dossierMarkerMap={dossierMarkerMap} />
          </motion.div>
        ) : null}

        <div className={mainTab === "schedule" ? "hidden" : ""}>
          <ExamsPanel classes={classes} />
        </div>

        <div className={mainTab === "schedule" ? "hidden" : ""}>
          <EvaluatorFooter evaluation={evaluation} />
        </div>
      </div>

      {/* ── Desktop: High-Density 50/50 Layout ── */}
      <div className="hidden lg:block space-y-5">

        {/* ── Full-Width Difficulty Score HUD ── */}
        <section className="w-full rounded-xl border border-white/[0.08] bg-hub-surface/95 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="font-[family-name:var(--font-outfit)] text-sm font-semibold uppercase tracking-widest text-hub-text-muted">
                Difficulty Score
              </h2>
              <HudInfoTooltip text="Commute · density · employment — 1 = easy, 10 = very hard" />
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-200">
              {evaluation.trendLabel}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-6 px-4 py-4">
            {/* Score readout */}
            <div className="flex items-baseline gap-2">
              <span
                className="font-[family-name:var(--font-outfit)] text-5xl font-bold tabular-nums"
                style={{ color: fitnessScoreColor(evaluation.fitnessScore, evaluation.fitnessMax) }}
              >
                {evaluation.fitnessScore.toFixed(1)}
              </span>
              <span className="text-sm text-slate-400">/ {evaluation.fitnessMax}</span>
            </div>

            {/* Category mini-bars */}
            {(evaluation.categories ?? []).length > 0 && (
              <div className="flex flex-1 flex-wrap gap-x-6 gap-y-3">
                {(evaluation.categories ?? []).map((cat) => (
                  <div key={cat.label} className="min-w-[100px] flex-1">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-slate-400">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        {cat.label}
                      </span>
                      <span className="font-bold tabular-nums" style={{ color: cat.color }}>
                        {cat.score.toFixed(1)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(cat.score / cat.max) * 100}%`,
                          backgroundColor: cat.color,
                          opacity: 0.8,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Alert chips */}
            {evaluation.alerts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {evaluation.alerts.slice(0, 3).map((a) => (
                  <span
                    key={a.id}
                    title={a.detail}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                      a.severity === "critical"
                        ? "border-hub-danger/25 bg-hub-danger/10 text-hub-danger"
                        : a.severity === "warning"
                          ? "border-hub-gold/25 bg-hub-gold/10 text-hub-gold"
                          : "border-hub-cyan/20 bg-hub-cyan/8 text-hub-cyan"
                    }`}
                  >
                    {a.severity === "critical"
                      ? <AlertCircle className="h-3 w-3" aria-hidden />
                      : a.severity === "warning"
                      ? <AlertTriangle className="h-3 w-3" aria-hidden />
                      : <Info className="h-3 w-3" aria-hidden />}
                    {a.title}
                  </span>
                ))}
                {evaluation.alerts.length > 3 && (
                  <span className="inline-flex items-center rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] text-slate-400">
                    +{evaluation.alerts.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>

          {evaluation.recommendation && (
            <div className="border-t border-white/[0.05] px-4 py-2.5">
              <p className="text-xs text-slate-400">
                <span className="font-semibold text-hub-text-secondary">Advisor: </span>
                {evaluation.recommendation}
              </p>
            </div>
          )}
        </section>

        {/* ── Exams Panel (Finals / Midterms) ── */}
        <ExamsPanel classes={classes} />

        {/* ── 50/50 Split ── */}
        <div className="grid grid-cols-2 gap-8 items-start">

          {/* Left (50%): ClassCard list — scrolls with the page */}
          <div className="space-y-3 pr-1">
            {classes.map((c) => (
              <ClassCard
                key={c.id}
                dossier={c}
                isSelected={selectedClassId === c.id}
                markerIndex={dossierMarkerMap.get(c.id)}
                onSelect={() => setSelectedClassId((prev) => prev === c.id ? null : c.id)}
                onHover={() => setHoveredClassId(c.id)}
                onHoverEnd={() => setHoveredClassId(null)}
              />
            ))}
          </div>

          {/* Right (50%): Sticky Map + Calendar stack */}
          <div
            className="sticky top-4 space-y-4 overflow-y-auto hub-scroll"
            style={{ maxHeight: "calc(100vh - 6rem)" }}
          >
            {/* Campus Map */}
            {scheduleItems.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              >
                <CampusPathMap
                  scheduleItems={scheduleItems}
                  transitionInsights={transitionInsights}
                  highlightedDossierId={selectedClassId}
                  dossierMarkerMap={dossierMarkerMap}
                />
              </motion.div>
            )}

            {/* Calendar */}
            <div className="rounded-xl border border-white/[0.08] bg-hub-surface/90 p-3 shadow-2xl">
              {scheduleToolbar}
              <div ref={calendarRef} className="mt-3">
                <WeeklyCalendar
                  classes={classes}
                  commitments={commitments}
                  onApply={apply}
                  pxPerHour={62}
                  hideScheduleHeading={false}
                  headerActions={calendarHeaderActions ? (
                    <>{defaultCalendarHeaderActions}{calendarHeaderActions}</>
                  ) : defaultCalendarHeaderActions}
                  onBlockDoubleClick={openEditModal}
                  highlightedDossierId={selectedClassId}
                />
              </div>
              {commitments.length > 0 && (
                <div className="mt-3 rounded-lg border border-white/[0.06] bg-hub-bg/25 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Your blocks
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {commitments.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-2 text-xs text-hub-text-secondary"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: c.color }}
                          />
                          <span className="truncate font-medium text-white">{c.title}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeCommitment(c.id)}
                          className="shrink-0 rounded px-2 py-0.5 text-[10px] text-slate-400 hover:bg-white/5 hover:text-hub-danger"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {fullscreenOpen ? (
          <motion.div
            key="fs-cal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex flex-col bg-[color-mix(in_srgb,var(--hub-bg)_96%,transparent)] p-4 backdrop-blur-md md:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Full screen schedule"
            onClick={() => setFullscreenOpen(false)}
          >
            <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                <div className="min-w-0">
                  <p className="font-[family-name:var(--font-outfit)] text-base font-semibold tracking-tight text-hub-text">
                    Weekly schedule
                  </p>
                  <p className="text-[11px] text-hub-text-muted">
                    Full view · drag blocks to rearrange
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {fullscreenSyncBtn}
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
              {scheduleToolbar}
              <div className="min-h-0 flex-1 overflow-auto rounded-xl">
                <WeeklyCalendar
                  classes={classes}
                  commitments={commitments}
                  onApply={apply}
                  pxPerHour={96}
                  hideScheduleHeading
                  onBlockDoubleClick={openEditModal}
                />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {!calendarVisible && !fullscreenOpen ? (
          <motion.button
            key="view-cal-fab"
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            onClick={openCalendar}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-hub-cyan/40 bg-hub-surface/90 px-4 py-2.5 text-xs font-semibold text-hub-cyan shadow-lg backdrop-blur-sm transition hover:bg-hub-cyan/10"
          >
            <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
            View Calendar
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {addOpen ? (
          <motion.div
            key="add-commit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${formId}-title`}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-hub-surface p-5 shadow-2xl shadow-black/40"
            >
              <div className="flex items-start justify-between gap-3">
                <h2
                  id={`${formId}-title`}
                  className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-hub-text"
                >
                  Add personal block
                </h2>
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-lg p-1.5 text-hub-text-muted hover:bg-white/5 hover:text-hub-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-hub-text-muted">
                Work, gym, clubs — appears on the grid with your courses.
              </p>
              <p className="mt-1 text-xs text-hub-text-muted">
                Blocks must start and end within the same day — midnight-spanning entries are not supported.
              </p>

              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                    Title
                  </span>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none ring-hub-cyan/30 placeholder:text-hub-text-muted focus:ring-2"
                    placeholder="e.g. Work shift"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                    Day
                  </span>
                  <select
                    value={newDay}
                    onChange={(e) => setNewDay(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none focus:ring-2 focus:ring-hub-cyan/30"
                  >
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(
                      (d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                      Start
                    </span>
                    <input
                      type="time"
                      value={newStart}
                      onChange={(e) => setNewStart(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none focus:ring-2 focus:ring-hub-cyan/30"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                      End
                    </span>
                    <input
                      type="time"
                      value={newEnd}
                      onChange={(e) => setNewEnd(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none focus:ring-2 focus:ring-hub-cyan/30"
                    />
                  </label>
                </div>

                {blockError && (
                  <Alert variant={blockError.includes("longer than") ? "warn" : "error"}>
                    {blockError}
                  </Alert>
                )}

                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                    Color
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {COMMITMENT_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setNewColor(p.value)}
                        title={p.label}
                        className={`h-8 w-8 rounded-full border-2 transition ${
                          newColor === p.value
                            ? "scale-110 border-white"
                            : "border-transparent hover:border-white/30"
                        }`}
                        style={{ backgroundColor: p.value }}
                      />
                    ))}
                  </div>
                  <div className="mt-4">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                      Custom hue
                    </span>
                    <label className="mt-2 block cursor-pointer">
                      <span className="sr-only">Pick a custom color</span>
                      <div className="relative mt-1.5 h-11 w-full overflow-hidden rounded-lg border border-white/[0.14] bg-hub-bg/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                        <input
                          type="color"
                          value={newColor}
                          onChange={(e) => setNewColor(e.target.value)}
                          className="absolute inset-0 h-full min-h-[3rem] w-full cursor-pointer border-0 bg-transparent p-0 [appearance:none] [-webkit-appearance:none] [&::-webkit-color-swatch-wrapper]:border-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-md"
                          aria-label="Custom color hue picker"
                        />
                      </div>
                      <p className="mt-2 text-center font-[family-name:var(--font-jetbrains-mono)] text-[11px] tracking-wide text-hub-text-muted">
                        {newColor.toUpperCase()}
                      </p>
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-hub-text-muted hover:bg-white/5 hover:text-hub-text"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitCommitment}
                  className="rounded-lg bg-hub-cyan/20 px-4 py-2 text-sm font-semibold text-hub-cyan ring-1 ring-hub-cyan/40 hover:bg-hub-cyan/25"
                >
                  Add to grid
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Edit block modal */}
      <AnimatePresence>
        {editingBlock ? (
          <motion.div
            key="edit-block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-label={editingBlock.kind === "commitment" ? "Edit personal block" : "Edit course meeting"}
            onClick={() => setEditingBlock(null)}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-hub-surface p-5 shadow-2xl shadow-black/40"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-[family-name:var(--font-outfit)] text-lg font-semibold text-hub-text">
                  {editingBlock.kind === "commitment" ? "Edit block" : `Edit ${editingBlock.courseCode}`}
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingBlock(null)}
                  className="rounded-lg p-1.5 text-hub-text-muted hover:bg-white/5 hover:text-hub-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {editingBlock.kind === "commitment" && (
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                      Title
                    </span>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none ring-hub-cyan/30 placeholder:text-hub-text-muted focus:ring-2"
                    />
                  </label>
                )}

                <label className="block">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                    Day
                  </span>
                  <select
                    value={editDay}
                    onChange={(e) => setEditDay(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none focus:ring-2 focus:ring-hub-cyan/30"
                  >
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d, i) => (
                      <option key={d} value={i}>{d}</option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                      Start
                    </span>
                    <input
                      type="time"
                      value={editStart}
                      onChange={(e) => setEditStart(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none focus:ring-2 focus:ring-hub-cyan/30"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                      End
                    </span>
                    <input
                      type="time"
                      value={editEnd}
                      onChange={(e) => setEditEnd(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none focus:ring-2 focus:ring-hub-cyan/30"
                    />
                  </label>
                </div>

                {editingBlock.kind === "course" && (
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                      Location
                    </span>
                    <input
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none ring-hub-cyan/30 placeholder:text-hub-text-muted focus:ring-2"
                      placeholder="e.g. CSB 001"
                    />
                  </label>
                )}

                {editingBlock.kind === "commitment" && (
                  <div>
                    <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">
                      Color
                    </span>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {COMMITMENT_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setEditColor(p.value)}
                          title={p.label}
                          className={`h-8 w-8 rounded-full border-2 transition ${
                            editColor === p.value
                              ? "scale-110 border-white"
                              : "border-transparent hover:border-white/30"
                          }`}
                          style={{ backgroundColor: p.value }}
                        />
                      ))}
                    </div>
                    <div className="mt-3 relative h-10 w-full overflow-hidden rounded-lg border border-white/[0.14] bg-hub-bg/50">
                      <input
                        type="color"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="absolute inset-0 h-full min-h-[3rem] w-full cursor-pointer border-0 bg-transparent p-0 [appearance:none] [-webkit-appearance:none] [&::-webkit-color-swatch-wrapper]:border-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-md"
                        aria-label="Custom color hue picker"
                      />
                    </div>
                  </div>
                )}

                {editError && (
                  <Alert variant="error">{editError}</Alert>
                )}
              </div>

              <div className="mt-6 flex items-center justify-between gap-2">
                {editingBlock.kind === "commitment" ? (
                  <button
                    type="button"
                    onClick={() => { removeCommitment(editingBlock.commitment.id); setEditingBlock(null); }}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-hub-danger hover:bg-hub-danger/10"
                  >
                    Delete
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => deleteMeeting(editingBlock)}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-hub-danger hover:bg-hub-danger/10"
                  >
                    Remove meeting
                  </button>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingBlock(null)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-hub-text-muted hover:bg-white/5 hover:text-hub-text"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitEdit}
                    className="rounded-lg bg-hub-cyan/20 px-4 py-2 text-sm font-semibold text-hub-cyan ring-1 ring-hub-cyan/40 hover:bg-hub-cyan/25"
                  >
                    Save
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
});

// ── Exams Panel ──────────────────────────────────────────────────────────────
type ExamEntry = {
  courseCode: string;
  sectionType: string;
  days: string;
  start_time: string;
  end_time: string;
  location: string;
};

function ExamsPanel({ classes }: { classes: import("@/types/dossier").ClassDossier[] }) {
  const exams: ExamEntry[] = [];
  for (const c of classes) {
    for (const m of c.meetings) {
      if (!isExamSection(m.section_type)) continue;
      exams.push({
        courseCode: c.courseCode,
        sectionType: m.section_type.toUpperCase(),
        days: m.days,
        start_time: m.start_time,
        end_time: m.end_time,
        location: m.location,
      });
    }
  }
  if (exams.length === 0) return null;

  return (
    <section className="rounded-xl border border-white/[0.08] bg-hub-surface/90 px-4 py-3 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-hub-gold" aria-hidden />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-hub-text-muted">
          Exams (not on calendar)
        </h2>
      </div>
      <div className="divide-y divide-white/[0.05]">
        {exams.map((ex, i) => (
          <div key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-xs text-hub-text-secondary">
            <span className="font-semibold text-hub-text">{ex.courseCode}</span>
            <span className="rounded bg-hub-gold/10 px-1.5 py-0.5 text-[10px] font-bold text-hub-gold">
              {ex.sectionType === "FI" ? "Final" : ex.sectionType === "MI" ? "Midterm" : ex.sectionType}
            </span>
            <span>{ex.days} · {ex.start_time}–{ex.end_time}</span>
            {ex.location && <span className="text-hub-text-muted">{ex.location}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function HudInfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="flex items-center text-slate-400/60 transition hover:text-slate-400"
        aria-label="Score explanation"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {visible && (
        <div className="absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-lg border border-white/[0.1] bg-hub-surface p-3 text-[11px] leading-relaxed text-slate-400 shadow-xl">
          {text}
        </div>
      )}
    </div>
  );
}

function fitnessScoreColor(score: number, max: number): string {
  const ratio = score / max;
  if (ratio <= 0.4) return "#5eead4";
  if (ratio <= 0.65) return "#e3b12f";
  return "#ff6b6b";
}
