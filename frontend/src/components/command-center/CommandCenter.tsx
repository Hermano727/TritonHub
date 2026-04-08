"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { IngestionHub } from "@/components/ingestion/IngestionHub";
import { ProcessingModal } from "@/components/modals/ProcessingModal";
import { DossierScheduleWorkspace, type DossierScheduleWorkspaceHandle } from "@/components/dashboard/DossierScheduleWorkspace";
import { SaveMenu } from "@/components/command-center/SaveMenu";
import { usePlanSync } from "@/hooks/usePlanSync";
import { mockDossier } from "@/lib/mock/dossier";
import { buildPayloadFromClasses } from "@/lib/hub/plan-payload";
import { analyzeFit, researchScreenshot } from "@/lib/api/parse";
import { courseResearchResultToDossier } from "@/lib/mappers/courseEntryToDossier";
import { dossiersToScheduleItems } from "@/lib/mappers/dossiersToScheduleItems";
import type { ClassDossier, ScheduleEvaluation, UiPhase } from "@/types/dossier";

const LINE_MS = 360;
const FINISH_PAD_MS = 650;

export function CommandCenter() {
  const [phase, setPhase] = useState<UiPhase>("idle");
  const [ingestionCollapsed, setIngestionCollapsed] = useState(false);
  const [classes, setClasses] = useState<ClassDossier[]>(mockDossier.classes);
  const [evaluation, setEvaluation] = useState<ScheduleEvaluation>(mockDossier.evaluation);
  const [saveMenuOpen, setSaveMenuOpen] = useState(false);

  const workspaceRef = useRef<DossierScheduleWorkspaceHandle | null>(null);
  const timeoutsRef = useRef<number[]>([]);
  const processingLockRef = useRef(false);

  const clearRun = useCallback(() => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  }, []);

  useEffect(() => () => clearRun(), [clearRun]);

  const resetDemo = useCallback(() => {
    clearRun();
    processingLockRef.current = false;
    setPhase("idle");
    setIngestionCollapsed(false);
    setClasses(mockDossier.classes);
    setEvaluation(mockDossier.evaluation);
  }, [clearRun]);

  const {
    authed,
    activePlanId,
    setActivePlanId,
    quarterLabel,
    sidebarPlans,
    sidebarVault,
    viewClasses,
    viewEvaluation,
    viewCommitments,
    persistCompletedSession,
    handleSaveOverwrite,
    handleSaveAsNew,
    handleNewPlan,
    handleDeletePlan,
  } = usePlanSync({
    phase,
    classes,
    evaluation,
    workspaceRef,
    onPlanCreated: resetDemo,
  });

  const runIngestionFlow = useCallback(
    async (imageFile: File | undefined) => {
      if (processingLockRef.current) return;
      processingLockRef.current = true;
      clearRun();
      setPhase("processing");

      const started = Date.now();
      let nextClasses: ClassDossier[] = mockDossier.classes;
      let nextEvaluation: ScheduleEvaluation = mockDossier.evaluation;

      if (imageFile?.type.startsWith("image/")) {
        try {
          console.debug("runIngestionFlow: calling researchScreenshot with file:", imageFile?.name, imageFile?.type);
          const response = await researchScreenshot(imageFile);
          console.debug("runIngestionFlow: researchScreenshot response:", response);
          const parsed = response.results.map(courseResearchResultToDossier);
          if (parsed.length > 0) nextClasses = parsed;

          const minWaitPromise = new Promise<void>((resolve) => {
            const elapsed = Date.now() - started;
            const remaining = Math.max(0, FINISH_PAD_MS - elapsed);
            const id = window.setTimeout(() => resolve(), remaining);
            timeoutsRef.current.push(id);
          });

          const [fitResult] = await Promise.all([
            analyzeFit(response.results).catch(() => null),
            minWaitPromise,
          ]);

          if (fitResult) {
            nextEvaluation = {
              fitnessScore: fitResult.fitness_score,
              fitnessMax: fitResult.fitness_max,
              trendLabel: fitResult.trend_label,
              categories: fitResult.categories ?? undefined,
              alerts: fitResult.alerts,
              recommendation: fitResult.recommendation,
            };
          }
        } catch (err) {
          console.error("runIngestionFlow: researchScreenshot failed:", err);
        }
      }

      if (nextClasses === mockDossier.classes || !imageFile?.type.startsWith("image/")) {
        const elapsed = Date.now() - started;
        const remaining = Math.max(0, FINISH_PAD_MS - elapsed);
        await new Promise<void>((resolve) => {
          const id = window.setTimeout(() => resolve(), remaining);
          timeoutsRef.current.push(id);
        });
      }

      clearRun();
      setClasses(nextClasses);
      setEvaluation(nextEvaluation);
      processingLockRef.current = false;
      setPhase("dashboard");
      setIngestionCollapsed(true);

      const payload = buildPayloadFromClasses(
        mockDossier.activeQuarterId,
        nextClasses,
        [],
        nextEvaluation,
      );
      await persistCompletedSession(payload);
    },
    [clearRun, persistCompletedSession],
  );

  const handleFilesSelected = useCallback(
    (files: FileList | File[]) => {
      console.debug("handleFilesSelected: files:", files);
      const imageFile = Array.from(files).find((f) => f.type.startsWith("image/"));
      console.debug("handleFilesSelected: selected imageFile:", imageFile?.name, imageFile?.type);
      void runIngestionFlow(imageFile);
    },
    [runIngestionFlow],
  );

  const handleManualSubmit = useCallback(
    (_payload: { professor: string; course: string; quarter: string }) => {
      void runIngestionFlow(undefined);
    },
    [runIngestionFlow],
  );

  const classCount = phase === "dashboard" ? viewClasses.length : classes.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <main
          className={`relative min-w-0 flex-1 overflow-y-auto py-4 pb-10 ${
            phase === "dashboard" ? "px-4 lg:pl-3 lg:pr-8" : "px-4 lg:px-6"
          }`}
        >
          <div
            className={`mx-auto w-full ${phase === "dashboard" ? "max-w-[min(100%,1760px)]" : "max-w-4xl"} ${phase === "processing" ? "pointer-events-none blur-[2px]" : ""}`}
          >
            <nav
              className="mb-4 flex flex-wrap items-center gap-1 text-xs text-hub-text-muted"
              aria-label="Breadcrumb"
            >
              <span>Schedules</span>
              <ChevronRight className="h-3 w-3" aria-hidden />
              <span className="font-medium text-hub-text-secondary">{quarterLabel}</span>
              {phase === "dashboard" ? (
                <>
                  <ChevronRight className="h-3 w-3" aria-hidden />
                  <span className="text-hub-cyan">Courses</span>
                </>
              ) : null}
            </nav>

            <IngestionHub
              phase={phase}
              collapsed={ingestionCollapsed}
              onToggleCollapse={() => setIngestionCollapsed((c) => !c)}
              onFilesSelected={handleFilesSelected}
              onManualSubmit={handleManualSubmit}
              classCount={classCount}
              quarterLabel={quarterLabel}
            />

            <AnimatePresence mode="popLayout">
              {phase === "dashboard" ? (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-4"
                >
                  {viewClasses.length === 0 ? (
                    <p className="rounded-xl border border-white/[0.08] bg-hub-bg/40 px-4 py-8 text-center text-sm text-hub-text-muted">
                      No schedule data for this plan yet. Upload your schedule above or select another saved plan.
                    </p>
                  ) : (
                    <DossierScheduleWorkspace
                      viewClasses={viewClasses}
                      evaluation={viewEvaluation}
                      hydrateKey={`${activePlanId}:${authed}`}
                      scheduleItems={dossiersToScheduleItems(viewClasses)}
                      transitionInsights={[]}
                      initialCommitments={viewCommitments}
                      ref={workspaceRef}
                      calendarHeaderActions={(
                        <div className="flex items-center gap-2">
                          <SaveMenu
                            open={saveMenuOpen}
                            onToggle={() => setSaveMenuOpen((s) => !s)}
                            onOverwrite={() => void handleSaveOverwrite()}
                            onSaveAsNew={() => void handleSaveAsNew()}
                            onClose={() => setSaveMenuOpen(false)}
                          />
                        </div>
                      )}
                    />
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </main>

        <RightSidebar
          planSectionTitle={authed ? "Saved plans" : "My Quarters"}
          plans={sidebarPlans}
          activePlanId={activePlanId}
          onSelectPlan={(id) => { setActivePlanId(id); setPhase("dashboard"); }}
          newPlanLabel={authed ? "New saved plan" : "New quarter research"}
          onNewPlan={authed ? handleNewPlan : undefined}
          onDeletePlan={authed ? handleDeletePlan : undefined}
          vaultItems={sidebarVault}
          vaultSynced={authed}
        />
      </div>

      <ProcessingModal open={phase === "processing"} />
    </div>
  );
}
