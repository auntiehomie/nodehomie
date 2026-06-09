import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

const STORAGE_KEY = 'nodehomie_url'

function formatRemaining(seconds) {
  if (seconds < 60) return 'Synced'
  if (seconds < 3600) return `~${Math.round(seconds / 60)}m remaining`
  if (seconds < 86400) return `~${Math.round(seconds / 3600)}h remaining`
  return `~${Math.round(seconds / 86400)}d remaining`
}

function lagStatus(seconds) {
  if (seconds < 60) return 'synced'
  if (seconds < 3600) return 'close'
  return 'behind'
}

function formatSpeed(bps) {
  if (bps === undefined || bps === null) return '—'
  if (bps < 1) return '<1 blk/s'
  if (bps < 1000) return `~${Math.round(bps)} blk/s`
  return `~${(bps / 1000).toFixed(1)}k blk/s`
}

function ShardCard({ shard, speed }) {
  const lag = shard.blockDelay ?? shard.block_delay ?? 0
  const height = shard.maxHeight ?? shard.max_height ?? 0
  const rate = parseFloat(shard.blockRate ?? shard.block_rate ?? 0)
  const shardId = shard.shardId ?? shard.shard_id ?? '?'
  const status = lagStatus(lag)

  return (
    <div className={`shard-card shard-${status}`}>
      <div className="shard-header">
        <span className="shard-title">Shard {shardId}</span>
        <span className={`badge badge-${status}`}>
          {status === 'synced' ? '● synced' : status === 'close' ? '◐ almost' : '○ catching up'}
        </span>
      </div>
      <div className="shard-stats">
        <div className="stat stat-full">
          <span className="stat-label">History remaining</span>
          <span className={`stat-value color-${status}`} style={{ fontSize: '15px' }}>{formatRemaining(lag)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Sync speed</span>
          {status === 'synced' ? (
            <span className="stat-value color-synced" style={{ fontSize: '15px' }}>Live</span>
          ) : speed === undefined ? (
            <span className="stat-value" style={{ fontSize: '13px', color: 'var(--text-dim)' }}>Measuring…</span>
          ) : speed < 1 ? (
            <span className="stat-value color-behind" style={{ fontSize: '13px' }}>Waiting for blocks…</span>
          ) : (
            <span className={`stat-value color-${speed >= 500 ? 'synced' : speed >= 50 ? 'close' : 'behind'}`} style={{ fontSize: '15px' }}>
              {formatSpeed(speed)}
            </span>
          )}
        </div>
        <div className="stat">
          <span className="stat-label">Block height</span>
          <span className="stat-value">{height.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [url, setUrl] = useState(() => localStorage.getItem(STORAGE_KEY) || '')
  const [inputUrl, setInputUrl] = useState(() => localStorage.getItem(STORAGE_KEY) || '')
  const [data, setData] = useState(null)
  const [peers, setPeers] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshInterval, setRefreshInterval] = useState(30)
  const [speeds, setSpeeds] = useState({})
  const timerRef = useRef(null)
  const prevShardRef = useRef({})

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
        fetch(`${base}/v1/peers`),
      ])
      if (infoRes.status === 'rejected' || !infoRes.value.ok)
        throw new Error(infoRes.reason?.message ?? `HTTP ${infoRes.value?.status}`)
      const json = await infoRes.value.json()
      setData(json)
      setLastUpdated(new Date())
      const now = Date.now()
      const newSpeeds = {}
      const newPrev = {}
      const shardList = json.shardInfos ?? json.shard_infos ?? []
      shardList.forEach(s => {
        const id = s.shardId ?? s.shard_id
        const h = s.maxHeight ?? s.max_height ?? 0
        const prev = prevShardRef.current[id]
        if (prev) {
          const elapsed = (now - prev.time) / 1000
          newSpeeds[id] = elapsed > 0 ? Math.max(0, (h - prev.height) / elapsed) : 0
        }
        newPrev[id] = { height: h, time: now }
      })
      prevShardRef.current = newPrev
      setSpeeds(newSpeeds)
      if (peersRes.status === 'fulfilled' && peersRes.value.ok) {
        const p = await peersRes.value.json()
        const count = Array.isArray(p) ? p.length : Array.isArray(p?.peers) ? p.peers.length : null
        setPeers(count)
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
    setSpeeds({})
    prevShardRef.current = {}
    setError(null)
    clearInterval(timerRef.current)
  }

  const shards = data?.shardInfos ?? data?.shard_infos ?? []
  const peerDisplay = peers ?? data?.numPeers ?? data?.num_peers ?? '—'
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

              <div className="shards-list">
                {shards.map(s => (
                  <ShardCard key={s.shardId ?? s.shard_id} shard={s} speed={speeds[s.shardId ?? s.shard_id]} />
                ))}
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
