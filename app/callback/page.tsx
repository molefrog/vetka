"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { finalizeAuthorization } from "@atcute/oauth-browser-client";
import { ensureOAuthConfigured } from "@/lib/oauth";
import { Suspense } from "react";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function finalize() {
      try {
        ensureOAuthConfigured();
        const params = new URLSearchParams(searchParams.toString());
        await finalizeAuthorization(params);
        router.replace("/repos");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Authorization failed");
      }
    }

    finalize();
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4">
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
          <a href="/" className="block text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
            ← Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-zinc-400">Completing sign in…</p>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-sm text-zinc-400">Loading…</p>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
