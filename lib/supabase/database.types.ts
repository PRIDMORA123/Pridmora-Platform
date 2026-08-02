/**
 * Generated-style Supabase database types for the Development Intelligence Platform.
 * Keep in sync with supabase/migrations/*.sql after schema changes.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      intelligence_items: {
        Row: {
          id: string;
          user_id: string;
          client_id: string;
          category: string;
          title: string;
          description: string | null;
          status: string;
          confidence_score: number | null;
          confidence_label: string | null;
          source_type: string | null;
          first_identified_at: string | null;
          last_updated_at: string | null;
          approved_at: string | null;
          approved_by: string | null;
          is_locked: boolean;
          coach_notes: string | null;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id: string;
          category: string;
          title: string;
          description?: string | null;
          status?: string;
          confidence_score?: number | null;
          confidence_label?: string | null;
          source_type?: string | null;
          first_identified_at?: string | null;
          last_updated_at?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          is_locked?: boolean;
          coach_notes?: string | null;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["intelligence_items"]["Insert"]>;
      };
      intelligence_evidence: {
        Row: {
          id: string;
          intelligence_item_id: string;
          session_id: string | null;
          user_id: string;
          evidence_text: string;
          evidence_type: string | null;
          source_excerpt: string | null;
          occurred_at: string | null;
          created_at: string;
          created_by: string | null;
          is_redacted: boolean;
        };
        Insert: {
          id?: string;
          intelligence_item_id: string;
          session_id?: string | null;
          user_id: string;
          evidence_text: string;
          evidence_type?: string | null;
          source_excerpt?: string | null;
          occurred_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          is_redacted?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["intelligence_evidence"]["Insert"]>;
      };
      session_intelligence_reviews: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          client_id: string;
          review_status: string;
          generated_at: string | null;
          reviewed_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id: string;
          client_id: string;
          review_status?: string;
          generated_at?: string | null;
          reviewed_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["session_intelligence_reviews"]["Insert"]>;
      };
      question_insights: {
        Row: {
          id: string;
          user_id: string;
          client_id: string;
          session_id: string | null;
          question_text: string;
          question_type: string | null;
          source: string | null;
          effectiveness_rating: number | null;
          coach_notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id: string;
          session_id?: string | null;
          question_text: string;
          question_type?: string | null;
          source?: string | null;
          effectiveness_rating?: number | null;
          coach_notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["question_insights"]["Insert"]>;
      };
      person_progress_signals: {
        Row: {
          id: string;
          user_id: string;
          client_id: string;
          session_id: string | null;
          signal_name: string;
          direction: string | null;
          score: number | null;
          coach_validated: boolean;
          evidence_summary: string | null;
          recorded_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id: string;
          session_id?: string | null;
          signal_name: string;
          direction?: string | null;
          score?: number | null;
          coach_validated?: boolean;
          evidence_summary?: string | null;
          recorded_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["person_progress_signals"]["Insert"]>;
      };
      intelligence_audit_log: {
        Row: {
          id: string;
          user_id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          previous_value: Json | null;
          new_value: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          previous_value?: Json | null;
          new_value?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["intelligence_audit_log"]["Insert"]>;
      };
      development_profiles: {
        Row: {
          id: string;
          client_id: string;
          coach_id: string;
          current_focus: string | null;
          strengths: Json;
          values: Json;
          motivators: Json;
          emerging_themes: Json;
          growth_areas: Json;
          coaching_preferences: Json;
          beliefs: Json;
          patterns: Json;
          commitments: Json;
          coaching_patterns: Json;
          patterns_evidence_fingerprint: string | null;
          patterns_generated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          coach_id: string;
          current_focus?: string | null;
          strengths?: Json;
          values?: Json;
          motivators?: Json;
          emerging_themes?: Json;
          growth_areas?: Json;
          coaching_preferences?: Json;
          beliefs?: Json;
          patterns?: Json;
          commitments?: Json;
          coaching_patterns?: Json;
          patterns_evidence_fingerprint?: string | null;
          patterns_generated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["development_profiles"]["Insert"]>;
      };
      development_updates: {
        Row: {
          id: string;
          client_id: string;
          session_id: string;
          coach_id: string;
          status: string;
          conversation_summary: string | null;
          proposed_changes: Json;
          edited_changes: Json | null;
          applied_changes: Json | null;
          evidence_summary: Json;
          has_meaningful_changes: boolean;
          coach_note: string | null;
          generated_at: string | null;
          reviewed_at: string | null;
          applied_at: string | null;
          discarded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          session_id: string;
          coach_id: string;
          status?: string;
          conversation_summary?: string | null;
          proposed_changes?: Json;
          edited_changes?: Json | null;
          applied_changes?: Json | null;
          evidence_summary?: Json;
          has_meaningful_changes?: boolean;
          coach_note?: string | null;
          generated_at?: string | null;
          reviewed_at?: string | null;
          applied_at?: string | null;
          discarded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["development_updates"]["Insert"]>;
      };
    };
    Functions: {
      apply_development_update: {
        Args: { p_update_id: string };
        Returns: Json;
      };
      discard_development_update: {
        Args: { p_update_id: string };
        Returns: Json;
      };
    };
  };
};
