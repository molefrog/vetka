import { createFileRoute } from '@tanstack/react-router'
import { auth } from '../../../../lib/auth.server'
import { db } from '../../../../db'
import { site } from '../../../../db/schema'
import { eq } from 'drizzle-orm'

type Commit = { sha: string; message: string; date: string | null; url: string }

function scrapeCommits(html: string, owner: string, repo: string): Commit[] {
  const commits: Commit[] = []
  // Each commit block has an anchor to /{owner}/{repo}/commit/{sha} with the message
  const commitRe = new RegExp(
    `href="/${escRe(owner)}/${escRe(repo)}/commit/([0-9a-f]{40})"[^>]*>\\s*([^<]+)`,
    'g',
  )
  // Collect sha→message from the message links (fuller text, not the short-sha links)
  const seen = new Set<string>()
  const entries: Commit[] = []
  for (const m of html.matchAll(commitRe)) {
    const sha = m[1]
    const text = m[2].trim()
    if (!seen.has(sha) && text.length > 8) {
      seen.add(sha)
      entries.push({ sha, message: text, date: null, url: `https://tangled.sh/${owner}/${repo}/commit/${sha}` })
    }
  }
  // Extract ISO dates from <time datetime="..."> in document order, zip with entries
  const timeRe = /<time\s[^>]*datetime="([^"]+)"/g
  const dates: string[] = []
  for (const m of html.matchAll(timeRe)) dates.push(m[1].replace(/&#43;/g, '+').replace(/&amp;/g, '&'))
  for (let i = 0; i < entries.length; i++) {
    commits.push({ ...entries[i], date: dates[i] ?? null })
  }
  return commits
}

function escRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export const Route = createFileRoute('/api/sites/$domain/commits')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const session = await auth.api.getSession({ headers: request.headers })
        if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

        const [siteRow] = await db
          .select()
          .from(site)
          .where(eq(site.domain, params.domain))
          .limit(1)

        if (!siteRow?.isTangled || !siteRow.repoName) {
          return Response.json({ commits: [] })
        }

        const owner = siteRow.domain
        const repo = siteRow.repoName

        // Try main then master as default branch
        for (const branch of ['main', 'master']) {
          const url = `https://tangled.sh/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${branch}`
          try {
            const res = await fetch(url, { headers: { 'User-Agent': 'vetka/1.0' } })
            if (!res.ok) continue
            const html = await res.text()
            const commits = scrapeCommits(html, owner, repo)
            if (commits.length > 0) return Response.json({ commits })
          } catch {
            // try next branch
          }
        }

        return Response.json({ commits: [] })
      },
    },
  },
})
