import { useState } from 'react'
import { addressesDiffer, hostIndex, lookupHost, sortedEntries } from './meshAddresses.js'

const shortId = id => (id && id.length > 8 ? '…' + id.slice(-8) : id)

function MeshLogin({ status, onSave, hasCredentials }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  return <form className="mesh-login" onSubmit={event => { event.preventDefault(); onSave(user, pass); setPass('') }}>
    <p>
      {status === 'unauthorized'
        ? (hasCredentials ? 'Your node rejected these admin credentials. Check them and try again.' : 'Your node keeps mesh data behind its admin login. Enter it to load addresses.')
        : 'Admin login for the mesh endpoint (only needed if your node uses admin auth).'}
      {' '}Kept in this browser tab only.
    </p>
    <input aria-label="Admin username" placeholder="username" autoComplete="username" value={user} onChange={e => setUser(e.target.value)} />
    <input aria-label="Admin password" placeholder="password" type="password" autoComplete="current-password" value={pass} onChange={e => setPass(e.target.value)} />
    <button type="submit" className="btn-refresh">Save</button>
    {hasCredentials && <button type="button" className="btn-refresh" onClick={() => onSave('', '')}>Clear</button>}
  </form>
}

export function MeshAddresses({ book, status, crawledAt, onCrawl, crawling, hasCredentials, onSaveCredentials }) {
  const [query, setQuery] = useState('')
  const entries = sortedEntries(book)
  const lookup = query.trim() ? lookupHost(hostIndex(book), query) : null
  const withAddress = entries.filter(entry => entry.advertised).length

  return <section className="peers-panel mesh-addresses" aria-labelledby="mesh-addresses-title">
    <div className="peers-panel-header">
      <h2 id="mesh-addresses-title">Mesh addresses</h2>
      <span className="peer-count">{status === 'ok' ? `${withAddress} of ${entries.length} advertised` : status === 'unauthorized' ? 'Login needed' : status === 'loading' ? 'Loading…' : 'Unavailable'}</span>
    </div>
    <p className="peer-empty">
      The address each node advertises for itself, like the Snapchain mesh view. Validators only reveal theirs through a mesh crawl, so it may say "not advertised" until the crawl finishes.
    </p>

    {status === 'unavailable' && <p className="peer-empty">The node's <code>/v1/mesh</code> endpoint did not answer. Older versions or a proxy in front of the node can hide it.</p>}
    {(status === 'unauthorized' || hasCredentials) && <MeshLogin status={status} hasCredentials={hasCredentials} onSave={onSaveCredentials} />}

    <label className="mesh-lookup">
      <span>Who is this IP?</span>
      <input placeholder="e.g. 45.157.179.78" value={query} onChange={e => setQuery(e.target.value)} />
    </label>
    {lookup && <p className="mesh-lookup-result">
      {lookup.matches.length
        ? lookup.matches.map(match => `${match.name ?? shortId(match.peerId)} (${match.kind})`).join(', ')
        : `${lookup.host} isn't in the current mesh data. It may be a node your node hasn't met, or one that hasn't advertised yet.`}
    </p>}

    {entries.length > 0 && <ul className="peer-list">
      {entries.map(entry => <li className="peer-row" key={entry.peerId}>
        <strong>{entry.name ?? 'Unidentified peer'}{entry.isValidator ? ' · Validator' : ''}</strong>
        <span className="peer-meta">
          <span className="peer-source">{entry.connected ? 'connected' : entry.unreachable ? entry.unreachable.replace(/_/g, ' ') : 'not connected'}</span>
          {entry.advertised
            ? <span className="peer-address" title={`Advertised (${entry.advertisedFrom})`}>advertised {entry.advertised.text}</span>
            : <span className="peer-address">not advertised</span>}
          {addressesDiffer(entry) && <span className="peer-address" title="Where this node sees the connection coming from">seen as {entry.observed.text}</span>}
        </span>
        <details><summary>Peer ID</summary><code style={{ overflowWrap: 'anywhere', userSelect: 'all' }}>{entry.peerId}</code></details>
      </li>)}
    </ul>}

    <div className="footer-row">
      <span className="last-updated">{crawledAt ? `Crawled ${crawledAt.toLocaleTimeString()}` : 'Not crawled yet'}</span>
      <button className="btn-refresh" onClick={onCrawl} disabled={crawling}>{crawling ? 'Crawling…' : 'Crawl mesh'}</button>
    </div>
  </section>
}
