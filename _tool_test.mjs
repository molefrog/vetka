import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
const apiKey = readFileSync(process.env.KEYFILE, 'utf8').trim()
const client = new Anthropic({ apiKey })
const AGENT_ID = 'agent_019VzGQn8ggkHmQxrDrHcJjU'
const ENV_ID = 'env_01AKeJed2CAzKMdAMmQ3zTnN'

// 1) Verify config
const a = await client.beta.agents.retrieve(AGENT_ID)
console.log('agent version:', a.version, '| model:', JSON.stringify(a.model))
const toolNames = (a.tools||[]).map(t => t.type==='custom' ? `custom:${t.name}` : t.type)
console.log('tools:', toolNames.join(', '))

// 2) Live round-trip of the new flow (mock the mint; deploy_url = public echo)
const sess = await client.beta.sessions.create({ agent: AGENT_ID, environment_id: ENV_ID })
console.log('session:', sess.id)

const task = [
  'Automated test. Do NOT build anything.',
  'Step 1: call the get_deploy_credentials tool.',
  'Step 2: using the deploy_url and token it returns, make ONE curl POST:',
  '  curl -sS -i -X POST <deploy_url> -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d \'{"files":[{"path":"index.html","contentBase64":"aGk="}]}\'',
  'Step 3: print the response status line and stop. Do not retry.',
].join('\n')

await client.beta.sessions.events.send(sess.id, { events: [{ type:'user.message', content:[{type:'text', text:task}] }] })

let toolIssued = false
while (true) {
  let pending = null
  const stream = await client.beta.sessions.events.stream(sess.id)
  for await (const e of stream) {
    if (e.type === 'agent.message') for (const b of e.content??[]) if (b.type==='text'&&b.text) process.stdout.write('\n[msg] '+b.text.slice(0,400))
    else if (e.type === 'agent.tool_use') process.stdout.write('\n[bash] '+JSON.stringify(e.input).slice(0,260))
    else if (e.type === 'agent.custom_tool_use') { pending = e; process.stdout.write('\n[custom_tool_use] '+e.name) }
    else if (e.type === 'agent.tool_result') { const t=(e.content??[]).filter(b=>b.type==='text').map(b=>b.text).join('').slice(0,300); process.stdout.write('\n[result] '+t.replace(/\s+/g,' ')) }
    else if (e.type === 'session.status_idle') break
    else if (e.type === 'session.status_terminated') { process.stdout.write('\n[terminated]'); break }
  }
  if (pending?.name === 'get_deploy_credentials') {
    toolIssued = true
    const mock = { deploy_url:'https://httpbin.org/post', token:'vdt_FAKE_demo_token', expires_at:new Date(Date.now()+7200e3).toISOString(), ttl_seconds:7200, site_id:'test-site', prod_url:'https://test.web.sh' }
    process.stdout.write('\n[harness] servicing get_deploy_credentials with mock token + echo url')
    await client.beta.sessions.events.send(sess.id, { events:[{ type:'user.custom_tool_result', custom_tool_use_id: pending.id, content:[{type:'text', text: JSON.stringify(mock)}], is_error:false }] })
    continue
  }
  break
}
console.log('\n\nget_deploy_credentials was called by the agent:', toolIssued)
await client.beta.sessions.delete(sess.id).catch(()=>{})
