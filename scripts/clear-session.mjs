import { readFileSync } from 'fs'
import pg from 'pg'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n')
    .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
    .map(l => [l.split('=')[0].trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const client = new pg.Client({ connectionString: env.DATABASE_URL })
await client.connect()

const email = process.argv[2] ?? 'molefrog@gmail.com'
const { rows: users } = await client.query(
  `SELECT u.id, u.name, u.email FROM "user" u WHERE u.email = $1`,
  [email]
)
console.log('User:', users)

if (users.length > 0) {
  const userId = users[0].id
  const { rows: sessions } = await client.query(
    'SELECT * FROM agent_session WHERE user_id = $1', [userId]
  )
  console.log('Agent session:', sessions)

  const { rowCount } = await client.query(
    'DELETE FROM agent_session WHERE user_id = $1', [userId]
  )
  console.log(`Deleted ${rowCount} session(s).`)
}

await client.end()
