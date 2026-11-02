import { useState, useEffect, useCallback, useRef } from 'react'
import { EXPECTED_SHARDS, classifyShard, shardHeight, shardId, shardLag, summarizeShards } from './health.js'
import './App.css'

const STORAGE_KEY = 'nodehomie_url'

function formatSpeed(bps) {
  if (bps === undefined || bps === null) return '—'
  if (bps < 1) return '<1 blk/s'
  if (bps < 1000) return `~${Math.round(bps)} blk/s`
  return `~${(bps / 1000).toFixed(1)}k blk/s`
}

function ShardCard({ shard, speed, trend }) {
  const lag = shardLag(shard)
  const height = shardHeight(shard)
  const id = shardId(shard)
  const { status, label } = classifyShard(shard, trend)

  return (
    <div className={`shard-card shard-${status}`}>
      <div className="shard-header">
        <span className="shard-title">Shard {id}</span>
        <span className={`badge badge-${status}`}>
          {status === 'synced' ? '● synced' : status === 'stalled' ? '○ stalled' : status === 'unknown' ? '○ unknown' : `◐ ${label}`}
        </span>
      </div>
      <div className="shard-stats">
        <div className="stat stat-full">
          <span className="stat-label">Blocks behind network tip</span>
          <span className={`stat-value color-${status}`} style={{ fontSize: '15px' }}>{lag === null ? 'Unavailable' : lag.toLocaleString()}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Sync speed</span>
          {status === 'synced' ? (
            <span className="stat-value color-synced" style={{ fontSize: '15px' }}>Live</span>
          ) : speed === undefined ? (
            <span className="stat-value" style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Measuring…</span>
          ) : speed < 1 ? (
            <span className="stat-value" style={{ fontSize: '13px', color: 'var(--text-dim)' }}>No height change this sample</span>
          ) : (
            <span className={`stat-value color-${speed >= 500 ? 'synced' : speed >= 50 ? 'close' : 'behind'}`} style={{ fontSize: '15px' }}>
              {formatSpeed(speed)}
            </span>
          )}
        </div>
        <div className="stat">
          <span className="stat-label">Block height</span>
          <span className="stat-value">{height === null ? 'Unavailable' : height.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}

function normalizePeerResponse(payload) {
  if (Array.isArray(payload)) return { peers: payload, count: payload.length }
  if (Array.isArray(payload?.peers)) return { peers: payload.peers, count: payload.peers.length }
  if (Array.isArray(payload?.currentPeers)) return { peers: payload.currentPeers, count: payload.currentPeers.length }
  if (Number.isFinite(payload?.numPeers)) return { peers: [], count: payload.numPeers }
  if (Number.isFinite(payload?.num_peers)) return { peers: [], count: payload.num_peers }
  return null
}

function peerId(peer) {
  return peer.peer_id ?? peer.peerId ?? peer.id ?? 'Unknown peer'
}

function peerAddress(peer) {
  return peer.observed_address ?? peer.observedAddress ?? peer.contact_info?.gossip_address ??
    peer.contactInfo?.gossipAddress ?? ''
}

function HostHealth({ health }) {
  if (!health) return (
    <section className="host-health host-unavailable">
      <div><h2>Machine health</h2><span className="health-note">Optional host monitor not connected</span></div>
      <p>Node and shard health are available above. Follow Setup Guide → Monitoring to add disk and container metrics.</p>
    </section>
  )
  const disk = (health.disks || []).map(item => `${item.name}: ${item.used_percent}% used, ${Math.floor(item.free_bytes / 1024 ** 3)} GiB free`).join(' · ')
  return (
    <section className={`host-health ${health.container?.running ? 'host-ok' : 'host-warning'}`}>
      <div className="host-health-heading"><h2>Machine health</h2><span>{health.container?.running ? 'Container running' : 'Container stopped'}</span></div>
      <div className="host-metrics">
        <span>CPU {health.container?.cpu_percent ?? '—'}%</span>
        <span>Memory {health.container?.memory_usage ?? '—'} / {health.container?.memory_limit ?? '—'}</span>
        <span>{disk || 'Disk data unavailable'}</span>
        <span>Restarts {health.container?.restart_count ?? '—'}</span>
      </div>
      {health.warnings?.length > 0 && <p className="health-note">{health.warnings.join(' · ')}</p>}
    </section>
  )
}

export default function App() {
  const [url, setUrl] = useState(() => localStorage.getItem(STORAGE_KEY) || '')
  const [inputUrl, setInputUrl] = useState(() => localStorage.getItem(STORAGE_KEY) || '')
  const [data, setData] = useState(null)
  const [peers, setPeers] = useState(null)
  const [peerList, setPeerList] = useState([])
  const [peerError, setPeerError] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshInterval, setRefreshInterval] = useState(30)
  const [speeds, setSpeeds] = useState({})
  const [trends, setTrends] = useState({})
  const [hostHealth, setHostHealth] = useState(null)
  const timerRef = useRef(null)
  const prevShardRef = useRef({})
  const trendsRef = useRef({})

  const fetchData = useCallback(async (targetUrl) => {
    if (!targetUrl) return
    setLoading(true)
    setError(null)
    if (window.location.protocol === 'https:' && targetUrl.startsWith('http:')) {
      setError('MIXED_CONTENT')
      setData(null)
      setLoading(false)
      return
    }
    try {
      const base = targetUrl.replace(/\/$/, '')
      const [infoRes, peersRes] = await Promise.allSettled([
        fetch(`${base}/v1/info`),
        fetch(`${base}/v1/currentPeers`),
      ])
      if (infoRes.status === 'rejected' || !infoRes.value.ok)
        throw new Error(infoRes.reason?.message ?? `HTTP ${infoRes.value?.status}`)
      const json = await infoRes.value.json()
      setData(json)
      setLastUpdated(new Date())
      const now = Date.now()
      const newSpeeds = {}
      const newPrev = {}
      const newTrends = { ...trendsRef.current }
      const shardList = json.shardInfos ?? json.shard_infos ?? []
      shardList.forEach(s => {
        const id = shardId(s)
        const h = shardHeight(s)
        const lag = shardLag(s)
        const prev = prevShardRef.current[id]
        if (prev && h !== null && prev.height !== null) {
          const elapsed = (now - prev.time) / 1000
          newSpeeds[id] = elapsed > 0 ? Math.max(0, (h - prev.height) / elapsed) : undefined
          const improved = h > prev.height || (lag !== null && prev.lag !== null && lag < prev.lag)
          const prior = trendsRef.current[id]
          const lastProgress = improved ? now : (prior?.lastProgress ?? now)
          newTrends[id] = { advancing: improved, lastProgress, stalled: lag > 60 && now - lastProgress >= 5 * 60 * 1000 }
        }
        newPrev[id] = { height: h, lag, time: now }
      })
      prevShardRef.current = newPrev
      trendsRef.current = newTrends
      setSpeeds(newSpeeds)
      setTrends(newTrends)
      try {
        const healthResponse = await fetch(`${base}/node-healthz`, { signal: AbortSignal.timeout(4000) })
        if (!healthResponse.ok) throw new Error(`HTTP ${healthResponse.status}`)
        setHostHealth(await healthResponse.json())
      } catch {
        setHostHealth(null)
      }
      try {
        if (peersRes.status === 'rejected') throw peersRes.reason
        let response = peersRes.value
        // Older node builds may expose only the legacy route.
        if (response.status === 404) response = await fetch(`${base}/v1/peers`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const normalized = normalizePeerResponse(await response.json())
        if (!normalized) throw new Error('Unexpected response from peer endpoint')
        setPeers(normalized.count)
        setPeerList(normalized.peers)
        setPeerError(null)
      } catch (peerFetchError) {
        setPeers(null)
        setPeerList([])
        setPeerError(peerFetchError?.message || 'Peer endpoint unavailable')
      }
    } catch (e) {
      setError(e.message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (url && refreshInterval > 0) {
      timerRef.current = setInterval(() => fetchData(url), refreshInterval * 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [url, refreshInterval, fetchData])

  useEffect(() => {
    if (url) fetchData(url)
  }, [url, fetchData])

  function connect() {
    const trimmed = inputUrl.trim()
    if (!trimmed) return
    localStorage.setItem(STORAGE_KEY, trimmed)
    setUrl(trimmed)
  }

  function disconnect() {
    localStorage.removeItem(STORAGE_KEY)
    setUrl('')
    setInputUrl('')
    setData(null)
    setPeers(null)
    setPeerList([])
    setPeerError(null)
    setSpeeds({})
    setTrends({})
    trendsRef.current = {}
    setHostHealth(null)
    prevShardRef.current = {}
    setError(null)
    clearInterval(timerRef.current)
  }

  const shards = data?.shardInfos ?? data?.shard_infos ?? []
  const visibleShards = shards.filter(s => EXPECTED_SHARDS.includes(shardId(s)))
  const shardSummary = summarizeShards(shards, trends)
  const infoPeerCount = data?.numPeers ?? data?.num_peers
  const peerDisplay = peers ?? infoPeerCount ?? (peerError ? 'Unavailable' : '—')
  const version = data?.version ? `v${data.version}` : null

  return (
    <div className="app">
      <header className="app-header">
        <h1>NodeHomie</h1>
        <p className="subtitle">Hypersnap node monitor</p>
      </header>

      {!url ? (
        <div className="setup-card">
          <label className="input-label">Node URL</label>
          <input
            type="text"
            className="url-input"
            placeholder="https://your-node.ts.net:3381"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && connect()}
          />
          <button className="btn-connect" onClick={connect}>Connect</button>
        </div>
      ) : (
        <>
          <div className="node-bar">
            <div className="node-info">
              <span className={`status-dot ${data ? 'dot-green' : error ? 'dot-red' : 'dot-amber'}`} />
              <span className="node-url">{url}</span>
              {version && <span className="version-badge">{version}</span>}
            </div>
            <button className="btn-disconnect" onClick={disconnect}>Disconnect</button>
          </div>

          {error && (
            <div className="error-banner">
              {error === 'MIXED_CONTENT' ? (
                <>
                  <strong>HTTPS → HTTP blocked by browser.</strong> Your node is HTTP but this page is HTTPS. Fix: use the node's <code>https://</code> address, or open the app over HTTP instead (e.g. save it as a local file or self-host without TLS).
                </>
              ) : (
                <>Could not reach node: {error}. Check URL and Tailscale.</>
              )}
            </div>
          )}

          {data && (
            <>
              <section className="health-summary" aria-label="Node health summary">
                <strong>{shardSummary.some(s => s.status === 'stalled' || s.status === 'missing') ? 'Needs attention' : shardSummary.every(s => s.status === 'synced') ? 'Healthy' : shardSummary.some(s => s.status === 'unknown') ? 'Telemetry incomplete' : 'Synchronizing'}</strong>
                <span>Shards 1 and 2: {shardSummary.map(s => `#${s.id} ${s.label}`).join(' · ')}</span>
              </section>
              <HostHealth health={hostHealth} />
              <div className="top-stats">
                <div className="top-stat">
                  <span className="stat-label">Peers</span>
                  <span className="stat-value">{peerDisplay}</span>
                </div>
                <div className="top-stat">
                  <span className="stat-label">Auto-refresh</span>
                  <select
                    value={refreshInterval}
                    onChange={e => setRefreshInterval(Number(e.target.value))}
                    className="refresh-select"
                  >
                    <option value={0}>Off</option>
                    <option value={15}>15s</option>
                    <option value={30}>30s</option>
                    <option value={60}>1m</option>
                    <option value={300}>5m</option>
                  </select>
                </div>
              </div>

              <section className="peers-panel" aria-labelledby="connected-peers-title">
                <div className="peers-panel-header">
                  <h2 id="connected-peers-title">Connected peers</h2>
                  <span className={peerError ? 'peer-count peer-count-error' : 'peer-count'}>
                    {peers === null ? 'Unavailable' : `${peers} connected`}
                  </span>
                </div>
                {peerError ? (
                  <p className="peer-empty">Could not load peer connections ({peerError}). The node is reachable, but its peer endpoint did not return usable data.</p>
                ) : peerList.length > 0 ? (
                  <ul className="peer-list">
                    {peerList.map((peer, index) => (
                      <li className="peer-row" key={`${peerId(peer)}-${index}`}>
                        <span className="peer-id" title={peerId(peer)}>{peerId(peer)}</span>
                        <span className="peer-meta">
                          {peer.source && <span className="peer-source">{peer.source}</span>}
                          {peerAddress(peer) && <span className="peer-address" title={peerAddress(peer)}>{peerAddress(peer)}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : peers > 0 ? (
                  <p className="peer-empty">The node reports {peers} connected peers, but did not include peer details.</p>
                ) : (
                  <p className="peer-empty">No connected peers are currently reported by the node.</p>
                )}
              </section>

              <div className="shards-list">
                {visibleShards.map(s => (
                  <ShardCard key={shardId(s)} shard={s} speed={speeds[shardId(s)]} trend={trends[shardId(s)]} />
                ))}
                {visibleShards.length === 0 && <p className="peer-empty">The node did not report shard 1 or 2.</p>}
              </div>

              <div className="footer-row">
                {lastUpdated && (
                  <span className="last-updated">Updated {lastUpdated.toLocaleTimeString()}</span>
                )}
                <button className="btn-refresh" onClick={() => fetchData(url)} disabled={loading}>
                  {loading ? 'Refreshing…' : '↻ Refresh'}
                </button>
              </div>
            </>
          )}

          {loading && !data && (
            <div className="loading">Connecting to node…</div>
          )}
        </>
      )}
    </div>
  )
}
