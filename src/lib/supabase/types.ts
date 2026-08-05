/**
 * Hand-maintained mirror of supabase/migrations/*.sql.
 * Regenerate with:
 *   npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts
 */

export type Plan = "free" | "pro";
export type MessageRole = "user" | "assistant";
export type SubscriptionStatus =
  | "inactive"
  | "active"
  | "past_due"
  | "cancelled";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          plan: Plan;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          plan?: Plan;
        };
        Update: {
          display_name?: string | null;
          plan?: Plan;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string;
        };
        Update: {
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      /**
       * Long-term memory. `embedding` crosses the wire as pgvector's text
       * form — "[0.1,0.2,…]" — because PostgREST has no JSON representation
       * for the type. src/lib/vent/embeddings.ts is the only place that
       * literal is built.
       */
      memories: {
        Row: {
          id: string;
          user_id: string;
          key: string;
          value: string;
          embedding: string | null;
          source_message_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          key: string;
          value: string;
          embedding?: string | null;
          source_message_id?: string | null;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: string;
          embedding?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          session_id: string;
          user_id: string;
          role: MessageRole;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          user_id: string;
          role: MessageRole;
          content: string;
        };
        Update: {
          content?: string;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          status: SubscriptionStatus;
          plan_code: string | null;
          paystack_customer_code: string | null;
          paystack_subscription_code: string | null;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          status?: SubscriptionStatus;
        };
        Update: {
          status?: SubscriptionStatus;
          plan_code?: string | null;
          paystack_customer_code?: string | null;
          paystack_subscription_code?: string | null;
          current_period_end?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      /** Nearest memories by cosine distance. See 0006_memory_vectors.sql. */
      match_memories: {
        Args: { p_user_id: string; p_embedding: string; p_limit?: number };
        Returns: Array<{ id: string; key: string; value: string; similarity: number }>;
      };
    };
    Enums: Record<string, never>;
  };
}
