import { useState, useEffect, createContext, useContext } from 'react'
import './SetupGuide.css'

const CHECKS_KEY = 'nodehomie_guide_checks'

const CheckContext = createContext(null)

function useChecks() {
  const [checks, setChecks] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(CHECKS_KEY) || '[]')) }
    catch { return new Set() }
  })
  function toggle(id) {
    setChecks(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      localStorage.setItem(CHECKS_KEY, JSON.stringify([...next]))
      return next
    })
  }
  return [checks, toggle]
}

function Step({ id, children }) {
  const { checks, toggle } = useContext(CheckContext)
  const checked = checks.has(id)
  return (
    <label className={`guide-step ${checked ? 'step-done' : ''}`}>
      <input type="checkbox" checked={checked} onChange={() => toggle(id)} />
      <span>{children}</span>
    </label>
  )
}

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(children.trim()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="code-block">
      <pre><code>{children.trim()}</code></pre>
      <button className="copy-btn" onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
    </div>
  )
}

function Section({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="guide-section">
      <button className="section-header" onClick={() => setOpen(o => !o)}>
        <span className="section-title">{title}</span>
        <span className="section-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  )
}

function ExtLink({ href, children }) {
  return <a className="guide-ext-link" href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a>
}

export default function SetupGuide() {
  const [checks, toggle] = useChecks()
  const totalSteps = 19
  const doneSteps = checks.size

  return (
    <CheckContext.Provider value={{ checks, toggle }}>
      <div className="app">
        <header className="app-header">
          <h1>NodeHomie</h1>
          <p className="subtitle">Hypersnap node setup guide</p>
        </header>

        <div className="guide-hero">
          <div className="guide-progress-wrap">
            <div className="guide-progress-bar">
              <div className="guide-progress-fill" style={{ width: `${Math.round((doneSteps / totalSteps) * 100)}%` }} />
            </div>
            <span className="guide-progress-label">{doneSteps} / {totalSteps} steps done</span>
          </div>
          <div className="guide-top-links">
            <ExtLink href="https://hypersnap.org">hypersnap.org</ExtLink>
            <ExtLink href="https://github.com/farcasterorg/hypersnap">GitHub</ExtLink>
          </div>
        </div>

        <Section title="1. What is this?" defaultOpen>
          <p className="gp">Hypersnap is a decentralized social network — a fork of Farcaster run by the community, not a company. Running a node means you're hosting a copy of the network's data and helping keep it decentralized.</p>
          <p className="gp gnote">⚠️ The network has not released a token. Running a node right now does not earn you anything except the satisfaction of contributing to a decentralized network.</p>
        </Section>

        <Section title="2. What you need">
          <p className="glabel">Minimum hardware:</p>
          <ul className="glist">
            <li>16 GB RAM</li>
            <li>4 CPU cores</li>
            <li>1.5 TB storage — SSD preferred, 2 TB+ recommended</li>
            <li>Wired ethernet preferred over WiFi</li>
          </ul>
          <p className="glabel">What we used:</p>
          <ul className="glist">
            <li>HP EliteDesk mini PC (~$100–200 used off eBay)</li>
            <li>1 TB SSD (snapshot staging)</li>
            <li>500 GB SSD (live database)</li>
            <li>16 GB RAM</li>
          </ul>
          <p className="gp gnote">Cloud alternative: 4 vCPU / 16 GB VPS with 1.5 TB storage runs ~$80–110/month (Hetzner, DigitalOcean, Vultr).</p>
        </Section>

        <Section title="3. Prepare your machine">
          <p className="gp">Download Ubuntu 24.04 LTS and flash it to a USB drive.</p>
          <div className="glinks">
            <ExtLink href="https://ubuntu.com/download">Ubuntu 24.04 LTS</ExtLink>
            <ExtLink href="https://rufus.ie">Rufus (Windows)</ExtLink>
            <ExtLink href="https://etcher.balena.io">balenaEtcher (Mac/Linux)</ExtLink>
          </div>
          <Step id="download-ubuntu">Downloaded Ubuntu 24.04 LTS ISO</Step>
          <Step id="flash-usb">Flashed ISO to USB drive</Step>
          <Step id="boot-usb">Booted machine from USB and started install</Step>
        </Section>

        <Section title="4. Install Ubuntu">
          <ul className="glist">
            <li>Install Ubuntu to your OS drive — not your big SSDs (those are for node data)</li>
            <li>Pick a simple username</li>
            <li>Enable OpenSSH server during install</li>
            <li>Let it install updates</li>
          </ul>
          <Step id="ubuntu-installed">Ubuntu installed and logged in</Step>
          <p className="glabel">Verify after install:</p>
          <CodeBlock>{`lsb_release -a    # should show Ubuntu 24.04
nproc             # should show 4+ cores
free -h           # should show 16 GB RAM
lsblk             # see all drives`}</CodeBlock>
          <Step id="ubuntu-verified">Confirmed hardware with above commands</Step>
        </Section>

        <Section title="5. First boot setup">
          <CodeBlock>{`sudo apt update && sudo apt upgrade -y`}</CodeBlock>
          <Step id="apt-updated">Packages updated</Step>
          <p className="glabel">Install useful tools:</p>
          <CodeBlock>{`sudo apt install -y curl git jq htop iotop sysstat python3`}</CodeBlock>
          <Step id="tools-installed">Tools installed</Step>
          <p className="glabel">Enable automatic security updates:</p>
          <CodeBlock>{`sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades`}</CodeBlock>
          <Step id="auto-updates">Automatic security updates enabled</Step>
        </Section>

        <Section title="6. Install Docker">
          <CodeBlock>{`sudo apt remove docker docker-engine docker.io containerd runc 2>/dev/null
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version`}</CodeBlock>
          <Step id="docker-installed">Docker installed and verified</Step>
        </Section>

        <Section title="7. Set up your drives">
          <p className="gp gnote">⚠️ Get this right before installing the node. On first run you temporarily need ~3× the final DB size due to snapshot staging.</p>
          <p className="glabel">Find your drives:</p>
          <CodeBlock>{`lsblk -f`}</CodeBlock>
          <p className="glabel">Format and mount (replace sdX with your drive letter):</p>
          <CodeBlock>{`sudo mkfs.ext4 /dev/sdX
sudo mkdir -p /mnt/ssd /mnt/ssd2
sudo mount /dev/sdX /mnt/ssd`}</CodeBlock>
          <p className="glabel">Make mounts survive reboots — get UUIDs then edit fstab:</p>
          <CodeBlock>{`sudo blkid
sudo nano /etc/fstab`}</CodeBlock>
          <p className="glabel">Add to fstab:</p>
          <CodeBlock>{`UUID=your-uuid  /mnt/ssd   ext4  defaults  0  2
UUID=your-uuid  /mnt/ssd2  ext4  defaults  0  2`}</CodeBlock>
          <p className="glabel">Set permissions:</p>
          <CodeBlock>{`sudo chown -R $USER:docker /mnt/ssd /mnt/ssd2
sudo chmod -R 775 /mnt/ssd /mnt/ssd2`}</CodeBlock>
          <Step id="drives-mounted">Drives formatted, mounted, and in fstab</Step>
          <Step id="permissions-set">Permissions set</Step>
          <p className="glabel">Recommended storage layout:</p>
          <div className="gtable-wrap">
            <table className="gtable">
              <thead><tr><th>Drive</th><th>Mount</th><th>Purpose</th></tr></thead>
              <tbody>
                <tr><td>SSD 1 (large)</td><td>/mnt/ssd</td><td>Snapshot staging</td></tr>
                <tr><td>SSD 2</td><td>/mnt/ssd2</td><td>Live database</td></tr>
                <tr><td>HDD</td><td>/mnt/external</td><td>Backups / overflow</td></tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="8. Install the node">
          <CodeBlock>{`mkdir -p ~/snapchain
cd ~/snapchain
curl -sSL https://raw.githubusercontent.com/farcasterorg/hypersnap/refs/heads/main/scripts/hypersnap-bootstrap.sh | bash`}</CodeBlock>
          <Step id="node-bootstrapped">Ran bootstrap, accepted ToS</Step>
          <p className="glabel">Verify volumes point to your SSDs (not the OS drive):</p>
          <CodeBlock>{`cat ~/snapchain/docker-compose.yml | grep -A3 "volumes:"`}</CodeBlock>
          <p className="gp">Should show <code>/mnt/ssd2/.rocks</code> and <code>/mnt/ssd/.rocks.snapshot</code>. If not, fix it:</p>
          <CodeBlock>{`sed -i 's|.rocks:/app/.rocks|/mnt/ssd2/.rocks:/app/.rocks|' ~/snapchain/docker-compose.yml
sed -i 's|.rocks.snapshot:/app/.rocks.snapshot|/mnt/ssd/.rocks.snapshot:/app/.rocks.snapshot|' ~/snapchain/docker-compose.yml`}</CodeBlock>
          <Step id="volumes-verified">Volume mounts verified/fixed</Step>
          <p className="glabel">Add log rotation (prevents Docker logs filling the OS drive):</p>
          <CodeBlock>{`sed -i '48a\\    logging:\\n      driver: "json-file"\\n      options:\\n        max-size: "100m"\\n        max-file: "3"' ~/snapchain/docker-compose.yml`}</CodeBlock>
          <Step id="log-rotation">Log rotation added</Step>
          <p className="glabel">Add auto tar cleanup:</p>
          <CodeBlock>{`(crontab -l 2>/dev/null; echo "*/10 * * * * sudo find /mnt/ssd/.rocks.snapshot -name '*.tar' -mmin +120 -delete") | crontab -`}</CodeBlock>
          <Step id="tar-cleanup">Tar cleanup cron added</Step>
          <p className="glabel">Start the node:</p>
          <CodeBlock>{`cd ~/snapchain && ./snapchain.sh up`}</CodeBlock>
          <Step id="node-started">Node started</Step>
          <p className="glabel">Watch it sync (takes several hours):</p>
          <CodeBlock>{`./snapchain.sh logs`}</CodeBlock>
        </Section>

        <Section title="9. Tailscale — remote access">
          <p className="gp">Tailscale creates a private encrypted network between your devices. Required for accessing NodeHomie from your phone.</p>
          <div className="glinks">
            <ExtLink href="https://tailscale.com">tailscale.com</ExtLink>
            <ExtLink href="https://tailscale.com/admin">Tailscale admin</ExtLink>
          </div>
          <CodeBlock>{`curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up`}</CodeBlock>
          <Step id="tailscale-installed">Tailscale installed and authenticated on the node machine</Step>
          <p className="glabel">Install Tailscale on your phone:</p>
          <div className="glinks">
            <ExtLink href="https://apps.apple.com/app/tailscale/id1470499037">iOS</ExtLink>
            <ExtLink href="https://play.google.com/store/apps/details?id=com.tailscale.ipn.ui">Android</ExtLink>
          </div>
          <Step id="tailscale-phone">Tailscale installed on phone, signed in to same account</Step>
          <p className="glabel">Enable HTTPS (required for NodeHomie on Vercel):</p>
          <ol className="glist">
            <li>Go to <ExtLink href="https://tailscale.com/admin">tailscale.com/admin</ExtLink> → DNS</li>
            <li>Enable MagicDNS</li>
            <li>Enable HTTPS Certificates</li>
          </ol>
          <CodeBlock>{`sudo tailscale serve --bg http://localhost:3381`}</CodeBlock>
          <Step id="tailscale-https">Tailscale HTTPS serve running</Step>
          <p className="gp gnote">Connect NodeHomie using your <code>https://your-machine.ts.net</code> address — no port number needed.</p>
        </Section>

        <Section title="10. Understanding what's happening">
          <p className="glabel">Shards</p>
          <p className="gp">The network splits data across shards. Your node runs shards 1 and 2. Shard 0 is the internal block shard — don't add it to <code>shard_ids</code> in config or the node will panic.</p>
          <p className="glabel">Block delay / lag</p>
          <p className="gp">The <code>blockDelay</code> metric tells you how far behind the network tip your node is. Fresh installs show tens of millions. It decreases as the node catches up. Under 60 = basically synced.</p>
          <p className="glabel">Why does it take so long?</p>
          <p className="gp">The network has been running for a while. Snapshots help skip most history, but there's still a lot to process. Catchup runs at 8–11× so it's much faster than syncing from scratch.</p>
        </Section>

        <Section title="11. Monitoring your node">
          <p className="glabel">Check node info:</p>
          <CodeBlock>{`curl http://localhost:3381/v1/info | jq .`}</CodeBlock>
          <p className="glabel">Check block delay per shard:</p>
          <CodeBlock>{`curl -s http://localhost:3381/v1/info | jq '.shardInfos[] | {shardId, blockDelay, maxHeight}'`}</CodeBlock>
          <p className="glabel">Watch disk usage:</p>
          <CodeBlock>{`watch -n 30 'df -h /mnt/ssd /mnt/ssd2 && du -sh /mnt/ssd2/.rocks/shard-*/'`}</CodeBlock>
          <p className="gp">Grafana dashboard is available at <code>http://your-tailscale-ip:3000</code></p>
          <p className="glabel">Key metrics:</p>
          <ul className="glist">
            <li>Block delay under 60 = synced</li>
            <li>Block production rate: 1.0 = normal, 5–11× = catching up (good)</li>
            <li>Peers: 4–6+ expected</li>
          </ul>
        </Section>

        <Section title="12. Troubleshooting">
          <p className="glabel">OS drive fills up:</p>
          <CodeBlock>{`sudo du -sh /* 2>/dev/null | sort -h | tail -15
du -sh ~/snapchain/.*/ 2>/dev/null | sort -h`}</CodeBlock>
          <p className="glabel">Node keeps restarting:</p>
          <CodeBlock>{`./snapchain.sh logs | tail -50`}</CodeBlock>
          <p className="glabel">Shard stuck at high lag — check in order:</p>
          <ol className="glist">
            <li><code>docker ps</code> — is node running?</li>
            <li><code>df -h /mnt/ssd2</code> — disk full?</li>
            <li><code>timedatectl</code> — NTP synced? (clock drift breaks block validation)</li>
            <li>Is port 3382 UDP open? (gossip protocol)</li>
          </ol>
          <p className="glabel">Node panics with "Shard ID 0 is reserved":</p>
          <CodeBlock>{`./snapchain.sh down
sed -i 's/shard_ids = \\[0,1,2\\]/shard_ids = [1,2]/' ~/snapchain/docker-compose.yml
./snapchain.sh up`}</CodeBlock>
          <p className="glabel">Wipe and re-sync a shard:</p>
          <CodeBlock>{`./snapchain.sh down
sudo rm -rf /mnt/ssd2/.rocks/shard-2
./snapchain.sh up`}</CodeBlock>
          <p className="glabel">Move a shard to free up space:</p>
          <CodeBlock>{`./snapchain.sh down
sudo mv /mnt/ssd2/.rocks/shard-1 /mnt/ssd/.rocks/shard-1
sudo ln -s /mnt/ssd/.rocks/shard-1 /mnt/ssd2/.rocks/shard-1
./snapchain.sh up`}</CodeBlock>
        </Section>

        <Section title="13. Maintenance">
          <p className="glabel">Upgrade the node:</p>
          <CodeBlock>{`cd ~/snapchain && ./snapchain.sh upgrade
docker compose ps
curl -s http://127.0.0.1:3381/v1/info | jq '.version'`}</CodeBlock>
          <p className="glabel">Check disk weekly:</p>
          <CodeBlock>{`df -h /mnt/ssd /mnt/ssd2`}</CodeBlock>
          <p className="glabel">Clean up old snapshot tars manually:</p>
          <CodeBlock>{`sudo find /mnt/ssd/.rocks.snapshot -name '*.tar' -mmin +120 -delete`}</CodeBlock>
          <p className="glabel">Start Grafana if it didn't come up:</p>
          <CodeBlock>{`cd ~/snapchain && docker compose up -d grafana`}</CodeBlock>
        </Section>

        <Section title="14. Useful links">
          <div className="glinks-stack">
            <ExtLink href="https://hypersnap.org/run-a-node">Hypersnap docs — run a node</ExtLink>
            <ExtLink href="https://github.com/farcasterorg/hypersnap">Hypersnap GitHub</ExtLink>
            <ExtLink href="https://github.com/farcasterxyz/snapchain">Snapchain GitHub</ExtLink>
            <ExtLink href="https://github.com/auntiehomie/nodehomie">NodeHomie GitHub</ExtLink>
            <ExtLink href="https://tailscale.com">Tailscale</ExtLink>
            <ExtLink href="https://ubuntu.com/download">Ubuntu download</ExtLink>
            <ExtLink href="https://rufus.ie">Rufus (USB flasher, Windows)</ExtLink>
            <ExtLink href="https://etcher.balena.io">balenaEtcher (USB flasher, Mac/Linux)</ExtLink>
            <ExtLink href="https://get.docker.com">Docker install script</ExtLink>
          </div>
        </Section>
      </div>
    </CheckContext.Provider>
  )
}
