import names from './peerNames.json'

import { peerRole, votingStatus } from './validatorStatus.js'

export function PeerIdentity({ id, meshPeer, evidence }) {
  const name = meshPeer?.name || (Object.hasOwn(names, id) ? names[id] : null)
  const role = peerRole(id, meshPeer, evidence?.shards)
  return <>
    <strong>{name ?? 'Unidentified peer'} · {role}</strong>
    <details><summary>Peer ID</summary><code style={{ overflowWrap: 'anywhere', userSelect: 'all' }}>{id}</code></details>
  </>
}

export function ValidatorEvidence({ self, evidence, stale, publicLookup, sampleError }) {
  return <section className="host-health" aria-label="Validator voting">
    <h2>Validator voting</h2>
    {typeof self?.is_validator === 'boolean' &&
      <p>Node role · {self.is_validator ? 'Validator' : 'Non-validator'}</p>}
    <strong>{votingStatus(evidence?.shards, stale)}</strong>
    {publicLookup && <p><a href="/api/validator-votes" target="_blank" rel="noreferrer">View public voting evidence</a></p>}
    {sampleError && <p>Public RPC unavailable. Refresh to retry.</p>}
    {evidence?.shards?.length ? <>
      <p>{stale ? 'Stale sample' : evidence.source || 'Host helper'} · {new Date(evidence.checked_at * 1000).toLocaleString()}</p>
      {evidence.shards.map(row => <p key={row.id}>
        <strong>Shard {row.id}</strong> · {row.votes?.checked
          ? `Signed ${row.votes.signed} of ${row.votes.checked} sampled commits`
          : 'Certificate evidence unavailable'}
        {row.votes?.last != null && ` · latest signed height ${row.votes.last.toLocaleString()}`}
        {row.delay == null ? ' · tip age unknown' : ` · tip delay ${row.delay}s`}
      </p>)}
    </> : publicLookup ? (!sampleError && <p>Checking recent commits through your public RPC.</p>) : <p>To collect signed commits, install or update the host helper under Setup Guide → Monitoring.</p>}
  </section>
}
