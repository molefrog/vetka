---
name: feedback_no_build_check
description: Don't run bun run build to verify changes — dev server is already running
metadata:
  type: feedback
---

Don't run `bun run build` after making edits to verify they compile.

**Why:** The dev server is already running; building wastes time and clears the cache.

**How to apply:** After edits, trust the work and move on. If there's a real need to check for type errors, use `bun tsc --noEmit` at most — but prefer just letting the running dev server catch issues.
