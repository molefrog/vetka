import { createFileRoute } from '@tanstack/react-router'

// POST /api/agent/deploy
// Called by the build agent (not the browser) to publish a generated site.
// Auth: Bearer <deploy token> — a short-lived, per-site token the agent obtains
// from the `get_deploy_credentials` custom tool. The token determines which site
// is deployed (the agent can't target another site), so no siteId is trusted
// from the body. Body: JSON
//   { "files": [{ "path": "index.html", "contentBase64": "..." }, ...], "message"?: "..." }
// On an expired/invalid token we return 401 with code "token_expired" so the
// agent knows to call get_deploy_credentials again and retry.
export const Route = createFileRoute('/api/agent/deploy')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/, '').trim()
        if (!token) {
          return Response.json({ ok: false, error: 'Missing Authorization header', code: 'no_token' }, { status: 401 })
        }

        const { verifyDeployToken } = await import('../../../lib/deploy-token.server')
        const auth = await verifyDeployToken(token)
        if (!auth.ok) {
          return Response.json(
            {
              ok: false,
              code: auth.reason === 'expired' ? 'token_expired' : 'token_invalid',
              error:
                auth.reason === 'expired'
                  ? 'Deploy token expired — call get_deploy_credentials for a fresh token and retry.'
                  : 'Invalid deploy token — call get_deploy_credentials to obtain one.',
            },
            { status: 401 },
          )
        }

        let payload: { files?: Array<{ path?: string; contentBase64?: string }>; message?: string }
        try {
          payload = await request.json()
        } catch {
          return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }

        const files = (payload.files ?? [])
          .filter((f): f is { path: string; contentBase64: string } => !!f.path && typeof f.contentBase64 === 'string')
          .map((f) => ({ path: f.path, content: Buffer.from(f.contentBase64, 'base64') }))
        if (!files.length) {
          return Response.json({ ok: false, error: 'No files provided' }, { status: 400 })
        }

        const { deploySite } = await import('../../../lib/deploy.server')
        const result = await deploySite(auth.siteId, files, { message: payload.message, triggeredBy: 'agent' })
        return Response.json(result, { status: result.ok ? 200 : 500 })
      },
    },
  },
})
