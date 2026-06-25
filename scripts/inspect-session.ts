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

// Resources (mounted files)
try {
  const resources = await (client.beta.sessions as any).resources.list(SESSION_ID)
  console.log('\n── RESOURCES ────────────────────────────────────')
  if (!resources.data?.length) {
    console.log('(none)')
  } else {
    for (const r of resources.data) {
      console.log(`  [${r.type}] ${r.id}  mount_path=${r.mount_path ?? '—'}`)
    }
  }
} catch (e: any) {
  console.log('── RESOURCES ─── (error:', e.message, ')')
}

// Threads
let threads: any[] = []
try {
  const t = await (client.beta.sessions as any).threads.list(SESSION_ID)
  threads = t.data ?? []
} catch {}

function printEvents(events: any[]) {
  events.sort((a, b) => (a.processed_at ?? '').localeCompare(b.processed_at ?? ''))
  for (const e of events) {
    const ts = e.processed_at ? new Date(e.processed_at).toISOString().slice(11, 19) : '??:??:??'
    const tag = `[${ts}] ${e.type}`

    if (e.type === 'agent.thinking') continue
    if (e.type === 'user.message') {
      const text = (e.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ').slice(0, 200)
      const imgs = (e.content ?? []).filter((b: any) => b.type === 'image').length
      console.log(`${tag}  "${text}"${imgs ? ` +${imgs} image(s)` : ''}`)
    } else if (e.type === 'agent.message') {
      const text = (e.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ').slice(0, 200)
      console.log(`${tag}  "${text}"`)
    } else if (e.type === 'agent.tool_use' || e.type === 'agent.mcp_tool_use') {
      const name = e.type === 'agent.mcp_tool_use' ? `${e.mcp_server_name}:${e.name}` : e.name
      const inp = JSON.stringify(e.input ?? {}).slice(0, 100)
      console.log(`${tag}  ${name}(${inp})`)
    } else if (e.type === 'agent.custom_tool_use') {
      const inp = { ...e.input }
      if (inp.bundle_base64) inp.bundle_base64 = `<base64 ${inp.bundle_base64.length} chars>`
      console.log(`${tag}  ${e.name}(${JSON.stringify(inp)})`)
    } else if (e.type === 'agent.tool_result' || e.type === 'agent.mcp_tool_result') {
      const out = ((e.content ?? []).find((b: any) => b.type === 'text')?.text ?? '').slice(0, 300)
      const err = e.is_error ? ' ERROR' : ''
      console.log(`${tag}${err}  "${out}"`)
    } else if (e.type === 'user.custom_tool_result') {
      const out = ((e.content ?? []).find((b: any) => b.type === 'text')?.text ?? '').slice(0, 300)
      const err = e.is_error ? ' ERROR' : ''
      console.log(`${tag}${err}  id=${e.custom_tool_use_id}  "${out}"`)
    } else if (e.type === 'session.status_idle' || e.type === 'session.thread_status_idle') {
      console.log(`${tag}  stop_reason=${JSON.stringify(e.stop_reason)}`)
    } else {
      console.log(`${tag}  ${JSON.stringify(e).slice(0, 150)}`)
    }
  }
}

// Try main session events first
console.log('\n── EVENTS (main session) ────────────────────────')
try {
  const events: any[] = []
  for await (const evt of (client.beta.sessions as any).events.list(SESSION_ID)) {
    events.push(evt)
  }
  if (events.length === 0) console.log('(none — try thread events below)')
  else printEvents(events)
} catch (e: any) {
  console.log('(error:', e.message, ')')
}

// Thread events
for (const thread of threads) {
  console.log(`\n── THREAD ${thread.id} (status=${thread.status}) ─────────────`)
  try {
    const res = await (client as any).get(
      `/v1/sessions/${SESSION_ID}/threads/${thread.id}/events?limit=200`,
      { headers: { 'anthropic-beta': 'sessions-2025-03-27' } }
    )
    const events: any[] = res.data ?? []
    if (events.length === 0) console.log('(no events)')
    else printEvents(events)
  } catch (e: any) {
    console.log('(error:', e.message, ')')
  }
}

console.log()
