export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: { id: string; name: string; created_at: string }
        Insert: { id?: string; name: string; created_at?: string }
        Update: { id?: string; name?: string; created_at?: string }
      }
      profiles: {
        Row: { id: string; organization_id: string | null; display_name: string | null; created_at: string }
        Insert: { id: string; organization_id?: string | null; display_name?: string | null; created_at?: string }
        Update: { id?: string; organization_id?: string | null; display_name?: string | null; created_at?: string }
      }
      projects: {
        Row: { id: string; organization_id: string; name: string; description: string | null; created_at: string }
        Insert: { id?: string; organization_id: string; name: string; description?: string | null; created_at?: string }
        Update: { id?: string; organization_id?: string; name?: string; description?: string | null; created_at?: string }
      }
      project_filters: {
        Row: { id: string; project_id: string; budget_min_eur: number; regions: string[]; cpv_codes: string[]; updated_at: string }
        Insert: { id?: string; project_id: string; budget_min_eur?: number; regions?: string[]; cpv_codes?: string[]; updated_at?: string }
        Update: { id?: string; project_id?: string; budget_min_eur?: number; regions?: string[]; cpv_codes?: string[]; updated_at?: string }
      }
      tenders_raw: {
        Row: {
          id: number; external_id: string; source: string; title: string; summary: string
          link: string; published_at: string | null; deadline_at: string | null
          buyer_name: string; region: string; cpv: string; budget_amount: number | null
          captured_at: string
        }
        Insert: {
          id?: number; external_id: string; source?: string; title: string; summary?: string
          link: string; published_at?: string | null; deadline_at?: string | null
          buyer_name?: string; region?: string; cpv?: string; budget_amount?: number | null
          captured_at?: string
        }
        Update: Partial<Database['public']['Tables']['tenders_raw']['Insert']>
      }
      project_tenders: {
        Row: { id: number; project_id: string; tender_raw_id: number; passed_filter: boolean; discard_reason: string | null; filtered_at: string }
        Insert: { id?: number; project_id: string; tender_raw_id: number; passed_filter: boolean; discard_reason?: string | null; filtered_at?: string }
        Update: Partial<Database['public']['Tables']['project_tenders']['Insert']>
      }
      tender_labels: {
        Row: { id: number; project_id: string; tender_raw_id: number; user_id: string; score: number; notes: string | null; labeled_at: string }
        Insert: { id?: number; project_id: string; tender_raw_id: number; user_id: string; score: number; notes?: string | null; labeled_at?: string }
        Update: Partial<Database['public']['Tables']['tender_labels']['Insert']>
      }
      project_inbox: {
        Row: { id: number; project_id: string; tender_raw_id: number; smart_score: number; score_method: string; is_read: boolean; added_at: string }
        Insert: { id?: number; project_id: string; tender_raw_id: number; smart_score: number; score_method?: string; is_read?: boolean; added_at?: string }
        Update: Partial<Database['public']['Tables']['project_inbox']['Insert']>
      }
      analyses: {
        Row: { id: string; project_id: string; tender_raw_id: number; requested_by: string; status: string; result_json: Json | null; requested_at: string; completed_at: string | null }
        Insert: { id?: string; project_id: string; tender_raw_id: number; requested_by: string; status?: string; result_json?: Json | null; requested_at?: string; completed_at?: string | null }
        Update: Partial<Database['public']['Tables']['analyses']['Insert']>
      }
      ingestion_state: {
        Row: { source: string; last_run_at: string | null; last_run_count: number | null }
        Insert: { source: string; last_run_at?: string | null; last_run_count?: number | null }
        Update: Partial<Database['public']['Tables']['ingestion_state']['Insert']>
      }
    }
  }
}

// Convenience aliases
export type Organization = Database['public']['Tables']['organizations']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Project = Database['public']['Tables']['projects']['Row']
export type ProjectFilter = Database['public']['Tables']['project_filters']['Row']
export type TenderRaw = Database['public']['Tables']['tenders_raw']['Row']
export type ProjectTender = Database['public']['Tables']['project_tenders']['Row']
export type TenderLabel = Database['public']['Tables']['tender_labels']['Row']
export type ProjectInbox = Database['public']['Tables']['project_inbox']['Row']
export type Analysis = Database['public']['Tables']['analyses']['Row']
