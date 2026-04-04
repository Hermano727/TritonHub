"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { IngestionHub } from "@/components/ingestion/IngestionHub";
import { ProcessingModal } from "@/components/modals/ProcessingModal";
import { ClassCard } from "@/components/dashboard/ClassCard";
import { EvaluatorFooter } from "@/components/dashboard/EvaluatorFooter";
import { mockDossier } from "@/lib/mock/dossier";
import { createClient } from "@/lib/supabase/client";
import { buildPayloadFromMock, parsePlanPayload } from "@/lib/hub/plan-payload";
import { vaultRowToVaultItem } from "@/lib/hub/vault-map";
import type { SavedPlanRow, VaultItemRow } from "@/types/saved-plan";
import type { UiPhase } from "@/types/dossier";

const LINE_MS = 360;
const FINISH_PAD_MS = 650;

export function CommandCenter() {
  const [phase, setPhase] = useState<UiPhase>("idle");
  const [ingestionCollapsed, setIngestionCollapsed] = useState(false);
  const [activePlanId, setActivePlanId] = useState(mockDossier.activeQuarterId);
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [authed, setAuthed] = useState(false);
  const [remotePlans, setRemotePlans] = useState<SavedPlanRow[]>([]);
  const [remoteVault, setRemoteVault] = useState<VaultItemRow[]>([]);
  const timeoutsRef = useRef<number[]>([]);
  const processingLockRef = useRef(false);
  const activePlanIdRef = useRef(activePlanId);
  const remotePlansRef = useRef(remotePlans);
  const authedRef = useRef(authed);

  activePlanIdRef.current = activePlanId;
  remotePlansRef.current = remotePlans;
  authedRef.current = authed;

  const clearRun = useCallback(() => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  }, []);

  useEffect(() => () => clearRun(), [clearRun]);

  const loadHubData = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAuthed(false);
        setRemotePlans([]);
        setRemoteVault([]);
        setActivePlanId(mockDossier.activeQuarterId);
        return;
      }
      setAuthed(true);
      const [plansRes, vaultRes] = await Promise.all([
        supabase.from("saved_plans").select("*").order("updated_at", {
          ascending: false,
        }),
        supabase.from("vault_items").select("*").order("updated_at", {
          ascending: false,
        }),
      ]);
      const plans = (plansRes.data as SavedPlanRow[] | null) ?? [];
      const vault = (vaultRes.data as VaultItemRow[] | null) ?? [];
      setRemotePlans(plans);
      setRemoteVault(vault);
      if (plans.length > 0) {
        setActivePlanId((prev) =>
          plans.some((p) => p.id === prev) ? prev : plans[0].id,
        );
      } else {
        setActivePlanId("");
      }
    } catch {
      setAuthed(false);
      setRemotePlans([]);
      setRemoteVault([]);
      setActivePlanId(mockDossier.activeQuarterId);
    }
  }, []);

  useEffect(() => {
    void loadHubData();
  }, [loadHubData]);

  const quarterLabel = useMemo(() => {
    if (!authed) {
      return (
        mockDossier.quarters.find((q) => q.id === activePlanId)?.label ??
        "Spring 2026"
      );
    }
    const plan = remotePlans.find((p) => p.id === activePlanId);
    if (plan?.quarter_label) return plan.quarter_label;
    if (plan) {
      const { activeQuarterId: aid } = parsePlanPayload(plan.payload);
      if (aid) {
        const q = mockDossier.quarters.find((x) => x.id === aid);
        if (q) return q.label;
      }
    }
    return "Schedule";
  }, [authed, activePlanId, remotePlans]);

  const sidebarPlans = useMemo(() => {
    if (!authed) {
      return mockDossier.quarters.map((q) => ({
        id: q.id,
        label: q.label,
      }));
    }
    return remotePlans.map((p) => ({
      id: p.id,
      label: p.title?.trim() || "Untitled plan",
      subtitle:
        p.quarter_label ||
        (p.status === "draft" ? "Draft" : undefined) ||
        undefined,
    }));
  }, [authed, remotePlans]);

  const sidebarVault = useMemo(() => {
    if (!authed) return mockDossier.vaultItems;
    return remoteVault
      .filter(
        (v) =>
          !activePlanId ||
          v.plan_id === null ||
          v.plan_id === activePlanId,
      )
      .map(vaultRowToVaultItem);
  }, [authed, remoteVault, activePlanId]);

  const { viewClasses, viewEvaluation } = useMemo(() => {
    if (phase !== "dashboard") {
      return {
        viewClasses: mockDossier.classes,
        viewEvaluation: mockDossier.evaluation,
      };
    }
    if (!authed) {
      return {
        viewClasses: mockDossier.classes,
        viewEvaluation: mockDossier.evaluation,
      };
    }
    const plan = remotePlans.find((p) => p.id === activePlanId);
    if (!plan) {
      return { viewClasses: [], viewEvaluation: mockDossier.evaluation };
    }
    const parsed = parsePlanPayload(plan.payload);
    if (parsed.classes.length === 0) {
      return {
        viewClasses: [],
        viewEvaluation: parsed.evaluation,
      };
    }
    return {
      viewClasses: parsed.classes,
      viewEvaluation: parsed.evaluation,
    };
  }, [phase, authed, activePlanId, remotePlans]);

  const classCount =
    phase === "dashboard" ? viewClasses.length : mockDossier.classes.length;

  const persistCompletedDemo = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      let ql = "Spring 2026";
      const pid = activePlanIdRef.current;
      if (authedRef.current) {
        const p = remotePlansRef.current.find((x) => x.id === pid);
        if (p?.quarter_label) ql = p.quarter_label;
      } else {
        ql =
          mockDossier.quarters.find((q) => q.id === pid)?.label ?? ql;
      }

      const payload = buildPayloadFromMock(mockDossier.activeQuarterId);
      const titleSuffix = new Date().toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      const { data: inserted } = await supabase
        .from("saved_plans")
        .insert({
          user_id: user.id,
          title: `${ql} · ${titleSuffix}`,
          quarter_label: ql,
          status: "complete",
          payload_version: 1,
          payload,
        })
        .select("id")
        .single();

      const [plansRes, vaultRes] = await Promise.all([
        supabase.from("saved_plans").select("*").order("updated_at", {
          ascending: false,
        }),
        supabase.from("vault_items").select("*").order("updated_at", {
          ascending: false,
        }),
      ]);
      setAuthed(true);
      setRemotePlans((plansRes.data as SavedPlanRow[] | null) ?? []);
      setRemoteVault((vaultRes.data as VaultItemRow[] | null) ?? []);
      if (inserted?.id) setActivePlanId(inserted.id as string);
    } catch {
      /* ignore persistence errors in demo flow */
    }
  }, []);

  const startProcessing = useCallback(() => {
    if (processingLockRef.current) return;
    processingLockRef.current = true;
    clearRun();
    setPhase("processing");
    setTerminalLines([]);
    const script = mockDossier.terminalScript;
    script.forEach((line, idx) => {
      const id = window.setTimeout(() => {
        setTerminalLines((prev) => [...prev, line]);
      }, idx * LINE_MS);
      timeoutsRef.current.push(id);
    });
    const doneId = window.setTimeout(() => {
      setPhase("dashboard");
      setIngestionCollapsed(true);
      processingLockRef.current = false;
      clearRun();
      void persistCompletedDemo();
    }, script.length * LINE_MS + FINISH_PAD_MS);
    timeoutsRef.current.push(doneId);
  }, [clearRun, persistCompletedDemo]);

  const handleFilesSelected = useCallback(() => {
    startProcessing();
  }, [startProcessing]);

  const handleManualSubmit = useCallback(() => {
    startProcessing();
  }, [startProcessing]);

  const resetDemo = useCallback(() => {
    clearRun();
    processingLockRef.current = false;
    setPhase("idle");
    setIngestionCollapsed(false);
    setTerminalLines([]);
  }, [clearRun]);

  const handleNewPlan = useCallback(async () => {
    if (!authed) return;
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("saved_plans")
        .insert({
          user_id: user.id,
          title: "Untitled plan",
          quarter_label: "",
          status: "draft",
          payload_version: 1,
          payload: {},
        })
        .select("id")
        .single();
      if (error) return;
      await loadHubData();
      if (data?.id) setActivePlanId(data.id as string);
      resetDemo();
    } catch {
      /* ignore */
    }
  }, [authed, loadHubData, resetDemo]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1 overflow-y-auto px-4 py-4 pb-10 lg:px-6">
          <div
            className={`mx-auto max-w-4xl ${phase === "processing" ? "pointer-events-none blur-[2px]" : ""}`}
          >
            <nav
              className="mb-4 flex flex-wrap items-center gap-1 text-xs text-hub-text-muted"
              aria-label="Breadcrumb"
            >
              <span>Schedules</span>
              <ChevronRight className="h-3 w-3" aria-hidden />
              <span className="font-medium text-hub-text-secondary">
                {quarterLabel}
              </span>
              {phase === "dashboard" ? (
                <>
                  <ChevronRight className="h-3 w-3" aria-hidden />
                  <span className="text-hub-cyan">Dossier view</span>
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
                      No dossier data for this plan yet. Run ingestion above or
                      pick another saved plan.
                    </p>
                  ) : (
                    viewClasses.map((c) => (
                      <ClassCard key={c.id} dossier={c} />
                    ))
                  )}
                  <EvaluatorFooter evaluation={viewEvaluation} />
                  <p className="pt-2 text-center text-[11px] text-hub-text-muted">
                    <button
                      type="button"
                      onClick={resetDemo}
                      className="underline decoration-white/20 underline-offset-2 hover:text-hub-cyan"
                    >
                      Reset demo state
                    </button>
                  </p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </main>
        <RightSidebar
          planSectionTitle={authed ? "Saved plans" : "My Quarters"}
          plans={sidebarPlans}
          activePlanId={activePlanId}
          onSelectPlan={setActivePlanId}
          newPlanLabel={
            authed ? "New saved plan" : "New quarter research"
          }
          onNewPlan={authed ? handleNewPlan : undefined}
          vaultItems={sidebarVault}
          vaultSynced={authed}
        />
      </div>

      <ProcessingModal open={phase === "processing"} lines={terminalLines} />
    </div>
  );
}
