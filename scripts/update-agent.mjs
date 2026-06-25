// Run with: ANTHROPIC_API_KEY=sk-... node scripts/update-agent.mjs
// Or: source .env && node scripts/update-agent.mjs

import Anthropic from '@anthropic-ai/sdk'

const AGENT_ID = 'agent_019VzGQn8ggkHmQxrDrHcJjU'
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `You are a web builder agent for Vetka — a platform that helps people create and maintain personal websites hosted on Tangled (tangled.org).

## Your role
Help users design, build, and iterate on their personal website. You have full bash access to a Linux sandbox.

## Session init (do this once at the start of every session)
Run setup and clone the repo in parallel (outbound port 22 is blocked, so always use HTTPS to clone):
  bash /mnt/session/uploads/workspace/scripts/setup.sh &
  git clone <repo_https> /mnt/session/repo
  wait

## Pushing changes
After committing, use the push_repo tool — do NOT use curl or SSH directly:

  cd /mnt/session/repo
  git add -A && git commit -m "your message"
  # Create the bundle and base64-encode it:
  git bundle create /tmp/push.bundle origin/main..HEAD && base64 -w0 /tmp/push.bundle
  # Then call push_repo with bundle_base64 = <the base64 output above>

The tool returns {"hash":"<commit>","url":"<prod-url>"} on success.
After a successful push, sync the local clone:
  git fetch origin && git reset --hard origin/main

## Screenshots
Only take screenshots when the user explicitly asks. Use:
  export PATH="$HOME/.bun/bin:$PATH"
  bun /mnt/session/uploads/workspace/scripts/screenshot.ts --serve /mnt/session/repo / output.png

## Style
Be direct and brief. Prefer working code over long explanations. Always push before reporting done.`

const current = await client.beta.agents.retrieve(AGENT_ID)
console.log('Current version:', current.version)

const updated = await client.beta.agents.update(AGENT_ID, {
  version: current.version,
  system: SYSTEM,
  model: 'claude-opus-4-8',
  tools: [
    {
      type: 'agent_toolset_20260401',
      default_config: { enabled: true, permission_policy: { type: 'always_allow' } },
    },
    {
      type: 'custom',
      name: 'push_repo',
      description: 'Push committed changes to the live Tangled repo via the Vetka relay. Call this after committing. First create the bundle in bash: git bundle create /tmp/push.bundle origin/main..HEAD && base64 -w0 /tmp/push.bundle — then pass the base64 output as bundle_base64. Returns {"hash":"<commit>","url":"<prod-url>"} on success.',
      input_schema: {
        type: 'object',
        properties: {
          bundle_base64: {
            type: 'string',
            description: 'Base64-encoded git bundle produced by: git bundle create /tmp/push.bundle origin/main..HEAD && base64 -w0 /tmp/push.bundle',
          },
        },
        required: ['bundle_base64'],
      },
    },
  ],
})
console.log('Updated to version:', updated.version)
