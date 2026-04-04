export type SavedPlanRow = {
  id: string;
  user_id: string;
  title: string;
  quarter_label: string;
  status: "draft" | "complete";
  payload_version: number;
  payload: unknown;
  source_image_path: string | null;
  created_at: string;
  updated_at: string;
};

export type VaultItemRow = {
  id: string;
  user_id: string;
  plan_id: string | null;
  name: string;
  kind: "syllabus" | "webreg" | "note";
  storage_path: string;
  updated_at: string;
};
