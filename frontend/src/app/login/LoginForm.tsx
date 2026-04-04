"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GitBranch } from "lucide-react";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

type Mode = "signin" | "signup";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const authError = searchParams.get("error");
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"idle" | "email" | "google" | "github">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const callbackUrl = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function signInWithOAuth(provider: "google" | "github") {
    setError(null);
    setMessage(null);
    setBusy(provider);
    const supabase = createClient();
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl,
      },
    });
    if (oauthError) {
      setBusy("idle");
      setError(oauthError.message);
      return;
    }
    if (data.url) {
      window.location.assign(data.url);
    } else {
      setBusy("idle");
      setError("Could not start sign-in. Try again.");
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy("email");
    const supabase = createClient();

    if (mode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: callbackUrl,
        },
      });
      setBusy("idle");
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      setMessage(
        "Check your email to confirm your account, then sign in here.",
      );
      setMode("signin");
      setPassword("");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy("idle");
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.refresh();
    router.push(next);
  }

  const divider = (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <span className="w-full border-t border-white/[0.08]" />
      </div>
      <div className="relative flex justify-center text-[11px] uppercase tracking-wide">
        <span className="bg-hub-bg/80 px-3 text-hub-text-muted">
          Or use email
        </span>
      </div>
    </div>
  );

  return (
    <div className="glass-panel rounded-xl border border-white/[0.08] p-6">
      {authError ? (
        <p className="mb-4 text-sm text-amber-200/90" role="alert">
          Sign-in was interrupted. Try again.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-center gap-2 border border-white/[0.1]"
          disabled={busy !== "idle"}
          onClick={() => void signInWithOAuth("google")}
        >
          <GoogleIcon className="h-4 w-4 shrink-0" />
          {busy === "google" ? "Redirecting…" : "Continue with Google"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-center gap-2 border border-white/[0.1]"
          disabled={busy !== "idle"}
          onClick={() => void signInWithOAuth("github")}
        >
          <GitBranch className="h-4 w-4 shrink-0 text-hub-text-muted" aria-hidden />
          {busy === "github" ? "Redirecting…" : "Continue with GitHub"}
        </Button>
      </div>

      {divider}

      <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-4">
        <div className="flex gap-2 rounded-lg bg-hub-bg/40 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setError(null);
              setMessage(null);
            }}
            className={`flex-1 rounded-md py-2 text-xs font-semibold transition ${
              mode === "signin"
                ? "bg-white/[0.08] text-hub-text"
                : "text-hub-text-muted hover:text-hub-text-secondary"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setError(null);
              setMessage(null);
            }}
            className={`flex-1 rounded-md py-2 text-xs font-semibold transition ${
              mode === "signup"
                ? "bg-white/[0.08] text-hub-text"
                : "text-hub-text-muted hover:text-hub-text-secondary"
            }`}
          >
            Create account
          </button>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-hub-text-muted">
            Email
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@ucsd.edu"
            className="h-11 w-full rounded-lg border border-white/[0.08] bg-hub-bg/50 px-3 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-hub-text-muted">
            Password
          </span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="h-11 w-full rounded-lg border border-white/[0.08] bg-hub-bg/50 px-3 text-sm text-hub-text outline-none ring-hub-cyan/40 placeholder:text-hub-text-muted focus:border-hub-cyan/40 focus:ring-2"
          />
        </label>

        <Button
          type="submit"
          className="w-full"
          disabled={busy !== "idle"}
        >
          {busy === "email"
            ? "Working…"
            : mode === "signup"
              ? "Create account"
              : "Sign in"}
        </Button>
      </form>

      {error ? (
        <p className="mt-4 text-center text-sm text-amber-200/90" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 text-center text-sm text-hub-text-secondary" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
