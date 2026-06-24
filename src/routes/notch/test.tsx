import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/notch/test')({
  component: NotchTestPage,
})

function NotchTestPage() {
  useEffect(() => {
    const script = document.createElement('script')
    script.src = `/notch.js?t=${Date.now()}`
    document.body.appendChild(script)
    return () => {
      document.body.removeChild(script)
    }
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#111', fontFamily: "'Georgia', serif" }}>
      <style>{`
        .notch-test-nav a { color: #111; text-decoration: none; font-size: 14px; }
        .notch-test-nav a:hover { text-decoration: underline; }
        .notch-test-btn {
          display: inline-block;
          padding: 12px 24px;
          background: #111;
          color: #fff;
          border-radius: 6px;
          font-size: 15px;
          cursor: pointer;
          text-decoration: none;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          border: none;
        }
        .notch-test-btn.secondary {
          background: transparent;
          color: #111;
          border: 1px solid #d1d5db;
        }
        .notch-test-btn:hover { opacity: 0.85; }
        .notch-feature-card {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 24px;
          background: #fafafa;
        }
      `}</style>

      {/* Header */}
      <header style={{ borderBottom: '1px solid #e5e7eb', padding: '0 40px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: '-apple-system, sans-serif', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>
          Meridian
        </div>
        <nav className="notch-test-nav" style={{ display: 'flex', gap: 28 }}>
          <a href="#">Product</a>
          <a href="#">Pricing</a>
          <a href="#">Blog</a>
          <a href="#">Docs</a>
        </nav>
        <div style={{ display: 'flex', gap: 10, fontFamily: '-apple-system, sans-serif' }}>
          <button className="notch-test-btn secondary">Sign in</button>
          <button className="notch-test-btn">Get started</button>
        </div>
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '96px 40px 80px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: 999, padding: '4px 14px', fontSize: 13, fontFamily: '-apple-system, sans-serif', marginBottom: 24 }}>
          Now in public beta
        </div>
        <h1 style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 20 }}>
          Ship faster with<br />less friction
        </h1>
        <p style={{ fontSize: 20, color: '#6b7280', lineHeight: 1.6, marginBottom: 40, fontFamily: '-apple-system, sans-serif' }}>
          Meridian helps your team collaborate on design and code without the back-and-forth.
          One source of truth, always in sync.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button className="notch-test-btn" style={{ fontSize: 16, padding: '14px 28px' }}>Start for free</button>
          <button className="notch-test-btn secondary" style={{ fontSize: 16, padding: '14px 28px' }}>Watch demo</button>
        </div>
        <p style={{ marginTop: 16, fontSize: 13, color: '#9ca3af', fontFamily: '-apple-system, sans-serif' }}>
          No credit card required · Free forever for small teams
        </p>
      </section>

      {/* Screenshot placeholder */}
      <div style={{ maxWidth: 900, margin: '0 auto 80px', padding: '0 40px' }}>
        <div style={{
          background: 'linear-gradient(135deg, #f8faff 0%, #eef2ff 100%)',
          border: '1px solid #e0e7ff',
          borderRadius: 14,
          height: 400,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#818cf8',
          fontSize: 14,
          fontFamily: '-apple-system, sans-serif',
        }}>
          App screenshot
        </div>
      </div>

      {/* Features */}
      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '0 40px 96px' }}>
        <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8, fontFamily: '-apple-system, sans-serif', textAlign: 'center' }}>Everything you need</h2>
        <p style={{ textAlign: 'center', color: '#6b7280', fontSize: 16, fontFamily: '-apple-system, sans-serif', marginBottom: 48 }}>Built for modern teams that move fast</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {[
            { icon: '⚡', title: 'Instant sync', desc: 'Changes propagate in real-time. No more "did you get my latest file?" emails.' },
            { icon: '🔒', title: 'Granular access', desc: 'Control who sees what. Share specific components or entire design systems.' },
            { icon: '🎨', title: 'Design tokens', desc: 'Manage colors, typography, and spacing from one place. Export to any format.' },
            { icon: '🔌', title: 'Integrations', desc: 'Works with Figma, GitHub, Linear, Jira, Slack, and 40+ other tools.' },
            { icon: '📊', title: 'Analytics', desc: 'See how your design system gets used across teams and projects.' },
            { icon: '🤝', title: 'Collaboration', desc: 'Leave comments, request reviews, and approve changes without leaving the app.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="notch-feature-card">
              <div style={{ fontSize: 24, marginBottom: 10 }}>{icon}</div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6, fontFamily: '-apple-system, sans-serif' }}>{title}</div>
              <div style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.55, fontFamily: '-apple-system, sans-serif' }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ background: '#f9fafb', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '80px 40px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, textAlign: 'center', marginBottom: 48, fontFamily: '-apple-system, sans-serif', letterSpacing: '-0.02em' }}>Loved by product teams</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
            {[
              { quote: "Cut our design handoff time in half. The Figma integration alone was worth switching.", name: 'Sarah K.', role: 'Head of Design, Vercel' },
              { quote: "Finally, a tool that both designers and engineers actually want to use every day.", name: 'Marcus T.', role: 'Engineering Lead, Linear' },
              { quote: "Our design system consistency went from 60% to 98% coverage in one quarter.", name: 'Priya M.', role: 'Product Designer, Notion' },
            ].map(({ quote, name, role }) => (
              <div key={name} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 24 }}>
                <p style={{ color: '#374151', fontSize: 14, lineHeight: 1.6, marginBottom: 16, fontFamily: '-apple-system, sans-serif' }}>"{quote}"</p>
                <div style={{ fontWeight: 600, fontSize: 13, fontFamily: '-apple-system, sans-serif' }}>{name}</div>
                <div style={{ color: '#9ca3af', fontSize: 12, fontFamily: '-apple-system, sans-serif' }}>{role}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 600, margin: '0 auto', padding: '96px 40px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 16, fontFamily: '-apple-system, sans-serif' }}>Ready to ship faster?</h2>
        <p style={{ color: '#6b7280', fontSize: 17, marginBottom: 36, lineHeight: 1.5, fontFamily: '-apple-system, sans-serif' }}>
          Join 2,000+ teams already using Meridian to close the gap between design and code.
        </p>
        <button className="notch-test-btn" style={{ fontSize: 16, padding: '14px 32px' }}>Get started for free</button>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #e5e7eb', padding: '32px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: '-apple-system, sans-serif' }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Meridian</div>
        <div style={{ color: '#9ca3af', fontSize: 13 }}>© 2025 Meridian Inc.</div>
        <nav style={{ display: 'flex', gap: 20 }}>
          {['Privacy', 'Terms', 'Twitter', 'GitHub'].map((link) => (
            <a key={link} href="#" style={{ color: '#9ca3af', fontSize: 13, textDecoration: 'none' }}>{link}</a>
          ))}
        </nav>
      </footer>
    </div>
  )
}
