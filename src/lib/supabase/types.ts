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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
