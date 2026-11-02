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
