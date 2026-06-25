/**
 * Creates (or shows existing) Vetka agent environment.
 * Run once: node scripts/create-environment.mjs
 * Copy the printed ENV_ID into src/lib/agent.server.ts
 */
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CONFIG = {
  type: 'cloud',
  packages: {
    apt: ['openssh-client'],  // pre-installed so SSH push works without setup.sh
    pip: ['playwright'],      // browser downloaded on first use via setup.sh
  },
  networking: { type: 'unrestricted' },
}

// Update existing or create new
const existing = await client.beta.environments.list()
const found = existing.data?.find((e) => e.name === 'vetka-dev')

let env
if (found) {
  console.log('Updating existing environment', found.id)
  env = await client.beta.environments.update(found.id, { config: CONFIG })
} else {
  env = await client.beta.environments.create({ name: 'vetka-dev', config: CONFIG })
}

console.log('Created environment:')
console.log('  name:', env.name)
console.log(`\nAdd to src/lib/agent.server.ts:\n  const ENV_ID = '${env.id}'`)
