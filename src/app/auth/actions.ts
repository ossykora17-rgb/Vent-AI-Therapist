"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { absoluteUrl } from "@/lib/env";

export interface AuthState {
  ok: boolean;
  message?: string;
  fieldErrors?: { email?: string; password?: string; displayName?: string };
}

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("That email doesn't look right"),
  password: z.string().min(8, "At least 8 characters"),
});

const signupSchema = credentials.extend({
  displayName: z
    .string()
    .trim()
    .min(1, "Tell us what to call you")
    .max(60, "Keep it under 60 characters"),
});

type FieldErrors = NonNullable<AuthState["fieldErrors"]>;

const FIELDS = ["email", "password", "displayName"] as const;

function isField(key: unknown): key is keyof FieldErrors {
  return FIELDS.includes(key as (typeof FIELDS)[number]);
}

/** First issue per field wins — one message per input, never a stack. */
function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (isField(key) && errors[key] === undefined) {
      errors[key] = issue.message;
    }
  }
  return errors;
}

const NOT_CONFIGURED: AuthState = {
  ok: false,
  message: "Auth is not configured on this deployment yet.",
};

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  const supabase = createClient();
  if (!supabase) return NOT_CONFIGURED;

  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Deliberately vague: never confirm whether an account exists.
    return { ok: false, message: "Email or password is incorrect." };
  }

  const next = String(formData.get("next") || "/dashboard");
  revalidatePath("/", "layout");
  redirect(next.startsWith("/") ? next : "/dashboard");
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  const supabase = createClient();
  if (!supabase) return NOT_CONFIGURED;

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: absoluteUrl("/auth/callback"),
    },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  // No session back means the project requires email confirmation.
  if (!data.session) {
    return {
      ok: true,
      message: "Check your email to confirm your account, then log in.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = createClient();
  await supabase?.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
