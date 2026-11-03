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
