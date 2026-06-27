#!/usr/bin/env bun
// Hot-swap a stale session's tools to the current deploy toolset.
// Sessions pin the agent version at creation; ones created before the
// get_deploy_credentials tool existed (Tangled-era push_repo) reject deploy
// calls as undeclared tools. sessions.update replaces tools in place, keeping
// the conversation history and sandbox. Usage: bun scripts/fix-session-tools.ts <sessionId>
import Anthropic from '@anthropic-ai/sdk'
const SID = process.argv[2]
if (!SID) { console.error('Usage: bun scripts/fix-session-tools.ts <sessionId>'); process.exit(1) }
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const tools = [
  { type: 'agent_toolset_20260401', default_config: { enabled: true, permission_policy: { type: 'always_allow' } } },
  {
    type: 'custom',
    name: 'get_deploy_credentials',
    description:
      'Returns short-lived credentials for publishing this site: {deploy_url, token, expires_at, ttl_seconds, site_id, prod_url}. Call this right before deploying, then POST the built files to deploy_url with header "Authorization: Bearer <token>". Tokens expire in ~2 hours; if a deploy returns HTTP 401 with code "token_expired", call this tool again to get a fresh token and retry. Takes no arguments — the credentials are scoped to the current user\'s site automatically.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
]

const before: any = await (client.beta.sessions as any).retrieve(SID)
console.log('before tools:', (before.agent?.tools ?? []).map((t: any) => t.type === 'custom' ? `custom:${t.name}` : t.type).join(', '))
await (client.beta.sessions as any).update(SID, { agent: { tools } })
const after: any = await (client.beta.sessions as any).retrieve(SID)
console.log('after  tools:', (after.agent?.tools ?? []).map((t: any) => t.type === 'custom' ? `custom:${t.name}` : t.type).join(', '))
