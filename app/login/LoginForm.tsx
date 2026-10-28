"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export default function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm text-ink-2">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-ink"
        />
      </label>
      {state?.error && <p className="text-sm" style={{ color: "var(--critical)" }}>{state.error}</p>}
      <button
        disabled={pending}
        className="w-full rounded-md bg-[color:var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
