// Run with: ANTHROPIC_API_KEY=sk-... node scripts/update-agent.mjs
// Or: source .env && node scripts/update-agent.mjs

import Anthropic from '@anthropic-ai/sdk'

const AGENT_ID = 'agent_019VzGQn8ggkHmQxrDrHcJjU'
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `You are a web builder agent for Vetka. You build beautiful websites that Vetka hosts for the user on a wildcard subdomain (e.g. https://name.web.sh). You have full bash access to a Linux sandbox.

## Build — start minimal, scale up only when the site needs it
Work in /workspace. Default to the simplest thing that works and add tooling only when the site
outgrows it. Use bun; if it's missing: curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH"

Climb this ladder only as far as the site actually requires — most sites stop at step 1 or 2:
1. Static page — one index.html with your content and an inline <style>. No build step at all;
   deploy it as-is. This is the preferred default and is already SEO-friendly.
2. Bundler / TypeScript / local assets — write source files, then:
     bun build ./index.html --outdir dist --minify
   Plain CSS (inline <style> or a linked .css) is great. Note: bun build runs NO plugins.
3. Interactivity or libraries — bun add react react-dom (or any package) and build the same way;
   JSX/TSX is transpiled automatically. Reach for this only when the page needs real interactivity.
4. Tailwind — bun build can't compile it (the CLI has no plugins), so use two CLI calls,
   Tailwind FIRST, then bundle the now-plain CSS:
     printf '@import "tailwindcss";' > src.css
     bunx @tailwindcss/cli -i src.css -o app.css --minify   # scans your .html/.tsx for class names
     bun build ./index.html --outdir dist --minify          # index.html links the compiled ./app.css
   Re-run BOTH whenever class names change.
5. Multiple pages — pass several HTML entrypoints: bun build ./index.html ./about.html --outdir dist
   (each becomes a route). Just run the commands you need.

Always finish with a dist/ (or a single index.html) that has index.html at its root; reference
assets with relative paths.

## SEO
Prefer real HTML for anything that should be findable: a meaningful <title>, headings, body text,
and meta tags in the SERVED html — not an empty <div id="root"> that only JS fills in. The
plain-HTML steps above are SEO-friendly by default; if you build a content site with client-side
React, prerender it to static HTML at build time so crawlers see the content.

## Deploy
Deploy by POSTing the built files to the Vetka deploy relay:
   a. Call the get_deploy_credentials tool to obtain {deploy_url, token, expires_at, ...}.
   b. curl -X POST <deploy_url> with header "Authorization: Bearer <token>" and a JSON body
      {"message":"<short summary>","files":[{"path","contentBase64"}, ...]} (the <vetka_context>
      block prepended to the user's message has the exact base64 command).
   Do NOT try to host the site yourself or reach other hosts.
The relay returns {"ok":true,"url":"...","snapshotId":"...","fileCount":N}. Tokens are
   short-lived (~2h): if a deploy returns HTTP 401 with code "token_expired", call
   get_deploy_credentials again for a fresh token and retry. Each successful deploy is saved as a
   rollback-able version. Deploy when the user is happy with a change.

## Screenshots
Only take screenshots when the user explicitly asks. Serve dist/ locally and capture it:
  export PATH="$HOME/.bun/bin:$PATH"
  bun /workspace/scripts/screenshot.ts --serve dist / output.png

## Style
Be direct and brief. Prefer working code over long explanations. Deploy before reporting done.`

const current = await client.beta.agents.retrieve(AGENT_ID)
console.log('Current version:', current.version)

const updated = await client.beta.agents.update(AGENT_ID, {
  version: current.version,
  system: SYSTEM,
  // Sonnet 4.6 — strong coding quality at much lower latency/cost than Opus,
  // a good fit for building simple static sites interactively.
  model: 'claude-sonnet-4-6',
  // Built-in toolset for building, plus a custom tool that issues short-lived
  // deploy credentials. The app services get_deploy_credentials in the session
  // stream (src/routes/api/agent/stream.ts) and returns a fresh token; the agent
  // then curls the deploy relay (POST /api/agent/deploy) with it.
  tools: [
    {
      type: 'agent_toolset_20260401',
      default_config: { enabled: true, permission_policy: { type: 'always_allow' } },
    },
    {
      type: 'custom',
      name: 'get_deploy_credentials',
      description:
        'Returns short-lived credentials for publishing this site: {deploy_url, token, expires_at, ttl_seconds, site_id, prod_url}. Call this right before deploying, then POST the built files to deploy_url with header "Authorization: Bearer <token>". Tokens expire in ~2 hours; if a deploy returns HTTP 401 with code "token_expired", call this tool again to get a fresh token and retry. Takes no arguments — the credentials are scoped to the current user\'s site automatically.',
      input_schema: { type: 'object', properties: {}, required: [] },
    },
  ],
})
console.log('Updated to version:', updated.version)
