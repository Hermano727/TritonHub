"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  buildPayloadFromClasses,
  parsePlanPayload,
  type SavedPlanPayloadV1,
} from "@/lib/hub/plan-payload";
import { vaultRowToVaultItem } from "@/lib/hub/vault-map";
import { mockDossier } from "@/lib/mock/dossier";
import type { SavedPlanRow, VaultItemRow } from "@/types/saved-plan";
import type {
  ClassDossier,
  ScheduleCommitment,
  ScheduleEvaluation,
  UiPhase,
  VaultItem,
} from "@/types/dossier";
import type { DossierScheduleWorkspaceHandle } from "@/components/dashboard/DossierScheduleWorkspace";

type SidebarPlan = { id: string; label: string; subtitle?: string };

type UsePlanSyncReturn = {
  authed: boolean;
  activePlanId: string;
  setActivePlanId: (id: string) => void;
  quarterLabel: string;
  sidebarPlans: SidebarPlan[];
  sidebarVault: VaultItem[];
  viewClasses: ClassDossier[];
  viewEvaluation: ScheduleEvaluation;
  viewCommitments: ScheduleCommitment[];
  persistCompletedSession: (payload: SavedPlanPayloadV1) => Promise<void>;
  handleSaveOverwrite: () => Promise<void>;
  handleSaveAsNew: () => Promise<void>;
  handleNewPlan: () => Promise<void>;
  handleDeletePlan: (id: string) => Promise<void>;
};

type Params = {
  phase: UiPhase;
  classes: ClassDossier[];
  evaluation: ScheduleEvaluation;
  workspaceRef: RefObject<DossierScheduleWorkspaceHandle | null>;
  onPlanCreated?: () => void;
};

export function usePlanSync({
  phase,
  classes,
  evaluation,
  workspaceRef,
  onPlanCreated,
}: Params): UsePlanSyncReturn {
  const [authed, setAuthed] = useState(false);
  const [remotePlans, setRemotePlans] = useState<SavedPlanRow[]>([]);
  const [remoteVault, setRemoteVault] = useState<VaultItemRow[]>([]);
  const [activePlanId, setActivePlanId] = useState(mockDossier.activeQuarterId);

  const activePlanIdRef = useRef(activePlanId);
  const remotePlansRef = useRef(remotePlans);
  const authedRef = useRef(authed);

  activePlanIdRef.current = activePlanId;
  remotePlansRef.current = remotePlans;
  authedRef.current = authed;

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
        supabase.from("saved_plans").select("*").order("updated_at", { ascending: false }),
        supabase.from("vault_items").select("*").order("updated_at", { ascending: false }),
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

  const sidebarPlans = useMemo<SidebarPlan[]>(() => {
    if (!authed) {
      return mockDossier.quarters.map((q) => ({ id: q.id, label: q.label }));
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

  const sidebarVault = useMemo<VaultItem[]>(() => {
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

  const { viewClasses, viewEvaluation, viewCommitments } = useMemo(() => {
    if (phase !== "dashboard" || !authed) {
      return { viewClasses: classes, viewEvaluation: evaluation, viewCommitments: [] as ScheduleCommitment[] };
    }
    const plan = remotePlans.find((p) => p.id === activePlanId);
    if (plan) {
      const parsed = parsePlanPayload(plan.payload);
      if (parsed.classes.length > 0) {
        return {
          viewClasses: parsed.classes,
          viewEvaluation: parsed.evaluation,
          viewCommitments: parsed.commitments ?? [],
        };
      }
    }
    return { viewClasses: classes, viewEvaluation: evaluation, viewCommitments: [] as ScheduleCommitment[] };
  }, [phase, authed, activePlanId, remotePlans, classes, evaluation]);

  const persistCompletedSession = useCallback(async (payload: SavedPlanPayloadV1) => {
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
        ql = mockDossier.quarters.find((q) => q.id === pid)?.label ?? ql;
      }

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
        supabase.from("saved_plans").select("*").order("updated_at", { ascending: false }),
        supabase.from("vault_items").select("*").order("updated_at", { ascending: false }),
      ]);
      setAuthed(true);
      setRemotePlans((plansRes.data as SavedPlanRow[] | null) ?? []);
      setRemoteVault((vaultRes.data as VaultItemRow[] | null) ?? []);
      if (inserted?.id) setActivePlanId(inserted.id as string);
    } catch {
      /* ignore persistence errors */
    }
  }, []);

  const _buildActiveQ = () => {
    const pid = activePlanIdRef.current;
    return !authedRef.current && mockDossier.quarters.some((q) => q.id === pid)
      ? pid
      : mockDossier.activeQuarterId;
  };

  const handleSaveOverwrite = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const pid = activePlanIdRef.current;
      const activeQ = _buildActiveQ();
      const editorClasses = workspaceRef.current?.getCurrentClasses() ?? viewClasses;
      const editorCommitments = workspaceRef.current?.getCurrentCommitments() ?? [];
      const payload = buildPayloadFromClasses(activeQ, editorClasses, editorCommitments, viewEvaluation);

      if (!pid) {
        const titleSuffix = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
        const qLabel = mockDossier.quarters.find((q) => q.id === activeQ)?.label ?? "";
        const { data } = await supabase
          .from("saved_plans")
          .insert({
            user_id: user.id,
            title: `${qLabel || "Schedule"} · ${titleSuffix}`,
            quarter_label: qLabel,
            status: "draft",
            payload_version: 1,
            payload,
          })
          .select("id")
          .single();
        if (data?.id) setActivePlanId(data.id as string);
      } else {
        await supabase.from("saved_plans").update({ payload, payload_version: 1 }).eq("id", pid);
      }
      await loadHubData();
    } catch {
      /* ignore save errors */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewClasses, viewEvaluation, loadHubData, workspaceRef]);

  const handleSaveAsNew = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const activeQ = _buildActiveQ();
      const editorClasses = workspaceRef.current?.getCurrentClasses() ?? viewClasses;
      const editorCommitments = workspaceRef.current?.getCurrentCommitments() ?? [];
      const payload = buildPayloadFromClasses(activeQ, editorClasses, editorCommitments, viewEvaluation);

      const titleSuffix = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const qLabel = mockDossier.quarters.find((q) => q.id === activeQ)?.label ?? "";
      const { data } = await supabase
        .from("saved_plans")
        .insert({
          user_id: user.id,
          title: `${qLabel || "Schedule"} · ${titleSuffix}`,
          quarter_label: qLabel,
          status: "draft",
          payload_version: 1,
          payload,
        })
        .select("id")
        .single();
      if (data?.id) setActivePlanId(data.id as string);
      await loadHubData();
    } catch {
      /* ignore save errors */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewClasses, viewEvaluation, loadHubData, workspaceRef]);

  const handleNewPlan = useCallback(async () => {
    if (!authedRef.current) return;
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
      onPlanCreated?.();
    } catch {
      /* ignore */
    }
  }, [loadHubData, onPlanCreated]);

  const handleDeletePlan = useCallback(async (id: string) => {
    if (!authedRef.current) return;
    try {
      const supabase = createClient();
      await supabase.from("saved_plans").delete().eq("id", id);
      await loadHubData();
      if (activePlanIdRef.current === id) setActivePlanId("");
    } catch {
      /* ignore delete errors */
    }
  }, [loadHubData]);

  return {
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
  };
}
