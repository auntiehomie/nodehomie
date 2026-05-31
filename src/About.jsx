import './About.css'

function ExtLink({ href, children }) {
  return (
    <a className="about-ext-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

export default function About() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>NodeHomie</h1>
        <p className="subtitle">Hypersnap node monitor</p>
      </header>

      <div className="about-hero">
        <p className="about-tagline">
          A mobile-friendly dashboard for monitoring your Hypersnap node — from anywhere, on any device.
        </p>
      </div>

      <div className="about-section">
        <h2 className="about-section-title">What it does</h2>
        <ul className="about-list">
          <li>Connects to your Hypersnap node over Tailscale</li>
          <li>Shows real-time shard sync status and history remaining</li>
          <li>Tracks block rate and block height per shard</li>
          <li>Auto-refreshes on a configurable interval</li>
          <li>Works on iPhone, Android, and desktop</li>
          <li>No backend — runs entirely in your browser</li>
        </ul>
      </div>

      <div className="about-section">
        <h2 className="about-section-title">Who it's for</h2>
        <p className="about-body">
          Anyone running a Hypersnap node who wants a clean, at-a-glance status view from their phone without SSHing into their machine or opening Grafana.
        </p>
        <p className="about-body">
          Hypersnap is a decentralized social network — a community-run fork of Farcaster. Running a node means hosting a copy of the network's data and helping keep it decentralized.
        </p>
        <div className="about-links">
          <ExtLink href="https://hypersnap.org">hypersnap.org ↗</ExtLink>
          <ExtLink href="https://github.com/farcasterorg/hypersnap">Hypersnap GitHub ↗</ExtLink>
          <ExtLink href="https://github.com/auntiehomie/nodehomie">NodeHomie GitHub ↗</ExtLink>
        </div>
      </div>

      <div className="about-section">
        <h2 className="about-section-title">How to connect</h2>
        <ol className="about-list about-list-ordered">
          <li>Run a Hypersnap node on a machine with Tailscale installed</li>
          <li>Enable Tailscale HTTPS certificates in your Tailscale admin panel</li>
          <li>Run <code>sudo tailscale serve --bg http://localhost:3381</code> on the node machine</li>
          <li>Open NodeHomie on your phone with Tailscale active</li>
          <li>Enter your <code>https://your-machine.ts.net</code> address and connect</li>
        </ol>
        <p className="about-tip">
          See the Setup Guide tab for a full walkthrough from bare metal to synced node.
        </p>
      </div>

      <div className="about-section about-credits">
        <h2 className="about-section-title">Credits</h2>
        <p className="about-body about-credits-intro">
          Built by the community, for the community.
        </p>
        <div className="credits-list">
          <a className="credit-card" href="https://farcaster.xyz/cassie" target="_blank" rel="noopener noreferrer">
            <span className="credit-name">Cassie</span>
            <span className="credit-handle">@cassie ↗</span>
          </a>
          <a className="credit-card" href="https://farcaster.xyz/felirami.eth" target="_blank" rel="noopener noreferrer">
            <span className="credit-name">Felirami</span>
            <span className="credit-handle">@felirami.eth ↗</span>
          </a>
          <a className="credit-card" href="https://farcaster.xyz/trish" target="_blank" rel="noopener noreferrer">
            <span className="credit-name">Trish</span>
            <span className="credit-handle">@trish ↗</span>
          </a>
          <a className="credit-card" href="https://claude.ai" target="_blank" rel="noopener noreferrer">
            <span className="credit-name">Claude</span>
            <span className="credit-handle">claude.ai ↗</span>
          </a>
        </div>
      </div>
    </div>
  )
}
