#!/usr/bin/env bun
import Anthropic from '@anthropic-ai/sdk'

const SESSION_ID = process.argv[2]
if (!SESSION_ID) {
  console.error('Usage: bun scripts/inspect-session.ts <session_id>')
  process.exit(1)
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Session info
const session = await (client.beta.sessions as any).retrieve(SESSION_ID)
console.log('\n── SESSION ─────────────────────────────────────')
console.log('id:     ', session.id)
console.log('status: ', session.status)
console.log('agent:  ', JSON.stringify(session.agent))
console.log()

// Resources (mounted files)
try {
  const resources = await (client.beta.sessions as any).resources.list(SESSION_ID)
  console.log('── RESOURCES ────────────────────────────────────')
  if (!resources.data?.length) {
    console.log('(none)')
  } else {
    for (const r of resources.data) {
      console.log(`  [${r.type}] ${r.id}  mount_path=${r.mount_path ?? '—'}  file_id=${r.file_id ?? '—'}`)
    }
  }
  console.log()
} catch (e: any) {
  console.log('── RESOURCES ─── (error:', e.message, ')')
}

// Events
console.log('── EVENTS ───────────────────────────────────────')
const events: any[] = []
for await (const evt of (client.beta.sessions as any).events.list(SESSION_ID)) {
  events.push(evt)
}
events.sort((a, b) => (a.processed_at ?? '').localeCompare(b.processed_at ?? ''))

for (const e of events) {
  const ts = e.processed_at ? new Date(e.processed_at).toISOString().slice(11, 19) : '??:??:??'
  const tag = `[${ts}] ${e.type}`

  if (e.type === 'user.message') {
    const text = (e.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ').slice(0, 120)
    const imgs = (e.content ?? []).filter((b: any) => b.type === 'image').length
    console.log(`${tag}  "${text}"${imgs ? ` +${imgs} image(s)` : ''}`)
  } else if (e.type === 'agent.message') {
    const text = (e.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ').slice(0, 120)
    console.log(`${tag}  "${text}"`)
  } else if (e.type === 'agent.tool_use' || e.type === 'agent.mcp_tool_use') {
    const name = e.type === 'agent.mcp_tool_use' ? `${e.mcp_server_name}:${e.name}` : e.name
    const inp = JSON.stringify(e.input ?? {}).slice(0, 80)
    console.log(`${tag}  ${name}(${inp})`)
  } else if (e.type === 'agent.tool_result' || e.type === 'agent.mcp_tool_result') {
    const out = ((e.content ?? []).find((b: any) => b.type === 'text')?.text ?? '').slice(0, 80)
    const err = e.is_error ? ' ERROR' : ''
    console.log(`${tag}${err}  "${out}"`)
  } else if (e.type === 'agent.thinking') {
    // skip
  } else {
    console.log(`${tag}  ${JSON.stringify(e).slice(0, 120)}`)
  }
}
console.log()
