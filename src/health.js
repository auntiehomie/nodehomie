export const EXPECTED_SHARDS = [1, 2]

export function shardId(shard) {
  return Number(shard.shardId ?? shard.shard_id)
}

export function shardLag(shard) {
  const value = shard.blockDelay ?? shard.block_delay
  if (value === null || value === undefined || value === '') return null
  const lag = Number(value)
  return Number.isFinite(lag) && lag >= 0 ? lag : null
}

export function shardHeight(shard) {
  const value = shard.maxHeight ?? shard.max_height
  if (value === null || value === undefined || value === '') return null
  const height = Number(value)
  return Number.isFinite(height) && height >= 0 ? height : null
}

export function nodeMessageCount(info) {
  const stats = info?.dbStats ?? info?.db_stats
  const value = stats?.numMessages ?? stats?.num_messages
  if (value === null || value === undefined || value === '') return null
  const count = Number(value)
  return Number.isFinite(count) && count >= 0 ? count : null
}

export function nodeDatabaseSize(info) {
  const stats = info?.dbStats ?? info?.db_stats
  const value = stats?.approxSize ?? stats?.approx_size
  if (value === null || value === undefined || value === '') return null
  const size = Number(value)
  return Number.isFinite(size) && size >= 0 ? size : null
}

export function appendStorageSample(samples, size, sampledAt, options = {}) {
  const maxAgeMs = options.maxAgeMs ?? 7 * 24 * 60 * 60 * 1000
  const minIntervalMs = options.minIntervalMs ?? 5 * 60 * 1000
  if (!Number.isFinite(size) || size < 0 || !Number.isFinite(sampledAt)) return samples ?? []

  const cutoff = sampledAt - maxAgeMs
  const valid = (Array.isArray(samples) ? samples : [])
    .filter(sample => Number.isFinite(sample?.size) && Number.isFinite(sample?.sampledAt) && sample.sampledAt >= cutoff && sample.sampledAt <= sampledAt)
    .sort((a, b) => a.sampledAt - b.sampledAt)
  const last = valid.at(-1)
  if (last && sampledAt - last.sampledAt < minIntervalMs) {
    return valid
  }
  return [...valid, { size, sampledAt }]
}

export function calculateStorageRunway(samples, freeBytes) {
  const valid = (Array.isArray(samples) ? samples : [])
    .filter(sample => Number.isFinite(sample?.size) && sample.size >= 0 && Number.isFinite(sample?.sampledAt))
    .sort((a, b) => a.sampledAt - b.sampledAt)
  const latest = valid.at(-1)
  if (!latest) return null

  const first = valid[0]
  const elapsedMs = latest.sampledAt - first.sampledAt
  const growth = latest.size - first.size
  const enoughHistory = elapsedMs >= 15 * 60 * 1000
  const growthPerDay = enoughHistory && growth > 0 ? growth / (elapsedMs / (24 * 60 * 60 * 1000)) : null
  const usableFreeBytes = Number.isFinite(freeBytes) && freeBytes >= 0 ? freeBytes : null
  const daysRemaining = growthPerDay && usableFreeBytes !== null ? usableFreeBytes / growthPerDay : null

  return {
    size: latest.size,
    freeBytes: usableFreeBytes,
    growthPerDay,
    daysRemaining,
    sampleSpanMs: elapsedMs,
  }
}

export function protocolUpgradeStatus(timestamp, now = Date.now()) {
  const raw = Number(timestamp)
  if (!Number.isFinite(raw) || raw <= 0) return { scheduled: false, urgency: 'none' }
  const scheduledAt = raw < 1e12 ? raw * 1000 : raw
  const remainingMs = scheduledAt - now
  const dayMs = 24 * 60 * 60 * 1000
  return {
    scheduled: true,
    scheduledAt,
    remainingMs,
    daysRemaining: remainingMs / dayMs,
    urgency: remainingMs <= 0 ? 'overdue' : remainingMs <= 7 * dayMs ? 'soon' : 'scheduled',
  }
}

function peerIdentifier(peer) {
  return peer?.peer_id ?? peer?.peerId ?? peer?.id ?? null
}

export function summarizePeerStability(peers, previousPeerIds = []) {
  const list = Array.isArray(peers) ? peers : []
  const ids = [...new Set(list.map(peerIdentifier).filter(Boolean))]
  const previous = new Set(Array.isArray(previousPeerIds) ? previousPeerIds : [])
  const current = new Set(ids)
  const gained = ids.filter(id => !previous.has(id))
  const lost = [...previous].filter(id => !current.has(id))
  const sources = { collected: 0, derived: 0, unknown: 0 }
  const versions = {}

  for (const peer of list) {
    const source = String(peer?.source ?? 'unknown').toLowerCase()
    if (source === 'collected' || source === 'derived') sources[source] += 1
    else sources.unknown += 1
    const version = peer?.contact_info?.snapchain_version ?? peer?.contactInfo?.snapchainVersion
    if (version) versions[version] = (versions[version] ?? 0) + 1
  }

  return { ids, gained, lost, sources, versions }
}

export function sampleMessageActivity(previous, total, sampledAt) {
  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(sampledAt)) return null
  if (!previous || !Number.isFinite(previous.total) || !Number.isFinite(previous.sampledAt)) {
    return { total, delta: null, perSecond: null, sampledAt }
  }
  const elapsedSeconds = (sampledAt - previous.sampledAt) / 1000
  if (elapsedSeconds <= 0 || total < previous.total) {
    return { total, delta: null, perSecond: null, sampledAt }
  }
  const delta = total - previous.total
  return { total, delta, perSecond: delta / elapsedSeconds, sampledAt }
}

export function classifyShard(shard, trend = {}) {
  const lag = shardLag(shard)
  if (lag === null) return { status: 'unknown', label: 'telemetry unavailable' }
  if (lag < 60) return { status: 'synced', label: 'synced' }
  if (trend.stalled) return { status: 'stalled', label: 'no progress recently' }
  return { status: 'syncing', label: trend.advancing ? 'catching up' : 'measuring progress' }
}

export function summarizeShards(shards, trends = {}) {
  const byId = new Map(shards.map(shard => [shardId(shard), shard]))
  return EXPECTED_SHARDS.map(id => {
    const shard = byId.get(id)
    return shard ? { id, shard, ...classifyShard(shard, trends[id]) } : { id, shard: null, status: 'missing', label: 'not reported' }
  })
}
