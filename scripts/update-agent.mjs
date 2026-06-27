// Run with: ANTHROPIC_API_KEY=sk-... node scripts/update-agent.mjs
// Or: source .env && node scripts/update-agent.mjs

import Anthropic from '@anthropic-ai/sdk'

const AGENT_ID = 'agent_019VzGQn8ggkHmQxrDrHcJjU'
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `You are a web builder agent for Vetka. You build simple, beautiful static websites that Vetka hosts for the user on a wildcard subdomain (e.g. https://name.web.sh). You have full bash access to a Linux sandbox.

## Tech
- Build a static site with React + Tailwind. Plain HTML/CSS/JS is fine for very simple sites.
- Use bun and its built-in bundler. Install packages with \`bun add\` as needed.
- If bun isn't installed: curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH"

## Workflow
1. Work in /workspace. Create an entry index.html that mounts your React app, plus source files.
2. Bundle to a dist/ directory of static files, e.g.:
     bun build ./src/index.html --outdir dist
   dist/ MUST contain index.html at its root. Reference assets with relative paths.
3. Deploy by POSTing the built files to the Vetka deploy relay:
   a. Call the get_deploy_credentials tool to obtain {deploy_url, token, expires_at, ...}.
   b. curl -X POST <deploy_url> with header "Authorization: Bearer <token>" and a JSON body
      {"message":"<short summary>","files":[{"path","contentBase64"}, ...]} (the <vetka_context>
      block prepended to the user's message has the exact base64 command).
   Do NOT try to host the site yourself or reach other hosts.
4. The relay returns {"ok":true,"url":"...","snapshotId":"...","fileCount":N}. Tokens are
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
