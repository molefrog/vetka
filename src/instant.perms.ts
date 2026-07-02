// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/react";

// SECURITY (residual risk — follow-up): reactions are written directly from the
// browser with the public InstantDB app id shipped in notch.js. `create: "true"`
// means anyone with that id can write reactions unauthenticated (spam vector),
// and `view: "true"` makes all rows world-readable. We no longer persist any PII
// (author email was removed — see notch/src/Widget.tsx), which closes the email-
// harvesting leak, but fully closing write abuse requires binding these writes to
// an authenticated identity (InstantDB auth or a server-side reaction endpoint
// tied to the Vetka session). Until then, keep update/delete disabled so rows are
// append-only and can't be tampered with.
const rules = {
  reactions: {
    allow: {
      view: "true",
      create: "true",
      update: "false",
      delete: "false",
    },
  },
} satisfies InstantRules;

export default rules;
