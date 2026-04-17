"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import type { ScheduleEvaluation } from "@/types/dossier";

function scoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct <= 0.4) return "#4dd9c0"; // desaturated success
  if (pct <= 0.65) return "#d4a520"; // desaturated gold
  return "#f05a5a"; // desaturated danger
}

function trendBadgeClass(score: number, max: number): string {
  const pct = score / max;
  if (pct <= 0.4) return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (pct <= 0.65) return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  return "border-red-400/20 bg-red-400/10 text-red-300";
}

function useCountUp(target: number, duration = 900) {
  const reduce = useReducedMotion();
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (reduce) { setVal(target); return; }
    setVal(0);
    const t0 = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      setVal(target * (1 - Math.pow(1 - p, 4)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduce]);
  return reduce ? target : val;
}

function splitBullets(text: string): string[] {
  return text
    .split(/\.\s+/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s.length > 8);
}

function HudInfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="flex items-center text-hub-text-muted transition hover:text-hub-text-secondary"
        aria-label="Score explanation"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {visible && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-lg border border-white/[0.12] bg-hub-surface p-2.5 text-[11px] leading-relaxed text-hub-text-secondary shadow-xl">
          {text}
        </div>
      )}
    </div>
  );
}

type Props = { evaluation: ScheduleEvaluation; isHero?: boolean };

export function DifficultyScoreHud({ evaluation, isHero = false }: Props) {
  const reduce = useReducedMotion();
  const displayScore = useCountUp(evaluation.fitnessScore);
  const color = scoreColor(evaluation.fitnessScore, evaluation.fitnessMax);
  const cats = evaluation.categories ?? [];
  const bullets = evaluation.recommendation ? splitBullets(evaluation.recommendation) : [];

  return (
    <section className="w-full overflow-hidden rounded-xl border border-white/[0.08] bg-hub-surface/95 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className={`font-[family-name:var(--font-outfit)] font-semibold text-white/90 ${isHero ? "text-base" : "text-sm"}`}>
            Difficulty score
          </h2>
          <HudInfoTooltip text="Commute · density · employment — 1 = easy, 10 = very hard" />
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${trendBadgeClass(evaluation.fitnessScore, evaluation.fitnessMax)}`}>
          {evaluation.trendLabel}
        </span>
      </div>

      {/* Body: score digit | category sparklines */}
      <div className="flex items-stretch">
        {/* Score */}
        <div className={`flex shrink-0 flex-col items-start justify-center gap-1 ${isHero ? "w-52 px-8 py-8" : "w-36 px-4 py-5"}`}>
          <motion.span
            className={`font-[family-name:var(--font-outfit)] font-bold tabular-nums leading-none ${isHero ? "text-8xl" : "text-5xl"}`}
            style={{ color }}
            initial={reduce ? false : { opacity: 0, scale: 0.75 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 280, damping: 22, delay: 0.05 }}
          >
            {displayScore.toFixed(1)}
          </motion.span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">out of {evaluation.fitnessMax}</span>
        </div>

        {/* Separator */}
        <div className="w-px shrink-0 bg-white/[0.06]" />

        {/* Category sparklines — 2px Stripe-style */}
        {cats.length > 0 && (
          <div className={`flex flex-1 flex-col justify-center ${isHero ? "gap-5 px-8 py-8" : "gap-3.5 px-5 py-5"}`}>
            {cats.map((cat, i) => (
              <div key={cat.label} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-white/40">{cat.label}</span>
                <div className="relative h-[2px] flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      backgroundColor: cat.color,
                      boxShadow: `0 0 6px ${cat.color}60`,
                    }}
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${(cat.score / cat.max) * 100}%` }}
                    transition={{ duration: 0.7, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <span
                  className="w-7 shrink-0 text-right font-[family-name:var(--font-jetbrains-mono)] text-sm font-bold tabular-nums"
                  style={{ color: cat.color }}
                >
                  {cat.score.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Alerts */}
      {evaluation.alerts.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-white/[0.05] px-4 py-3">
          {evaluation.alerts.map((a) => (
            <span
              key={a.id}
              title={a.detail}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                a.severity === "critical"
                  ? "border-hub-danger/25 bg-hub-danger/10 text-hub-danger"
                  : a.severity === "warning"
                  ? "border-hub-gold/25 bg-hub-gold/10 text-hub-gold"
                  : "border-hub-cyan/20 bg-hub-cyan/8 text-hub-cyan"
              }`}
            >
              {a.severity === "critical" ? <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                : a.severity === "warning" ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                : <Info className="h-3.5 w-3.5" aria-hidden />}
              {a.title}
            </span>
          ))}
        </div>
      )}

      {/* Advisor note — left-border section, no background box */}
      {bullets.length > 0 && (
        <div className="border-t border-white/[0.05] px-6 py-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-white/40">
            Advisor note
          </p>
          <ul className="max-w-[65ch] space-y-3 border-l-2 border-hub-cyan/20 pl-4">
            {bullets.map((b, i) => (
              <li
                key={i}
                className="text-[13px] text-white/80"
                style={{ lineHeight: 1.65 }}
              >
                {b}.
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
