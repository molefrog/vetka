/**
 * Uploads agent helper scripts to the Anthropic Files API.
 * Run once after changing agent-helpers/: node scripts/upload-helpers.mjs
 * Copy the printed file IDs into src/lib/agent.server.ts
 */
import Anthropic from '@anthropic-ai/sdk'
import { readFile } from 'fs/promises'
import { basename } from 'path'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const helpers = [
  { path: 'agent-helpers/setup.sh', mime: 'text/x-sh' },
  { path: 'agent-helpers/screenshot.ts', mime: 'application/typescript' },
]

const ids = {}

for (const { path, mime } of helpers) {
  const name = basename(path)
  const content = await readFile(path)
  const blob = new Blob([content], { type: mime })
  const file = await client.beta.files.upload({ file: new File([blob], name, { type: mime }) })
  ids[name] = file.id
  console.log(`✓ ${name}  →  ${file.id}`)
}

console.log('\nAdd to src/lib/agent.server.ts:')
console.log(`  const HELPER_SETUP_FILE_ID = '${ids['setup.sh']}'`)
console.log(`  const HELPER_SCREENSHOT_FILE_ID = '${ids['screenshot.ts']}'`)
