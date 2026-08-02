"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { AuthState } from "@/app/auth/actions";

const INITIAL: AuthState = { ok: false };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth loading={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

export function AuthForm({
  mode,
  action,
  next,
}: {
  mode: "login" | "signup";
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  next?: string;
}) {
  const [state, formAction] = useFormState(action, INITIAL);
  const { toast } = useToast();
  const lastMessage = React.useRef<string | undefined>(undefined);

  // Surface server-level messages (not per-field ones) as a toast, once each.
  React.useEffect(() => {
    if (!state.message || state.message === lastMessage.current) return;
    lastMessage.current = state.message;
    toast(state.message, state.ok ? "success" : "error");
  }, [state, toast]);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {next && <input type="hidden" name="next" value={next} />}

      {mode === "signup" && (
        <Input
          label="What should we call you?"
          name="displayName"
          autoComplete="nickname"
          placeholder="Sam"
          required
          maxLength={60}
          error={state.fieldErrors?.displayName}
        />
      )}

      <Input
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        required
        error={state.fieldErrors?.email}
      />

      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        placeholder="••••••••"
        required
        minLength={8}
        hint={mode === "signup" ? "At least 8 characters" : undefined}
        error={state.fieldErrors?.password}
      />

      <SubmitButton label={mode === "signup" ? "Create account" : "Log in"} />

      {state.message && (
        <p
          role="status"
          className="border-3 border-ink bg-paper p-3 text-sm font-medium leading-snug shadow-brut-sm"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
