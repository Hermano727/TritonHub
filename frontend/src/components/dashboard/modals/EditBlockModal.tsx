"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { COMMITMENT_PRESETS } from "@/components/dashboard/commitmentPresets";
import type { CourseBlock, CommitmentBlock } from "@/components/dashboard/WeeklyCalendar";

type Props = {
  block: CourseBlock | CommitmentBlock | null;
  title: string;
  day: number;
  start: string;
  end: string;
  color: string;
  location: string;
  error: string | null;
  onTitleChange: (v: string) => void;
  onDayChange: (v: number) => void;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onColorChange: (v: string) => void;
  onLocationChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onDeleteCommitment: () => void;
  onDeleteMeeting: () => void;
};

export function EditBlockModal({
  block, title, day, start, end, color, location, error,
  onTitleChange, onDayChange, onStartChange, onEndChange, onColorChange, onLocationChange,
  onClose, onSubmit, onDeleteCommitment, onDeleteMeeting,
}: Props) {
  return (
    <AnimatePresence>
      {block && (
        <motion.div
          key="edit-block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={block.kind === "commitment" ? "Edit personal block" : "Edit course meeting"}
          onClick={onClose}
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
                {block.kind === "commitment" ? "Edit block" : `Edit ${block.courseCode}`}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-hub-text-muted hover:bg-white/5 hover:text-hub-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {block.kind === "commitment" && (
                <label className="block">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">Title</span>
                  <input
                    value={title}
                    onChange={(e) => onTitleChange(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none ring-hub-cyan/30 placeholder:text-hub-text-muted focus:ring-2"
                  />
                </label>
              )}

              <label className="block">
                <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">Day</span>
                <select
                  value={day}
                  onChange={(e) => onDayChange(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none focus:ring-2 focus:ring-hub-cyan/30"
                >
                  {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d, i) => (
                    <option key={d} value={i}>{d}</option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">Start</span>
                  <input
                    type="time"
                    value={start}
                    onChange={(e) => onStartChange(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none focus:ring-2 focus:ring-hub-cyan/30"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">End</span>
                  <input
                    type="time"
                    value={end}
                    onChange={(e) => onEndChange(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none focus:ring-2 focus:ring-hub-cyan/30"
                  />
                </label>
              </div>

              {block.kind === "course" && (
                <label className="block">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">Location</span>
                  <input
                    value={location}
                    onChange={(e) => onLocationChange(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-hub-bg/60 px-3 py-2 text-sm text-hub-text outline-none ring-hub-cyan/30 placeholder:text-hub-text-muted focus:ring-2"
                    placeholder="e.g. CSB 001"
                  />
                </label>
              )}

              {block.kind === "commitment" && (
                <div>
                  <span className="text-[11px] font-medium uppercase tracking-wide text-hub-text-muted">Color</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {COMMITMENT_PRESETS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => onColorChange(p.value)}
                        title={p.label}
                        className={`h-8 w-8 rounded-full border-2 transition ${
                          color === p.value ? "scale-110 border-white" : "border-transparent hover:border-white/30"
                        }`}
                        style={{ backgroundColor: p.value }}
                      />
                    ))}
                  </div>
                  <div className="relative mt-3 h-10 w-full overflow-hidden rounded-lg border border-white/[0.14] bg-hub-bg/50">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => onColorChange(e.target.value)}
                      className="absolute inset-0 h-full min-h-[3rem] w-full cursor-pointer border-0 bg-transparent p-0 [appearance:none] [-webkit-appearance:none] [&::-webkit-color-swatch-wrapper]:border-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-md"
                      aria-label="Custom color hue picker"
                    />
                  </div>
                </div>
              )}

              {error && <Alert variant="error">{error}</Alert>}
            </div>

            <div className="mt-6 flex items-center justify-between gap-2">
              {block.kind === "commitment" ? (
                <button
                  type="button"
                  onClick={onDeleteCommitment}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-hub-danger hover:bg-hub-danger/10"
                >
                  Delete
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onDeleteMeeting}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-hub-danger hover:bg-hub-danger/10"
                >
                  Remove meeting
                </button>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-hub-text-muted hover:bg-white/5 hover:text-hub-text"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSubmit}
                  className="rounded-lg bg-hub-cyan/20 px-4 py-2 text-sm font-semibold text-hub-cyan ring-1 ring-hub-cyan/40 hover:bg-hub-cyan/25"
                >
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
