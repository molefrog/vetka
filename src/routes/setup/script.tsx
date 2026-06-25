import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { getAuthSession, createSite } from '../../lib/session-fns'

export const Route = createFileRoute('/setup/script')({
  beforeLoad: async () => {
    const session = await getAuthSession()
    if (!session?.user) throw redirect({ to: '/' })
  },
  component: SetupScriptPage,
})

const SCRIPT_TAG = `<script type="module" src="https://vetka.sh/notch.js"></script>`

function SetupScriptPage() {
  const router = useRouter()
  const [domain, setDomain] = useState('')
  const [phase, setPhase] = useState<'enter' | 'check'>('enter')
  const [found, setFound] = useState(false)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startPolling(d: string) {
    if (intervalRef.current) clearInterval(intervalRef.current)

    async function check() {
      setChecking(true)
      try {
        const res = await fetch(`/api/notch/check?domain=${encodeURIComponent(d)}`)
        const { found: ok } = (await res.json()) as { found: boolean }
        if (ok) {
          setFound(true)
          if (intervalRef.current) clearInterval(intervalRef.current)
        }
      } finally {
        setChecking(false)
      }
    }

    check()
    intervalRef.current = setInterval(check, 5000)
  }

  async function handleDomainSubmit(e: React.FormEvent) {
    e.preventDefault()
    const d = domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!d) return
    setDomain(d)
    setPhase('check')
    startPolling(d)
  }

  function handleBack() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setPhase('enter')
    setFound(false)
  }

  async function handleFinish() {
    setSaving(true)
    try {
      await createSite({ data: { domain, isTangled: false } })
      router.navigate({ to: '/' })
    } catch {
      setSaving(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(SCRIPT_TAG)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (phase === 'enter') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h1 className="font-display text-xl font-semibold">Connect your website</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Enter your website domain to get a script to embed.
            </p>
          </div>

          <form onSubmit={handleDomainSubmit} className="space-y-3">
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="evan.com"
              autoCapitalize="none"
              autoComplete="off"
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-zinc-200 focus:border-zinc-400 outline-none transition-colors bg-white"
            />
            <button
              type="submit"
              disabled={!domain.trim()}
              className="w-full py-2.5 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors"
            >
              Continue
            </button>
          </form>

          <a href="/" className="block text-center text-sm text-zinc-400 hover:text-zinc-700">
            Skip for now
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="font-display text-xl font-semibold">Add the script to {domain}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Paste this tag in the <code className="bg-zinc-100 px-1 rounded">&lt;head&gt;</code> or
            at the end of <code className="bg-zinc-100 px-1 rounded">&lt;body&gt;</code>.
          </p>
        </div>

        <div className="relative">
          <pre className="text-xs bg-zinc-900 text-zinc-100 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-all">
            {SCRIPT_TAG}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-zinc-700 text-zinc-200 hover:bg-zinc-600 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {found ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              Script detected on {domain}
            </p>
            <button
              onClick={handleFinish}
              disabled={saving}
              className="w-full py-2.5 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : 'Finish setup'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-zinc-400 flex items-center gap-2">
            <span
              className={`inline-block size-2 rounded-full shrink-0 ${checking ? 'bg-yellow-400 animate-pulse' : 'bg-zinc-300'}`}
            />
            {checking ? 'Checking…' : 'Waiting for script to appear on your site'}
          </p>
        )}

        <button
          onClick={handleBack}
          className="text-sm text-zinc-400 hover:text-zinc-700"
        >
          ← Change domain
        </button>
      </div>
    </div>
  )
}
