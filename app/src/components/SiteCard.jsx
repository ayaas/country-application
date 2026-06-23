import ProvenanceChip from './ProvenanceChip.jsx'

// A single field row, rendered as a card. Facts look like facts;
// pointers look like pointers (muted value + links). Loading shows a skeleton.
export default function SiteCard({ field }) {
  if (field.kind === 'loading') {
    return (
      <div className="site-card">
        <div className="row">
          <div style={{ flex: 1 }}>
            <div className="label">{field.label}</div>
            <div className="skeleton" />
          </div>
          <ProvenanceChip kind="loading" />
        </div>
      </div>
    )
  }

  const muted = field.kind === 'na' || field.kind === 'link'
  return (
    <div className="site-card">
      <div className="row">
        <div>
          <div className="label">{field.label}</div>
          <div className={`value ${muted ? 'muted' : ''}`}>{field.value}</div>
          {field.note && <div className="note">{field.note}</div>}
          {field.source && <div className="src">Source: {field.source}</div>}
        </div>
        <ProvenanceChip kind={field.kind} />
      </div>
      {field.links && field.links.length > 0 && (
        <div className="links">
          {field.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer noopener">
              {l.text} ↗
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
