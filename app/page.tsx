"use client";

import { useState } from "react";
import { createAuthorizationUrl } from "@atcute/oauth-browser-client";
import type { Handle } from "@atcute/lexicons";
import { ensureOAuthConfigured } from "@/lib/oauth";
import { cn } from "@/lib/cn";

export default function LoginPage() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!handle.trim()) return;

    setLoading(true);
    setError(null);

    try {
      ensureOAuthConfigured();

      const authUrl = await createAuthorizationUrl({
        target: { type: "account", identifier: handle.trim() as Handle },
        scope: "atproto transition:generic",
      });

      window.location.href = authUrl.toString();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start authorization");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="text-2xl font-semibold tracking-tight mb-1">Vetka</div>
          <p className="text-sm text-zinc-500">
            Sign in with your AT Protocol handle to manage SSH keys for Tangled repos
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="handle" className="block text-sm font-medium mb-1.5">
              Handle
            </label>
            <input
              id="handle"
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="alice.bsky.social"
              autoComplete="off"
              autoFocus
              className={cn(
                "w-full px-3 py-2 text-sm rounded-lg border bg-white",
                "placeholder:text-zinc-400 outline-none",
                "border-zinc-200 focus:border-zinc-400 transition-colors"
              )}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !handle.trim()}
            className={cn(
              "w-full py-2 px-4 text-sm font-medium rounded-lg transition-colors",
              "bg-zinc-900 text-white hover:bg-zinc-700",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {loading ? "Redirecting…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
