import { useState } from 'react'

export default function IncidentTimeline({ events }) {
  const [feedback, setFeedback] = useState('')
  const signing = events?.find(event => event.message.startsWith('Local vote signing') || event.message.startsWith('Local proposal signing'))
  async function copy() {
    const report = events.map(event => [event.time, event.kind, event.message].join(' · ')).join('\n')
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
        <p>Latest {events.length} recorded events. {signing ? `Last observed signing evidence: ${signing.message} at ${new Date(signing.time).toLocaleString()}.` : 'No explicit signing event in these logs.'}</p>
        {events.length > 0 && <button onClick={copy}>Copy incident report</button>}
        <span role="status">{feedback}</span>
        <ol>{events.map((event, index) => <li key={index}>
          <time dateTime={event.time}>{new Date(event.time).toLocaleString()}</time>
          {' · '}<strong>{event.kind}</strong>{' · '}{event.message}
        </li>)}</ol>
      </>}
    </details>
  )
}
