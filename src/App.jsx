import { useState, useEffect, useCallback, useRef } from 'react'
import {
  EXPECTED_SHARDS,
  appendStorageSample,
  calculateStorageRunway,
  classifyShard,
  nodeDatabaseSize,
  nodeMessageCount,
  protocolUpgradeStatus,
  sampleMessageActivity,
  shardHeight,
  shardId,
  shardLag,
  summarizePeerStability,
  summarizeShards,
} from './health.js'
import './App.css'

const STORAGE_KEY = 'nodehomie_url'
const STORAGE_HISTORY_PREFIX = 'nodehomie_storage_history:'

function formatSpeed(bps) {
  if (bps === undefined || bps === null) return '—'
  if (bps < 1) return '<1 blk/s'
  if (bps < 1000) return `~${Math.round(bps)} blk/s`
  return `~${(bps / 1000).toFixed(1)}k blk/s`
}

function formatMessageRate(perSecond) {
  if (perSecond === undefined || perSecond === null) return 'Measuring…'
  if (perSecond === 0) return '0 msg/s'
  if (perSecond < 0.1) return '<0.1 msg/s'
  if (perSecond < 100) return `${perSecond.toFixed(1)} msg/s`
  return `${Math.round(perSecond).toLocaleString()} msg/s`
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'Unavailable'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

function formatRunway(days) {
  if (!Number.isFinite(days)) return 'Measuring…'
  if (days < 1) return '<1 day'
  if (days < 90) return `~${Math.round(days)} days`
  return `~${(days / 30.4).toFixed(1)} months`
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

function peerVersion(peer) {
  return peer.contact_info?.snapchain_version ?? peer.contactInfo?.snapchainVersion ?? ''
}

function StorageOutlook({ outlook, monitorConnected }) {
  if (!outlook) return null
  const lowRunway = Number.isFinite(outlook.daysRemaining) && outlook.daysRemaining < 30
  return (
    <section className={`operator-card ${lowRunway ? 'operator-warning' : ''}`} aria-labelledby="storage-outlook-title">
      <div className="operator-card-header">
        <h2 id="storage-outlook-title">Storage outlook</h2>
        <span>{lowRunway ? 'Needs attention' : 'Database growth'}</span>
      </div>
      <div className="operator-grid">
        <div><span className="stat-label">Database size</span><strong>{formatBytes(outlook.size)}</strong></div>
        <div><span className="stat-label">Database drive free</span><strong>{formatBytes(outlook.freeBytes)}</strong></div>
        <div><span className="stat-label">Growth per day</span><strong>{outlook.growthPerDay ? formatBytes(outlook.growthPerDay) : 'Measuring…'}</strong></div>
        <div><span className="stat-label">Estimated runway</span><strong>{formatRunway(outlook.daysRemaining)}</strong></div>
      </div>
      <p className="operator-note">
        {!monitorConnected
          ? 'Connect the optional machine-health monitor to calculate remaining disk runway.'
          : outlook.growthPerDay === null
            ? 'NodeHomie needs at least 15 minutes of database history before estimating growth.'
            : 'Estimate uses recent database growth and current free space; snapshot cleanup and compaction can change it.'}
      </p>
    </section>
  )
}

function UpgradeReadiness({ status, version }) {
  const warning = status.urgency === 'soon' || status.urgency === 'overdue'
  return (
    <section className={`operator-card ${warning ? 'operator-warning' : ''}`} aria-labelledby="upgrade-title">
      <div className="operator-card-header">
        <h2 id="upgrade-title">Protocol readiness</h2>
        <span>{version || 'Version unavailable'}</span>
      </div>
      {status.scheduled ? (
        <>
          <strong className="operator-primary">
            {status.urgency === 'overdue'
              ? 'Scheduled activation time has passed'
              : `${Math.max(1, Math.ceil(status.daysRemaining))} day${Math.ceil(status.daysRemaining) === 1 ? '' : 's'} until activation`}
          </strong>
          <p className="operator-note">
            {new Date(status.scheduledAt).toLocaleString()} · Confirm this node release supports the scheduled engine version before activation.
          </p>
        </>
      ) : (
        <p className="operator-note">The node is not reporting a scheduled engine upgrade.</p>
      )}
    </section>
  )
}

function EngineShard({ shard, speed, trend }) {
  if (!shard) return null
  const lag = shardLag(shard)
  const height = shardHeight(shard)
  const { status, label } = classifyShard(shard, trend)
  return (
    <details className="engine-panel">
      <summary>
        <span><strong>Network engine</strong><small>Shard 0 orders message-shard blocks</small></span>
        <span className={`badge badge-${status}`}>{label}</span>
      </summary>
      <div className="engine-grid">
        <div><span className="stat-label">Blocks behind</span><strong>{lag === null ? 'Unavailable' : lag.toLocaleString()}</strong></div>
        <div><span className="stat-label">Block height</span><strong>{height === null ? 'Unavailable' : height.toLocaleString()}</strong></div>
        <div><span className="stat-label">Progress rate</span><strong>{speed === undefined ? 'Measuring…' : formatSpeed(speed)}</strong></div>
      </div>
    </details>
  )
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
  const [messageActivity, setMessageActivity] = useState(null)
  const [storageOutlook, setStorageOutlook] = useState(null)
  const [peerActivity, setPeerActivity] = useState(null)
  const timerRef = useRef(null)
  const prevShardRef = useRef({})
  const prevMessageRef = useRef(null)
  const trendsRef = useRef({})
  const peerIdsRef = useRef(null)

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
      const totalMessages = nodeMessageCount(json)
      if (totalMessages === null) {
        prevMessageRef.current = null
        setMessageActivity(null)
      } else {
        const activity = sampleMessageActivity(prevMessageRef.current, totalMessages, now)
        prevMessageRef.current = activity
          ? { total: activity.total, sampledAt: activity.sampledAt }
          : null
        setMessageActivity(activity)
      }
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
        const activity = summarizePeerStability(normalized.peers, peerIdsRef.current ?? [])
        setPeerActivity(peerIdsRef.current === null ? { ...activity, gained: [], lost: [] } : activity)
        peerIdsRef.current = activity.ids
        setPeerError(null)
      } catch (peerFetchError) {
        setPeers(null)
        setPeerList([])
        setPeerActivity(null)
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

  useEffect(() => {
    const size = nodeDatabaseSize(data)
    if (!url || size === null) {
      setStorageOutlook(null)
      return
    }
    const key = `${STORAGE_HISTORY_PREFIX}${url}`
    let previous = []
    try { previous = JSON.parse(localStorage.getItem(key) || '[]') } catch { previous = [] }
    const samples = appendStorageSample(previous, size, Date.now())
    try { localStorage.setItem(key, JSON.stringify(samples)) } catch { /* Storage history is optional. */ }
    const databaseDisk = hostHealth?.disks?.find(disk => disk.name === 'database')
    setStorageOutlook(calculateStorageRunway(samples, databaseDisk?.free_bytes))
  }, [data, hostHealth, url])

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
    setMessageActivity(null)
    setStorageOutlook(null)
    setPeerActivity(null)
    prevShardRef.current = {}
    prevMessageRef.current = null
    peerIdsRef.current = null
    setError(null)
    clearInterval(timerRef.current)
  }

  const shards = data?.shardInfos ?? data?.shard_infos ?? []
  const visibleShards = shards.filter(s => EXPECTED_SHARDS.includes(shardId(s)))
  const engineShard = shards.find(s => shardId(s) === 0)
  const shardSummary = summarizeShards(shards, trends)
  const infoPeerCount = data?.numPeers ?? data?.num_peers
  const peerDisplay = peers ?? infoPeerCount ?? (peerError ? 'Unavailable' : '—')
  const version = data?.version ? `v${data.version}` : null
  const shardsSynced = shardSummary.every(s => s.status === 'synced')
  const upgradeStatus = protocolUpgradeStatus(data?.nextEngineVersionTimestamp ?? data?.next_engine_version_timestamp)

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
              <StorageOutlook outlook={storageOutlook} monitorConnected={Boolean(hostHealth)} />
              <UpgradeReadiness status={upgradeStatus} version={version} />
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

              {messageActivity && (
                <section className="message-activity" aria-labelledby="message-activity-title">
                  <div className="message-activity-header">
                    <h2 id="message-activity-title">Message activity</h2>
                    <span className={shardsSynced ? 'message-mode message-mode-live' : 'message-mode message-mode-catchup'}>
                      {shardsSynced ? '● live' : '◐ includes catch-up'}
                    </span>
                  </div>
                  <div className="message-activity-grid">
                    <div className="message-stat">
                      <span className="stat-label">Total indexed</span>
                      <span className="stat-value">{messageActivity.total.toLocaleString()}</span>
                    </div>
                    <div className="message-stat">
                      <span className="stat-label">Since last refresh</span>
                      <span className="stat-value">
                        {messageActivity.delta === null ? 'Measuring…' : `+${messageActivity.delta.toLocaleString()}`}
                      </span>
                    </div>
                    <div className="message-stat">
                      <span className="stat-label">{shardsSynced ? 'Message rate' : 'Indexing rate'}</span>
                      <span className="stat-value">{formatMessageRate(messageActivity.perSecond)}</span>
                    </div>
                  </div>
                  <p className="message-activity-note">
                    {shardsSynced
                      ? 'Messages indexed by this node since the previous sample.'
                      : 'This rate includes historical indexing until both shards are synced.'}
                  </p>
                </section>
              )}

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
                  <>
                    {peerActivity && (
                      <div className="peer-summary">
                        <span>{peerActivity.sources.collected} collected</span>
                        <span>{peerActivity.sources.derived} derived</span>
                        <span>{peerActivity.gained.length ? `+${peerActivity.gained.length} joined` : 'No joins'}</span>
                        <span>{peerActivity.lost.length ? `−${peerActivity.lost.length} dropped` : 'No drops'}</span>
                      </div>
                    )}
                    <ul className="peer-list">
                      {peerList.map((peer, index) => (
                        <li className="peer-row" key={`${peerId(peer)}-${index}`}>
                          <span className="peer-id" title={peerId(peer)}>{peerId(peer)}</span>
                          <span className="peer-meta">
                            {peer.source && <span className="peer-source">{peer.source}</span>}
                            {peerVersion(peer) && <span className="peer-version">v{peerVersion(peer)}</span>}
                            {peerAddress(peer) && <span className="peer-address" title={peerAddress(peer)}>{peerAddress(peer)}</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : peers > 0 ? (
                  <p className="peer-empty">The node reports {peers} connected peers, but did not include peer details.</p>
                ) : (
                  <p className="peer-empty">No connected peers are currently reported by the node.</p>
                )}
              </section>

              <EngineShard shard={engineShard} speed={speeds[0]} trend={trends[0]} />

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
