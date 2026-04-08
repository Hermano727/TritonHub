"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  ExternalLink,
  Eye,
  HelpCircle,
  MessageSquare,
  RotateCcw,
  Star,
  X,
  Zap,
} from "lucide-react";
import type { ClassDossier, CourseLogistics } from "@/types/dossier";
import { ConflictBadge } from "@/components/dashboard/ConflictBadge";
import { getSunsetSummary } from "@/lib/mappers/courseEntryToDossier";
import { isExamSection } from "@/lib/mappers/dossiersToScheduleItems";

function isDossierRemoteOnly(dossier: ClassDossier): boolean {
  const regular = dossier.meetings.filter((m) => !isExamSection(m.section_type));
  return regular.length > 0 && regular.every((m) => m.geocode_status === "remote");
}

type DossierModalTab = "summary" | "reddit" | "grades" | "syllabus";

type ClassCardProps = {
  dossier: ClassDossier;
  isSelected?: boolean;
  markerIndex?: number;
  onSelect?: () => void;
  onHover?: () => void;
  onHoverEnd?: () => void;
};

// ── Confidence bar color based on percentage ──────────────────────────────────
function confidenceColor(pct: number): string {
  if (pct <= 30) return "#ff6b6b";
  if (pct <= 70) return "#e3b12f";
  return "#00d4ff";
}

function confidenceGlow(pct: number): string {
  if (pct <= 30) return "0 0 8px rgba(255,107,107,0.45)";
  if (pct <= 70) return "0 0 8px rgba(227,177,47,0.45)";
  return "0 0 8px rgba(0,212,255,0.45)";
}

// ── Categorised attribute chips (Payments / Attendance) ──────────────────────
type AttrChip = { label: string; tone: "amber" | "green" | "muted" };

const ATTR_CHIP_STYLES: Record<AttrChip["tone"], string> = {
  amber: "border-amber-500/30 bg-amber-900/30 text-amber-400",
  green: "border-emerald-500/30 bg-emerald-900/20 text-emerald-400",
  muted: "border-white/[0.08] bg-slate-800/60 text-slate-400",
};

