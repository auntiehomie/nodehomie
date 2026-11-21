import { useState } from 'react'

export default function IncidentTimeline({ events }) {
  const [feedback, setFeedback] = useState('')
  const [validatorOnly, setValidatorOnly] = useState(false)
  const visible = validatorOnly ? events?.filter(event =>
    event.kind === 'Consensus' || event.kind === 'Node mode' ||
    (event.kind === 'Recorder' && event.message.startsWith('Read-node mode '))
  ) : events
  const signing = events?.find(event => event.message.startsWith('Local vote signing') || event.message.startsWith('Local proposal signing'))
  async function copy() {
    const report = visible.map(event => [event.time, event.kind, event.message].join(' · ')).join('\n')
    try {
      await navigator.clipboard.writeText(report)
      setFeedback('Report copied')
    } catch {
      setFeedback('Clipboard unavailable. Select the timeline text to copy it.')
    }
  }
  return (
    <details className="host-health">
      <summary>Incident timeline</summary>
      {!Array.isArray(events) ? <p>History unavailable. Check the host monitor and its recorder update in Setup.</p> : <>
        <label><input type="checkbox" checked={validatorOnly} onChange={event => setValidatorOnly(event.target.checked)} /> Validator and read-node logs only</label>
        <p>Showing {visible.length} of {events.length} recorded events. {signing ? `Last observed signing evidence: ${signing.message} at ${new Date(signing.time).toLocaleString()}.` : 'No explicit signing event in these logs.'}</p>
        {visible.length > 0 && <button onClick={copy}>Copy incident report</button>}
        <span role="status">{feedback}</span>
        <ol>{visible.map((event, index) => <li key={index}>
          <time dateTime={event.time}>{new Date(event.time).toLocaleString()}</time>
          {' · '}<strong>{event.kind}</strong>{' · '}{event.message}
        </li>)}</ol>
      </>}
    </details>
  )
}
