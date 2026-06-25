import { createFileRoute } from '@tanstack/react-router'
import { auth } from '../../../lib/auth.server'
import { getAnthropicClient } from '../../../lib/agent.server'

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
])

export const Route = createFileRoute('/api/agent/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers })
        if (!session?.user) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const formData = await request.formData()
        const file = formData.get('file') as File | null
        if (!file) {
          return Response.json({ error: 'No file provided' }, { status: 400 })
        }

        if (!ALLOWED_MIME.has(file.type)) {
          return Response.json({ error: 'Unsupported file type' }, { status: 400 })
        }

        if (file.size > 20 * 1024 * 1024) {
          return Response.json({ error: 'File too large (max 20MB)' }, { status: 400 })
        }

        const client = getAnthropicClient()

        const uploaded = await client.beta.files.upload({
          file: new File([await file.arrayBuffer()], file.name || 'upload', { type: file.type }),
        })

        return Response.json({ file_id: uploaded.id, mime_type: file.type, name: file.name })
      },
    },
  },
})
