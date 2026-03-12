import type { Database } from "./database.types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectMember = Database["public"]["Tables"]["project_members"]["Row"];
export type ProjectFilters = Database["public"]["Tables"]["project_filters"]["Row"];
export type TenderRaw = Database["public"]["Tables"]["tenders_raw"]["Row"];
export type TenderScore = Database["public"]["Tables"]["tender_scores"]["Row"];
export type TenderModelScore = Database["public"]["Tables"]["tender_model_scores"]["Row"];
export type TenderFilterResult = Database["public"]["Tables"]["tender_filter_results"]["Row"];
export type TenderAnalysis = Database["public"]["Tables"]["tender_analysis"]["Row"];
export type PipelineState = Database["public"]["Tables"]["pipeline_state"]["Row"];

/** Tender enriched with model score and filter result — used in the Inbox. */
export interface InboxTender extends TenderRaw {
  model_score: number | null;
  human_score_avg: number | null;
  analysis_status: string | null; // 'pending' | 'running' | 'done' | 'error' | null
}

/** Tender with metadata for the Training section queue. */
export interface TrainingTender {
  id: number;
  title: string;
  summary: string;
  link: string;
  buyer_name: string;
  budget_amount: number | null;
  published_at: string;
  cpv: string | null;
  region: string | null;
  contract_type: string | null;
  procedure_type: string | null;
}

/** Tender with a confirmed model prediction — used in TEST THE TRAINING mode. */
export interface TestTender extends TrainingTender {
  model_score: number;
}

/** Scored tender entry for the Historial tab. */
export interface ScoredTenderEntry {
  tender_id: number;
  score: number;
  scored_at: string;
  title: string;
  cpv: string | null;
  region: string | null;
}

/** Score distribution entry for the training chart. */
export interface ScoreDistribution {
  score: number;
  count: number;
}

/** Attached file reference inside a tender analysis. */
export interface AttachedFile {
  name: string;
  url: string;
  type: string;
}
