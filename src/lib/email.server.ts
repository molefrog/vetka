// ---------------------------------------------------------------------------
// Transactional email. Used to deliver login OTP codes (see auth.server.ts).
//
// If RESEND_API_KEY is set we send via Resend's HTTP API (no SDK dependency —
// just fetch). Otherwise we log the message to the server console so email +
// OTP login works end-to-end in development without any provider keys. The
// production keys are wired in by setting RESEND_API_KEY / EMAIL_FROM.
// ---------------------------------------------------------------------------

export async function sendEmail({
  to,
  subject,
  text,
}: {
  to: string
  subject: string
  text: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM ?? 'Vetka <login@vetka.sh>'

  if (!apiKey) {
    // Dev fallback — no provider configured.
    console.log(`\n[email:dev] to=${to} subject=${JSON.stringify(subject)}\n${text}\n`)
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text }),
  })
  if (!res.ok) {
    throw new Error(`Resend send failed (${res.status}): ${await res.text()}`)
  }
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Your Vetka login code',
    text: `Your Vetka login code is ${otp}\n\nIt expires in a few minutes. If you didn't request this, you can ignore this email.`,
  })
}
