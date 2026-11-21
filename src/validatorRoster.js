import { parse } from 'smol-toml'
import { shardHeight, shardId } from './health.js'

export function consensusId(key) {
  if (!/^[0-9a-f]{64}$/i.test(key ?? '')) return null
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let number = BigInt('0x2408011220' + key)
  let digits = ''
  while (number) {
    digits = alphabet[Number(number % 58n)] + digits
    number /= 58n
  }
  return '1' + digits
}

export function parseRoster(text) {
  return parse(text).consensus.validator_sets.map(set => ({
    height: set.effective_at, shards: set.shard_ids,
    active: set.validator_public_keys.map(consensusId),
  }))
}

export function rosterRows(shards, schedule, localRows = []) {
  return shards.map(shard => {
    const id = shardId(shard)
    const local = localRows.find(row => row.id === id)
    if (Array.isArray(local?.active)) return local
    const height = shardHeight(shard)
    const eligible = schedule.filter(set => height != null && set.height <= height && set.shards.includes(id))
    return { id, active: eligible.sort((a, b) => b.height - a.height)[0]?.active }
  })
}
