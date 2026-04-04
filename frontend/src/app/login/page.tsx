import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12">
      <PageHeader
        title="Sign in"
        subtitle="Google, GitHub, or email and password. New accounts may need email confirmation if enabled in Supabase."
      />
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-white/[0.04]" />}>
        <LoginForm />
      </Suspense>
      <p className="mt-8 text-center text-sm text-hub-text-muted">
        <Link href="/" className="text-hub-cyan hover:underline">
          Back to command center
        </Link>
      </p>
    </main>
  );
}
