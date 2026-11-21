import { consensusId } from './validatorRoster.js'

export function peerRole(id, meshPeer, shards = []) {
  const signerId = consensusId(meshPeer?.consensus_public_key)
  const active = shards.filter(row => row.active?.includes(id) || (signerId && row.active?.includes(signerId))).map(row => row.id)
  if (active.length) return 'Validator · shards ' + active.join(', ')
  if (meshPeer?.node_type === 'validator') return 'Validator'
  if (meshPeer?.node_type === 'non-val') return 'Mesh reports non-validator'
  if (shards.length && shards.every(row => Array.isArray(row.active))) return 'Outside sampled validator sets'
  return 'Role unknown'
}

export function votingStatus(shards = [], stale = false) {
  if (stale && shards.length) return 'Last sample is stale'
  const checked = shards.filter(row => row.votes?.checked > 0)
  const signed = checked.filter(row => row.votes.signed > 0)
  if (signed.some(row => Number.isFinite(row.delay) && row.delay >= 0 && row.delay <= 30)) {
    return 'Voting confirmed in recent commits'
  }
  if (signed.length) return 'Votes confirmed at sampled heights'
  if (checked.length) return 'No signature in sampled commits'
  return 'Awaiting voting evidence'
}
