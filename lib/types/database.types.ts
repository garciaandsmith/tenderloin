/**
 * Supabase database types.
 *
 * After creating the Supabase project and running supabase/schema.sql,
 * regenerate this file with:
 *   npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/types/database.types.ts
 *
 * The types below are hand-written stubs. Replace with generated types once the project is live.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          role: "admin" | "user";
          full_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: "admin" | "user";
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: "admin" | "user";
          full_name?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          is_active: boolean;
          training_session: number;
          prompt_technical: string | null;
          prompt_administrative: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          is_active?: boolean;
          training_session?: number;
          prompt_technical?: string | null;
          prompt_administrative?: string | null;
        };
        Update: {
          name?: string;
          description?: string | null;
          is_active?: boolean;
          updated_at?: string;
          training_session?: number;
          prompt_technical?: string | null;
          prompt_administrative?: string | null;
        };
        Relationships: [];
      };
      project_members: {
        Row: {
          project_id: string;
          user_id: string;
          assigned_at: string;
        };
        Insert: {
          project_id: string;
          user_id: string;
          assigned_at?: string;
        };
        Update: {
          assigned_at?: string;
        };
        Relationships: [];
      };
      project_filters: {
        Row: {
          id: string;
          project_id: string;
          budget_min: number | null;
          budget_max: number | null;
          regions: string[] | null;
          cpv_codes: string[] | null;
          contract_types: string[] | null;
          procedure_types: string[] | null;
          keywords_include: string[] | null;
          keywords_exclude: string[] | null;
          buyer_types: string[] | null;
          max_lot_count: number | null;
          min_contract_months: number | null;
          max_contract_months: number | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          budget_min?: number | null;
          budget_max?: number | null;
          regions?: string[] | null;
          cpv_codes?: string[] | null;
          contract_types?: string[] | null;
          procedure_types?: string[] | null;
          keywords_include?: string[] | null;
          keywords_exclude?: string[] | null;
          buyer_types?: string[] | null;
          max_lot_count?: number | null;
          min_contract_months?: number | null;
          max_contract_months?: number | null;
          updated_at?: string;
        };
        Update: {
          budget_min?: number | null;
          budget_max?: number | null;
          regions?: string[] | null;
          cpv_codes?: string[] | null;
          contract_types?: string[] | null;
          procedure_types?: string[] | null;
          keywords_include?: string[] | null;
          keywords_exclude?: string[] | null;
          buyer_types?: string[] | null;
          max_lot_count?: number | null;
          min_contract_months?: number | null;
          max_contract_months?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenders_raw: {
        Row: {
          id: number;
          external_id: string;
          title: string;
          summary: string;
          link: string;
          published_at: string;
          deadline_at: string | null;
          buyer_name: string;
          region: string;
          budget_amount: number | null;
          source: string;
          status: string | null;
          created_at: string;
          contract_type: string | null;
          procedure_type: string | null;
          lot_count: number | null;
          duration_months: number | null;
          buyer_type: string | null;
          cpv_codes: string[];
          region_label: string | null;
          cpv_labels: string[];
        };
        Insert: {
          id?: number;
          external_id: string;
          title: string;
          summary: string;
          link: string;
          published_at: string;
          deadline_at?: string | null;
          buyer_name: string;
          region: string;
          budget_amount?: number | null;
          source?: string;
          status?: string | null;
          created_at?: string;
          contract_type?: string | null;
          procedure_type?: string | null;
          lot_count?: number | null;
          duration_months?: number | null;
          buyer_type?: string | null;
          cpv_codes?: string[];
          region_label?: string | null;
          cpv_labels?: string[];
        };
        Update: {
          external_id?: string;
          title?: string;
          summary?: string;
          link?: string;
          published_at?: string;
          deadline_at?: string | null;
          buyer_name?: string;
          region?: string;
          budget_amount?: number | null;
          source?: string;
          status?: string | null;
          contract_type?: string | null;
          procedure_type?: string | null;
          lot_count?: number | null;
          duration_months?: number | null;
          buyer_type?: string | null;
          cpv_codes?: string[];
          region_label?: string | null;
          cpv_labels?: string[];
        };
        Relationships: [];
      };
      pipeline_state: {
        Row: {
          key: string;
          value: string;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: string;
          updated_at?: string;
        };
        Update: {
          value?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tender_scores: {
        Row: {
          id: number;
          tender_id: number;
          project_id: string;
          scored_by: string;
          score: number;
          scored_at: string;
          training_session: number;
        };
        Insert: {
          id?: number;
          tender_id: number;
          project_id: string;
          scored_by: string;
          score: number;
          scored_at?: string;
          training_session?: number;
        };
        Update: {
          score?: number;
          training_session?: number;
        };
        Relationships: [];
      };
      tender_model_scores: {
        Row: {
          id: number;
          tender_id: number;
          project_id: string;
          model_score: number;
          model_version: string;
          scored_at: string;
        };
        Insert: {
          id?: number;
          tender_id: number;
          project_id: string;
          model_score: number;
          model_version: string;
          scored_at?: string;
        };
        Update: {
          model_score?: number;
        };
        Relationships: [];
      };
      tender_filter_results: {
        Row: {
          id: number;
          tender_id: number;
          project_id: string;
          passed: boolean;
          discard_reasons: string[] | null;
          evaluated_at: string;
        };
        Insert: {
          id?: number;
          tender_id: number;
          project_id: string;
          passed: boolean;
          discard_reasons?: string[] | null;
          evaluated_at?: string;
        };
        Update: {
          passed?: boolean;
          discard_reasons?: string[] | null;
        };
        Relationships: [];
      };
      tender_analysis: {
        Row: {
          id: number;
          tender_id: number;
          analysis_type: "technical" | "administrative";
          project_id: string | null;
          triggered_by: string | null;
          status: "pending" | "running" | "done" | "error";
          services_required: string | null;
          administrative_conditions: string | null;
          attached_files: Json | null;
          raw_llm_output: Json | null;
          triggered_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: number;
          tender_id: number;
          analysis_type: "technical" | "administrative";
          project_id?: string | null;
          triggered_by?: string | null;
          status?: "pending" | "running" | "done" | "error";
          services_required?: string | null;
          administrative_conditions?: string | null;
          attached_files?: Json | null;
          raw_llm_output?: Json | null;
          triggered_at?: string;
          completed_at?: string | null;
        };
        Update: {
          status?: "pending" | "running" | "done" | "error";
          services_required?: string | null;
          administrative_conditions?: string | null;
          attached_files?: Json | null;
          raw_llm_output?: Json | null;
          completed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_project_member: {
        Args: { p_project_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
