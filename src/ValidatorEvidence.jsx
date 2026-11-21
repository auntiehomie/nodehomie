import names from './peerNames.json'

export function PeerIdentity({ id, evidence }) {
  const name = Object.hasOwn(names, id) ? names[id] : null
  const shards = evidence?.shards ?? []
  const scheduled = shards.filter(row => row.active?.includes(id)).map(row => row.id)
  let role = 'Role unknown'
  if (scheduled.length) role = 'Validator · shards ' + scheduled.join(', ')
  else if (name && shards.length && shards.every(row => Array.isArray(row.active))) role = 'Outside sampled validator sets'
  return <>
    <strong>{name ?? 'Unidentified peer'} · {role}</strong>
    <details><summary>Peer ID</summary><code style={{ overflowWrap: 'anywhere', userSelect: 'all' }}>{id}</code></details>
  </>
}

export function ValidatorEvidence({ evidence, stale }) {
  return <section className="host-health" aria-label="Validator voting">
    <h2>Validator voting</h2>
    {evidence?.shards?.length ? <>
      <p>{stale ? 'Stale sample' : 'Certificates checked'} · {new Date(evidence.checked_at * 1000).toLocaleString()}</p>
      {evidence.shards.map(row => <p key={row.id}>
        <strong>Shard {row.id}</strong> · {row.votes?.checked
          ? `Signed ${row.votes.signed} of ${row.votes.checked} sampled commits`
          : 'Certificate evidence unavailable'}
        {row.votes?.last != null && ` · latest signed height ${row.votes.last.toLocaleString()}`}
        {row.delay == null ? ' · tip age unknown' : ` · tip delay ${row.delay}s`}
      </p>)}
    </> : <p>Voting evidence unavailable. Check the host monitor setup.</p>}
  </section>
}
