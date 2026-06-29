import SunPathDiagram from './SunPathDiagram.jsx'
import ClimateSection from './ClimateSection.jsx'

const DATE_OPTIONS = [
  { key: 'summer', label: 'Summer solstice' },
  { key: 'winter', label: 'Winter solstice' },
  { key: 'equinox', label: 'Equinox' },
  { key: 'live', label: 'Live' },
  { key: 'year', label: 'Whole year' },
]

export default function SunPathClimatePanel({ sunPath, center }) {
  const {
    dateKey, setDateKey,
    scrubMinutes, setScrubMinutes,
    effectiveMinutes, scrubBounds,
    summerArc, winterArc, equinoxArc,
    current, showScrubber,
  } = sunPath

  return (
    <section className="panel-section">
      <span className="eyebrow">Sun path &amp; climate</span>

      <div className="bucket-toggle" role="group" aria-label="Date selection">
        {DATE_OPTIONS.map((d) => (
          <button
            key={d.key}
            className={dateKey === d.key ? 'active' : ''}
            onClick={() => setDateKey(d.key)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {showScrubber && (
        <div className="radius-slider">
          <input
            type="range"
            min={scrubBounds.min}
            max={scrubBounds.max}
            step={5}
            value={effectiveMinutes}
            onChange={(e) => setScrubMinutes(Number(e.target.value))}
            disabled={dateKey === 'live'}
            aria-label="Time of day"
          />
          <span className="radius-readout">{formatTime(effectiveMinutes)}</span>
        </div>
      )}

      <SunPathDiagram
        summerArc={summerArc}
        winterArc={winterArc}
        equinoxArc={equinoxArc}
        current={current}
        mode={dateKey}
      />

      <div className="legend-row" style={{ display: 'flex', gap: 'var(--s-md)', fontSize: '11px', color: 'var(--body-muted)', marginTop: 'var(--s-sm)' }}>
        <span><i style={swatchStyle('#BA7517')} />Summer solstice</span>
        <span><i style={swatchStyle('#185FA5')} />Winter solstice</span>
        <span><i style={swatchStyle('var(--body-muted)', true)} />Equinox</span>
      </div>

      <div className="section-foot">
        The same sun path is drawn directly on the main map for this site, true north up —
        drag the slider above and the marker moves there too. Switch tabs to clear it.
      </div>

      <div className="eyebrow" style={{ marginTop: 'var(--s-lg)', marginBottom: 'var(--s-md)' }}>Climate</div>
      <ClimateSection center={center} />
    </section>
  )
}

function swatchStyle(color, dashed) {
  return {
    display: 'inline-block',
    width: 10,
    height: dashed ? 0 : 2,
    borderBottom: dashed ? `1px dashed ${color}` : 'none',
    background: dashed ? 'none' : color,
    marginRight: 4,
  }
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
