import SiteCard from './SiteCard.jsx'
import { colorForIndex } from '../lib/poi.js'
import SunPathClimatePanel from './SunPathClimatePanel.jsx'

const TABS = [
  { key: 'official', label: 'Official' },
  { key: 'country', label: 'Country' },
  { key: 'environment', label: 'Environment' },
  { key: 'nearby', label: 'Nearby' },
  { key: 'sunpath', label: 'Sun & climate' },
]

const RADIUS_MIN = 100
const RADIUS_MAX = 200
const RADIUS_STEP = 10

export default function DetailPanel({
  site, collapsed, onToggle, onExport, exporting, nearby, radiusM, onRadiusChange, tab, onTabChange,
  bucketFilter, onBucketChange, sunPath,
}) {
  return (
    <aside className={`panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="panel-head">
        <button className="collapse-btn" onClick={onToggle} aria-label="Collapse panel" title="Collapse">✕</button>
        <div className="eyebrow">Site brief · NSW</div>
        <h1 className="site-title">{site ? site.name : 'Find a site to begin'}</h1>
        <div className="site-sub">
          {site ? site.address : 'Search, then click a parcel on the map.'}
        </div>

        {site && (
          <div className="panel-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                className={tab === t.key ? 'active' : ''}
                onClick={() => onTabChange(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="panel-body">
        {!site ? (
          <EmptyState />
        ) : (
          <>
            {tab === 'country' && (
              <div className="safety-banner">
                <strong>Indigenous boundaries are approximate and contested — not ownership lines.</strong>{' '}
                This tool surfaces public information and links to sources. It does not replace
                local engagement or consultation with Traditional Custodians.
              </div>
            )}

            {tab === 'official' && (
              <>
                <Section title="Official facts" fields={site.fields.official} />
                <Section title="Planning controls" fields={site.fields.planning} />
              </>
            )}

            {tab === 'country' && (
              <Section
                title="Country context · references"
                fields={site.fields.country}
                footnote={
                  site.referencesReviewed
                    ? `Curated references last reviewed ${site.referencesReviewed}.`
                    : null
                }
              />
            )}

            {tab === 'environment' && <Section title="Environment" fields={site.fields.environment} />}

            {tab === 'nearby' && (
              <NearbySection
                nearby={nearby}
                radiusM={radiusM}
                onRadiusChange={onRadiusChange}
                bucketFilter={bucketFilter}
                onBucketChange={onBucketChange}
              />
            )}

            {tab === 'sunpath' && <SunPathClimatePanel sunPath={sunPath} center={site.center} />}

            <SourceList citations={site.citations} tab={tab} />

            <button
              className="btn-primary"
              style={{ width: '100%', marginTop: 'var(--s-lg)' }}
              onClick={onExport}
              disabled={exporting || site.status !== 'ready'}
            >
              {exporting ? 'Preparing report…' : 'Export PDF report'}
            </button>
          </>
        )}
      </div>
    </aside>
  )
}

function Section({ title, fields, footnote }) {
  if (!fields || fields.length === 0) return null
  return (
    <section className="panel-section">
      <span className="eyebrow">{title}</span>
      {fields.map((f, i) => (
        <SiteCard key={`${f.label}-${i}`} field={f} />
      ))}
      {footnote && <div className="section-foot">{footnote}</div>}
    </section>
  )
}

function NearbySection({ nearby, radiusM, onRadiusChange, bucketFilter, onBucketChange }) {
  // Colour is tied to a place's position in the full, unfiltered list — so a
  // pin and its card stay the same colour no matter which bucket is active.
  const indexed = nearby.places.map((p, i) => ({ ...p, i }))
  const presentBuckets = ['All', ...new Set(indexed.map((p) => p.bucket))]
  const shown = bucketFilter === 'All' ? indexed : indexed.filter((p) => p.bucket === bucketFilter)

  return (
    <section className="panel-section">
      <span className="eyebrow">Nearby places</span>
      <div className="radius-slider">
        <input
          type="range"
          min={RADIUS_MIN}
          max={RADIUS_MAX}
          step={RADIUS_STEP}
          value={radiusM}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          aria-label="Search radius"
        />
        <span className="radius-readout">{radiusM}m</span>
      </div>

      {nearby.places.length > 0 && (
        <div className="bucket-toggle">
          {presentBuckets.map((b) => (
            <button key={b} className={bucketFilter === b ? 'active' : ''} onClick={() => onBucketChange(b)}>
              {b}
            </button>
          ))}
        </div>
      )}

      {nearby.status === 'loading' && <div className="section-foot">Looking up nearby places…</div>}
      {nearby.status === 'error' && (
        <div className="section-foot">Nearby places lookup failed — try again shortly.</div>
      )}
      {nearby.status === 'ready' && nearby.places.length === 0 && (
        <div className="section-foot">No named places found within {radiusM}m.</div>
      )}
      {nearby.status === 'ready' && nearby.places.length > 0 && shown.length === 0 && (
        <div className="section-foot">No {bucketFilter.toLowerCase()} places within {radiusM}m.</div>
      )}

      {shown.map((p) => (
        <div className="nearby-card" key={`${p.name}-${p.i}`}>
          <span className="nearby-swatch" style={{ background: colorForIndex(p.i) }} aria-hidden="true" />
          <div>
            <div className="value">{p.name}</div>
            <div className="label">{p.category} · {p.distanceM}m away</div>
          </div>
        </div>
      ))}

      {nearby.places.length > 0 && (
        <div className="section-foot">
          Source: Mapbox places data — approximate, general-purpose mapping data, not an
          official NSW register. Aboriginal cultural/heritage sites are deliberately not
          shown here — see the Country tab.
        </div>
      )}
    </section>
  )
}

function SourceList({ citations, tab }) {
  const shown = (citations || []).filter((c) => c.tabs.includes(tab))
  if (shown.length === 0) return null
  return (
    <section className="panel-section">
      <span className="eyebrow">Sources &amp; citations</span>
      <ol className="source-list">
        {shown.map((c, i) => (
          <li key={i}>{c.text}</li>
        ))}
      </ol>
    </section>
  )
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="eyebrow" style={{ marginBottom: 'var(--s-md)' }}>No site selected</div>
      <p className="empty-note">
        Search for an address, suburb or postcode — or paste coordinates — to fly the map there.
        Then click a cadastral parcel to confirm your site. The panel will fill with official NSW
        facts and curated Country references, each marked with where it came from.
      </p>
      <ul className="empty-legend">
        <li><span className="chip official">Official</span> live from a public NSW or biodiversity database</li>
        <li><span className="chip curated">Curated ref</span> human-maintained reference</li>
        <li><span className="chip link">Link only</span> a pointer to follow up</li>
        <li><span className="chip na">Not available</span> nothing verified here</li>
      </ul>
    </div>
  )
}