function Chip({ chip }: { chip: AttrChip }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ATTR_CHIP_STYLES[chip.tone]}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          chip.tone === "amber" ? "bg-amber-400" : chip.tone === "green" ? "bg-emerald-400" : "bg-white/20"
        }`}
      />
      {chip.label}
    </span>
  );
}

function AttributeChips({ logistics }: { logistics: CourseLogistics | undefined }) {
  if (!logistics) return null;

  const payments: AttrChip[] = [];
  if (logistics.textbook_required === true)
    payments.push({ label: "Textbook Required", tone: "amber" });
  else if (logistics.textbook_required === false)
    payments.push({ label: "No Textbook", tone: "muted" });

  const attendance: AttrChip[] = [];
  if (logistics.attendance_required === true)
    attendance.push({ label: "Attendance Mandatory", tone: "amber" });
  else if (logistics.attendance_required === false)
    attendance.push({ label: "Attendance Optional", tone: "muted" });
  if (logistics.podcasts_available === true)
    attendance.push({ label: "Podcasts Available", tone: "green" });
  else if (logistics.podcasts_available === false)
    attendance.push({ label: "No Podcasts", tone: "muted" });

  if (payments.length === 0 && attendance.length === 0) return null;

  return (
    <div className="space-y-1">
      {payments.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 shrink-0 text-[9px] font-semibold uppercase tracking-wider text-hub-text-muted">Payments</span>
          {payments.map((c) => <Chip key={c.label} chip={c} />)}
        </div>
      )}
      {attendance.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 shrink-0 text-[9px] font-semibold uppercase tracking-wider text-hub-text-muted">Attend.</span>
          {attendance.map((c) => <Chip key={c.label} chip={c} />)}
        </div>
      )}
    </div>
  );
}

// ── Source / Quote card ───────────────────────────────────────────────────────
function SourceCard({ quote }: { quote: { id: string; source: string; text: string } }) {
  return (
    <blockquote className="rounded-xl border border-white/[0.06] bg-hub-bg/30 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-hub-text-muted">
          {quote.source}
        </p>
      </div>
      <p className="text-sm leading-relaxed text-hub-text-secondary">
        &ldquo;{sanitizeDashes(quote.text)}&rdquo;
      </p>
    </blockquote>
  );
}

function SkeletonSourceCard() {
  return (
    <div className="animate-pulse rounded-xl border border-white/[0.06] bg-hub-bg/20 p-4">
      <div className="mb-3 h-2.5 w-24 rounded bg-white/[0.08]" />
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-white/[0.05]" />
        <div className="h-3 w-4/5 rounded bg-white/[0.05]" />
        <div className="h-3 w-3/5 rounded bg-white/[0.05]" />
      </div>
    </div>
  );
}

function EmptyFeedback({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.08] p-8 text-center text-sm text-hub-text-muted">
      {label}
    </div>
  );
}

// ── SVG mini histogram for grade distribution ─────────────────────────────────
function GradeHistogram({
  gradeCounts,
  sampleSize,
}: {
  gradeCounts: Record<string, number>;
  sampleSize: number;
}) {
  const ORDER = [
    "A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F","P","NP","S","U","W","EW","I",
  ];
  const segments = ORDER.map((grade) => ({
    grade,
    count: gradeCounts[grade] ?? 0,
    color: SUNSET_SEGMENT_COLORS[grade] ?? "#64748b",
  })).filter((s) => s.count > 0);

  if (segments.length === 0) return null;

  const maxCount = Math.max(...segments.map((s) => s.count));
  const BAR_H = 72;
  const BAR_W = 14;
  const GAP = 3;
  const LABEL_H = 14;
  const svgW = segments.length * (BAR_W + GAP) - GAP;
  const svgH = BAR_H + LABEL_H + 4;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="w-full"
      style={{ maxHeight: 90 }}
      aria-label="Grade distribution histogram"
    >
      {segments.map((seg, i) => {
        const barH = Math.max((seg.count / maxCount) * BAR_H, 2);
        const x = i * (BAR_W + GAP);
        const y = BAR_H - barH;
        const pct = ((seg.count / sampleSize) * 100).toFixed(0);
        return (
          <g key={seg.grade}>
            <rect
              x={x}
              y={y}
              width={BAR_W}
              height={barH}
              fill={seg.color}
              fillOpacity={0.85}
              rx={2}
            >
              <title>{seg.grade}: {pct}% ({seg.count})</title>
            </rect>
            <text
              x={x + BAR_W / 2}
              y={svgH - 2}
              textAnchor="middle"
              fontSize={7}
              fill="rgba(148,163,184,0.8)"
            >
              {seg.grade}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Main ClassCard ────────────────────────────────────────────────────────────
export function ClassCard({
  dossier,
  isSelected,
  markerIndex,
  onSelect,
  onHover,
  onHoverEnd,
}: ClassCardProps) {
  const [showConfidenceInfo, setShowConfidenceInfo] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<DossierModalTab>("summary");

  const rmp = dossier.logistics?.rate_my_professor;
  const sunsetSummary = getSunsetSummary(dossier.sunsetGradeDistribution);
  const sunsetSampleSize =
    sunsetSummary?.sample_size ??
    Object.values(sunsetSummary?.grade_counts ?? {}).reduce(
      (sum, count) => sum + count,
      0,
    );
  const sunsetPrimaryGroups = getPrimarySunsetGroups(
    sunsetSummary?.grade_counts ?? {},
    sunsetSampleSize,
  );
  const sunsetSegments = getSunsetSegments(
    sunsetSummary?.grade_counts ?? {},
    sunsetSampleSize,
  );
  const hasSunsetSummary =
    sunsetSummary?.average_gpa != null ||
    sunsetSummary?.sample_size != null ||
    Object.keys(sunsetSummary?.grade_counts ?? {}).length > 0 ||
    dossier.sunsetGradeDistribution?.recommend_professor_percent != null;
  const hasRmp =
    rmp &&
    (rmp.rating != null ||
      rmp.difficulty != null ||
      rmp.would_take_again_percent != null);

  const redditQuotes = dossier.rawQuotes.filter(
    (q) => q.source.toLowerCase().includes("reddit"),
  );
  const syllabusQuotes = dossier.rawQuotes.filter(
    (q) =>
      q.source.toLowerCase().includes("syllabus") ||
      q.source.toLowerCase().includes("course page") ||
      q.source.toLowerCase().includes("prof"),
  );

  const confColor = confidenceColor(dossier.confidencePercent);
  const confGlow = confidenceGlow(dossier.confidencePercent);

  function openModal(tab: DossierModalTab = "summary") {
    setModalTab(tab);
    setModalOpen(true);
  }

  return (
    <>
      <motion.article
        layout
        onMouseEnter={onHover}
        onMouseLeave={onHoverEnd}
        onClick={onSelect}
        className={`rounded-xl border bg-hub-surface/90 p-4 shadow-sm transition-all duration-200 cursor-pointer
          ${
            isSelected
              ? "border-hub-cyan/60 shadow-[0_0_0_1px_rgba(0,212,255,0.12),0_8px_32px_rgba(0,212,255,0.08)]"
              : "border-white/[0.08] hover:border-white/[0.14]"
          }`}
      >
        {/* ── Card Header ── */}
        <header className="border-b border-white/[0.06] pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-hub-text-muted">
                Course
              </p>
              <h3 className="mt-0.5 flex flex-wrap items-baseline gap-1.5 font-[family-name:var(--font-outfit)] text-base font-semibold tracking-tight text-hub-text">
                {dossier.courseCode}
                {markerIndex != null ? (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-hub-cyan/40 bg-hub-cyan/10 text-[10px] font-bold text-hub-cyan leading-none">
                    {markerIndex}
                  </span>
                ) : isDossierRemoteOnly(dossier) ? (
                  <span className="inline-flex items-center rounded-full border border-purple-400/35 bg-purple-400/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-purple-300 leading-5">
                    Remote
                  </span>
                ) : null}
                <span className="text-hub-text-muted font-normal text-sm">
                  {dossier.courseTitle}
                </span>
              </h3>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.1] bg-hub-bg/50 text-[10px] font-semibold text-hub-cyan">
                  {dossier.professorInitials}
                </span>
                <span className="text-xs text-hub-text-secondary">
                  {dossier.professorName}
                </span>
              </div>
            </div>

            {/* Top-right actions: eye + selected */}
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="flex items-center gap-1.5">
                {isSelected && (
                  <span className="rounded-full border border-hub-cyan/30 bg-hub-cyan/10 px-2 py-0.5 text-[10px] font-semibold text-hub-cyan">
                    Selected
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openModal("summary");
                  }}
                  title="View Full Dossier"
                  className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-hub-bg/40 px-2 py-1.5 text-[10px] font-medium text-hub-text-muted transition hover:border-hub-cyan/30 hover:text-hub-cyan"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Dossier</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-3 space-y-3">
          {/* Attribute chips: Payments / Attendance */}
          <AttributeChips logistics={dossier.logistics} />

          {/* Grade histogram (full-width, replaces the old tiny strip) */}
          {sunsetSampleSize > 0 && Object.keys(sunsetSummary?.grade_counts ?? {}).length > 0 && (
            <div className="rounded-lg border border-white/[0.05] bg-hub-bg/30 px-2 pt-2 pb-1">
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-hub-text-muted">
                Grade dist. · {sunsetSampleSize} students
              </p>
              <GradeHistogram
                gradeCounts={sunsetSummary?.grade_counts ?? {}}
                sampleSize={sunsetSampleSize}
              />
            </div>
          )}

          {/* Confidence bar with glow */}
          <div>
            <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-hub-text-muted">
              <div className="flex items-center gap-1">
                <span>Data confidence</span>
                <div className="relative">
                  <button
                    type="button"
                    onMouseEnter={(e) => {
                      e.stopPropagation();
                      setShowConfidenceInfo(true);
                    }}
                    onMouseLeave={() => setShowConfidenceInfo(false)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center text-hub-text-muted/50 transition hover:text-hub-text-muted"
                    aria-label="How is data confidence calculated?"
                  >
                    <HelpCircle className="h-3 w-3" />
                  </button>
                  {showConfidenceInfo && (
                    <div className="absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-lg border border-white/[0.12] bg-hub-surface p-3 text-[11px] leading-relaxed text-hub-text-secondary shadow-xl">
                      <p className="mb-1 font-semibold text-hub-text">
                        About this score
                      </p>
                      <p>
                        Weighted average of syllabus, registrar records, SET
                        surveys, and community sources like Reddit and RMP.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <span
                className="font-[family-name:var(--font-jetbrains-mono)] font-semibold tabular-nums"
                style={{ color: confColor }}
              >
                {dossier.confidencePercent}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-hub-bg/80">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${dossier.confidencePercent}%`,
                  backgroundColor: confColor,
                  boxShadow: confGlow,
                }}
              />
            </div>
          </div>

          {/* Quick stats row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-white/[0.06] bg-hub-bg/30 px-3 py-2">
            {hasRmp && rmp.rating != null && (
              <div className="flex items-center gap-1.5">
                <Star className="h-3 w-3 text-hub-gold" fill="currentColor" />
                <span className="text-sm font-semibold text-hub-text">
                  {rmp.rating.toFixed(1)}
                </span>
                <span className="text-[10px] text-hub-text-muted">/5 RMP</span>
              </div>
            )}
            {hasRmp && rmp.difficulty != null && (
              <div className="flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-orange-400" />
                <span className="text-sm font-semibold text-hub-text">
                  {rmp.difficulty.toFixed(1)}
                </span>
                <span className="text-[10px] text-hub-text-muted">diff</span>
              </div>
            )}
            {hasRmp && rmp.would_take_again_percent != null && (
              <div className="flex items-center gap-1.5">
                <RotateCcw className="h-3 w-3 text-emerald-400" />
                <span className="text-sm font-semibold text-hub-text">
                  {Math.round(rmp.would_take_again_percent)}%
                </span>
                <span className="text-[10px] text-hub-text-muted">retake</span>
              </div>
            )}
            {hasSunsetSummary && sunsetSummary?.average_gpa != null && (
              <div className="ml-auto flex items-center gap-1">
                <span className="text-[10px] text-hub-text-muted">Avg GPA</span>
                <span className="text-sm font-semibold text-hub-cyan">
                  {sunsetSummary.average_gpa}
                </span>
              </div>
            )}
          </div>

          {/* TLDR */}
          <p className="text-xs leading-relaxed text-hub-text-secondary line-clamp-2">
            {dossier.tldr}
          </p>

          {dossier.conflict ? <ConflictBadge conflict={dossier.conflict} /> : null}

          {/* Actions row */}
          <div className="flex items-center gap-2 border-t border-white/[0.05] pt-2">
            {dossier.rawQuotes.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openModal("reddit");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-hub-bg/40 px-2.5 py-1.5 text-[11px] font-medium text-hub-text-secondary transition hover:border-purple-400/30 hover:text-purple-300"
              >
                <MessageSquare className="h-3 w-3" />
                Raw Feedback
              </button>
            )}
            {hasSunsetSummary && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openModal("grades");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-hub-bg/40 px-2.5 py-1.5 text-[11px] font-medium text-hub-text-secondary transition hover:border-hub-cyan/30 hover:text-hub-cyan"
              >
                <BookOpen className="h-3 w-3" />
                Grades
              </button>
            )}
            {rmp?.url && (
              <a
                href={rmp.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="ml-auto inline-flex items-center gap-1 text-[10px] text-hub-cyan/60 hover:text-hub-cyan"
              >
                RMP <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </div>
      </motion.article>

      {/* ── Dossier Deep-Dive Modal ── */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            key="dossier-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          >
            <motion.div
              key="dossier-modal"
              initial={{ y: 20, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 12, opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="flex w-full max-w-2xl max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-hub-surface shadow-2xl shadow-black/60"
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-hub-cyan/30 bg-hub-cyan/10 text-xs font-bold text-hub-cyan">
                      {dossier.professorInitials}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-[family-name:var(--font-outfit)] text-base font-semibold text-hub-text">
                          {dossier.courseCode}
                        </p>
                        {markerIndex != null ? (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-hub-cyan/40 bg-hub-cyan/10 text-[10px] font-bold text-hub-cyan">
                            {markerIndex}
                          </span>
                        ) : isDossierRemoteOnly(dossier) ? (
                          <span className="inline-flex items-center rounded-full border border-purple-400/35 bg-purple-400/10 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide text-purple-300 leading-5">
                            Remote
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-hub-text-muted">
                        {dossier.courseTitle} · {dossier.professorName}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="shrink-0 rounded-lg p-1.5 text-hub-text-muted hover:bg-white/5 hover:text-hub-text"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Modal Tabs */}
              <div className="flex border-b border-white/[0.06] px-5">
                {(
                  [
                    { key: "summary", label: "Summary" },
                    { key: "reddit", label: "Reddit Insights" },
                    { key: "grades", label: "Grade Distributions" },
                    { key: "syllabus", label: "Syllabus Quotes" },
                  ] as { key: DossierModalTab; label: string }[]
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setModalTab(t.key)}
                    className={`relative mr-4 py-3 text-xs font-semibold transition ${
                      modalTab === t.key
                        ? "text-hub-cyan after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:bg-hub-cyan"
                        : "text-hub-text-muted hover:text-hub-text-secondary"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto hub-scroll px-5 py-4">
                {modalTab === "summary" && (
                  <div className="space-y-4">
                    <AttributeChips logistics={dossier.logistics} />

                    {hasRmp && (
                      <div className="rounded-xl border border-white/[0.06] bg-hub-bg/30 p-4">
                        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-hub-text-muted">
                          Prof. Ratings
                        </p>
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                          {rmp.rating != null && (
                            <div className="flex items-center gap-2">
                              <Star
                                className="h-4 w-4 text-hub-gold"
                                fill="currentColor"
                              />
                              <span className="text-lg font-bold text-hub-text">
                                {rmp.rating.toFixed(1)}
                              </span>
                              <span className="text-xs text-hub-text-muted">
                                / 5
                              </span>
                            </div>
                          )}
                          {rmp.difficulty != null && (
                            <div className="flex items-center gap-2">
                              <Zap className="h-4 w-4 text-orange-400" />
                              <span className="text-lg font-bold text-hub-text">
                                {rmp.difficulty.toFixed(1)}
                              </span>
                              <span className="text-xs text-hub-text-muted">
                                difficulty
                              </span>
                            </div>
                          )}
                          {rmp.would_take_again_percent != null && (
                            <div className="flex items-center gap-2">
                              <RotateCcw className="h-4 w-4 text-emerald-400" />
                              <span className="text-lg font-bold text-hub-text">
                                {Math.round(rmp.would_take_again_percent)}%
                              </span>
                              <span className="text-xs text-hub-text-muted">
                                would retake
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {rmp.url && (
                            <a
                              href={rmp.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-hub-cyan hover:underline"
                            >
                              RateMyProfessors{" "}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {dossier.logistics?.course_webpage_url && (
                            <a
                              href={dossier.logistics.course_webpage_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-hub-cyan hover:underline"
                            >
                              Course page <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-white/[0.06] bg-hub-bg/35 p-4">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-hub-cyan">
                        Overview
                      </p>
                      <p className="text-sm leading-relaxed text-hub-text-secondary">
                        {dossier.tldr}
                      </p>
                    </div>

                    {dossier.condensedSummary.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-hub-text-muted">
                          Logistics
                        </p>
                        <ul className="space-y-1.5">
                          {dossier.condensedSummary.map((line, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 text-sm text-hub-text-secondary"
                            >
                              <span
                                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/[0.12]"
                                aria-hidden
                              />
                              <span>{sanitizeDashes(line)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {modalTab === "reddit" && (
                  <div className="space-y-3">
                    {redditQuotes.length > 0 ? (
                      redditQuotes.map((q) => <SourceCard key={q.id} quote={q} />)
                    ) : dossier.rawQuotes.length > 0 ? (
                      // Non-reddit quotes available — show those as fallback
                      dossier.rawQuotes.map((q) => <SourceCard key={q.id} quote={q} />)
                    ) : dossier.logistics != null ? (
                      // Research ran but no reddit posts were found
                      <EmptyFeedback label="No Reddit posts found for this course." />
                    ) : (
                      // Research hasn't run yet — show loading state
                      <>
                        <p className="mb-3 text-[11px] text-hub-text-muted italic">
                          Scraping Reddit — check back shortly.
                        </p>
                        <SkeletonSourceCard />
                        <SkeletonSourceCard />
                        <SkeletonSourceCard />
                      </>
                    )}
                  </div>
                )}

                {modalTab === "grades" && (
                  <div className="space-y-4">
                    {hasSunsetSummary ? (
                      <>
                        {/* Histogram — top of grades tab */}
                        {sunsetSampleSize > 0 &&
                          Object.keys(sunsetSummary?.grade_counts ?? {}).length > 0 && (
                            <div className="rounded-xl border border-white/[0.06] bg-hub-bg/30 p-4">
                              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-hub-text-muted">
                                Grade distribution
                              </p>
                              <GradeHistogram
                                gradeCounts={sunsetSummary?.grade_counts ?? {}}
                                sampleSize={sunsetSampleSize}
                              />
                            </div>
                          )}

                        {/* GPA headline */}
                        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/[0.06] bg-hub-bg/30 p-4">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-hub-text-muted">
                              SunSET ·{" "}
                              {dossier.sunsetGradeDistribution?.term_label ??
                                "Most recent"}
                            </p>
                            {sunsetSummary?.average_gpa != null && (
                              <p className="mt-1 text-3xl font-bold text-hub-cyan">
                                {sunsetSummary.average_gpa}
                                <span className="ml-1 text-sm font-normal text-hub-text-muted">
                                  avg GPA
                                </span>
                              </p>
                            )}
                            {sunsetSummary?.sample_size != null && (
                              <p className="text-xs text-hub-text-muted">
                                n = {sunsetSummary.sample_size} students
                              </p>
                            )}
                          </div>
                          {dossier.sunsetGradeDistribution
                            ?.recommend_professor_percent != null && (
                            <div className="ml-auto text-right">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-hub-text-muted">
                                Recommend Prof
                              </p>
                              <p className="text-2xl font-bold text-emerald-400">
                                {Math.round(
                                  dossier.sunsetGradeDistribution
                                    .recommend_professor_percent,
                                )}
                                %
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Grade group breakdown */}
                        {sunsetPrimaryGroups.length > 0 && (
                          <div className="space-y-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-hub-text-muted">
                              By letter group
                            </p>
                            {sunsetPrimaryGroups.map((group) => (
                              <div key={group.label}>
                                <div className="mb-1 flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="h-2.5 w-2.5 rounded-full"
                                      style={{ backgroundColor: group.color }}
                                    />
                                    <span className="font-semibold text-hub-text">
                                      {group.label}
                                    </span>
                                    {group.breakdown.length > 0 && (
                                      <span className="text-hub-text-muted">
                                        {group.breakdown.join("  ")}
                                      </span>
                                    )}
                                  </div>
                                  <span
                                    className="font-bold"
                                    style={{ color: group.color }}
                                  >
                                    {formatPercent(group.percent)}
                                  </span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-hub-bg/80">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${group.percent}%`,
                                      backgroundColor: group.color,
                                      opacity: 0.8,
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {dossier.sunsetGradeDistribution?.source_url && (
                          <a
                            href={dossier.sunsetGradeDistribution.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-hub-cyan hover:underline"
                          >
                            View on SunSET <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </>
                    ) : (
                      <EmptyFeedback label="No grade distribution data available." />
                    )}
                  </div>
                )}

                {modalTab === "syllabus" && (
                  <div className="space-y-3">
                    {syllabusQuotes.length > 0 ? (
                      syllabusQuotes.map((q) => <SourceCard key={q.id} quote={q} />)
                    ) : dossier.rawQuotes.filter((q) => !q.source.toLowerCase().includes("reddit")).length > 0 ? (
                      dossier.rawQuotes
                        .filter((q) => !q.source.toLowerCase().includes("reddit"))
                        .map((q) => <SourceCard key={q.id} quote={q} />)
                    ) : dossier.logistics != null ? (
                      // Research ran but no syllabus content was found
                      <EmptyFeedback label="Online syllabus not found for this course." />
                    ) : (
                      // Research hasn't run yet
                      <>
                        <p className="mb-3 text-[11px] text-hub-text-muted italic">
                          Fetching syllabus — check back shortly.
                        </p>
                        <SkeletonSourceCard />
                        <SkeletonSourceCard />
                      </>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Helpers & data ────────────────────────────────────────────────────────────

function sanitizeDashes(input: string) {
  if (!input) return input;
  return input.replace(/[–—]|--/g, ":");
}

type SunsetGroup = {
  label: string;
  color: string;
  percent: number;
  breakdown: string[];
};

type SunsetSegment = {
  grade: string;
  count: number;
  percent: number;
  color: string;
};

const SUNSET_GROUPS: Array<{
  label: string;
  grades: string[];
  color: string;
}> = [
  { label: "A", grades: ["A+", "A", "A-"], color: "#26c6da" },
  { label: "B", grades: ["B+", "B", "B-"], color: "#4f8dfd" },
  { label: "C", grades: ["C+", "C", "C-"], color: "#8b5cf6" },
  { label: "D/F", grades: ["D+", "D", "D-", "F"], color: "#ff4d73" },
];

const SUNSET_SEGMENT_COLORS: Record<string, string> = {
  "A+": "#21c1df",
  "A": "#20b6d9",
  "A-": "#1599cb",
  "B+": "#6ca8ff",
  "B": "#4f8dfd",
  "B-": "#386fda",
  "C+": "#a78bfa",
  "C": "#8b5cf6",
  "C-": "#7c3aed",
  "D+": "#ff7b94",
  "D": "#ff6281",
  "D-": "#ff5578",
  "F": "#ff4169",
  "P": "#7dd3fc",
  "NP": "#94a3b8",
  "S": "#67e8f9",
  "U": "#a78bfa",
  "W": "#64748b",
  "EW": "#475569",
  "I": "#334155",
};

function formatPercent(percent: number) {
  if (percent >= 10) return `${Math.round(percent)}%`;
  if (percent >= 1) return `${percent.toFixed(1).replace(/\.0$/, "")}%`;
  return `${percent.toFixed(1)}%`;
}

function getPrimarySunsetGroups(
  gradeCounts: Record<string, number>,
  sampleSize: number,
): SunsetGroup[] {
  if (!sampleSize) return [];

  return SUNSET_GROUPS.map((group) => {
    const breakdown = group.grades
      .filter((grade) => (gradeCounts[grade] ?? 0) > 0)
      .map(
        (grade) =>
          `${grade}: ${formatPercent(
            ((gradeCounts[grade] ?? 0) / sampleSize) * 100,
          )}`,
      );

    const total = group.grades.reduce(
      (sum, grade) => sum + (gradeCounts[grade] ?? 0),
      0,
    );

    return {
      label: group.label,
      color: group.color,
      percent: (total / sampleSize) * 100,
      breakdown,
    };
  }).filter((group) => group.percent > 0);
}

function getSunsetSegments(
  gradeCounts: Record<string, number>,
  sampleSize: number,
): SunsetSegment[] {
  if (!sampleSize) return [];

  return Object.entries(gradeCounts)
    .filter(([, count]) => count > 0)
    .map(([grade, count]) => ({
      grade,
      count,
      percent: (count / sampleSize) * 100,
      color: SUNSET_SEGMENT_COLORS[grade] ?? "#64748b",
    }))
    .sort((a, b) => gradeSortIndex(a.grade) - gradeSortIndex(b.grade));
}

function gradeSortIndex(grade: string) {
  const order = [
    "A+","A","A-","B+","B","B-","C+","C","C-",
    "D+","D","D-","F","P","NP","S","U","W","EW","I",
  ];
  const index = order.indexOf(grade);
  return index === -1 ? order.length : index;
}
