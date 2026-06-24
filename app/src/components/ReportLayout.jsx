import { forwardRef } from 'react'
import { colorForIndex } from '../lib/poi.js'

// Off-screen, A4-proportioned report used as the PDF source.
// Together AI design language (see report.css). Page 1 = cover,
// page 2 = official facts + planning + Country references + citations.
const today = new Date().toLocaleDateString('en-AU', {
  day: 'numeric', month: 'long', year: 'numeric',
})

const MAPBOX_ATTRIB = '© Mapbox  © OpenStreetMap  Improve this map. Basemap © Mapbox & OpenStreetMap contributors.'

const ReportLayout = forwardRef(function ReportLayout(
  { site, citations, mapImage, nearbyPlaces, nearbyMapImage, radiusM },
  ref
) {
  const official = site.fields.official.filter((f) => f.kind !== 'loading')
  const planning = site.fields.planning.filter((f) => f.kind !== 'loading')
  const country = site.fields.country.filter((f) => f.kind !== 'loading')
  const environment = site.fields.environment.filter((f) => f.kind !== 'loading')

  return (
    <div className="report-root" ref={ref}>
      {/* ── Cover — always exactly one page; exportPdf.js never paginates this ── */}
      <section className="report-page report-cover" data-page="cover">
        <div>
          <div className="cover-band" />
          <div className="cover-eyebrow">Site Research</div>
          <h1>{site.name}</h1>
          <div className="cover-sub">{site.address}</div>
          {mapImage && (
            <div className="cover-map">
              <img src={mapImage} alt="Site location map" />
              <div className="cover-map-attrib">{MAPBOX_ATTRIB}</div>
            </div>
          )}
        </div>
        <div>
          <div className="cover-meta">
            <div><div className="k">State</div><div className="v">New South Wales</div></div>
            <div><div className="k">LGA</div><div className="v">{site.lgaName || '—'}</div></div>
            <div><div className="k">Prepared</div><div className="v">{today}</div></div>
            <div><div className="k">Status</div><div className="v">Draft · research aid</div></div>
          </div>
          <p className="cover-foot" style={{ marginTop: 24 }}>
            A research aid for architecture students. Indigenous boundaries shown or
            referenced are approximate and contested — not ownership lines. This document
            does not replace local engagement or consultation with Traditional Custodians.
          </p>
        </div>
        <div className="report-foot">
          <span>Country · Site Research</span>
          <span>Page 1</span>
        </div>
      </section>

      {/* ── Content — exportPdf.js splits these children across as many pages
          as needed, breaking only between elements, never inside one. ── */}
      <section className="report-page" data-page="content">
        <h2>Site facts</h2>
        <div className="report-grid">
          {official.map((f, i) => (
            <Field key={i} f={f} />
          ))}
        </div>

        <h2>Planning controls</h2>
        <div className="report-grid">
          {planning.map((f, i) => (
            <Field key={i} f={f} />
          ))}
        </div>

        <h2>Country context</h2>
        {site.lalc?.localCouncil && (
          <div className="report-banner">
            Next steps — who to contact: {site.lalc.localCouncil} Local Aboriginal Land Council
            {site.lalc.regionalCouncil ? ` (${site.lalc.regionalCouncil} region)` : ''}. See the
            Aboriginal Land Council of NSW directory at alc.org.au/lalc.
          </div>
        )}
        {country.map((f, i) => (
          <div className="report-field" key={i}>
            <div className="rf-label">{f.label}</div>
            <div className={`rf-value ${f.kind === 'na' || f.kind === 'link' ? 'muted' : ''}`}>{f.value}</div>
            {f.note && <div className="rf-note">{f.note}</div>}
            {f.source && <div className="rf-source">Source: {f.source}</div>}
            {f.links && (
              <div className="rf-source">{f.links.map((l) => l.text + ' — ' + l.url).join('  ·  ')}</div>
            )}
          </div>
        ))}

        <h2>Environment</h2>
        <div className="report-grid">
          {environment.map((f, i) => (
            <Field key={i} f={f} />
          ))}
        </div>

        {nearbyMapImage && nearbyPlaces?.length > 0 && (() => {
          const MAX_KEY_ROWS = 20 // keeps this block within one page; pins on the map cover all of them
          const shownPlaces = nearbyPlaces.slice(0, MAX_KEY_ROWS)
          const hiddenCount = nearbyPlaces.length - shownPlaces.length
          return (
            <>
              <h2>Nearby places · {radiusM}m radius</h2>
              <div className="report-nearby">
                <div className="report-nearby-map">
                  <img src={nearbyMapImage} alt={`Places within ${radiusM}m of the site`} />
                </div>
                <ol className="report-nearby-key">
                  {shownPlaces.map((p, i) => (
                    <li key={`${p.name}-${i}`}>
                      <span className="key-swatch" style={{ background: colorForIndex(i) }} />
                      <span className="key-text">
                        <strong>{p.name}</strong>
                        <span className="key-meta">{p.category} · {p.distanceM}m</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="report-nearby-note">
                {hiddenCount > 0 ? `+${hiddenCount} more in this radius — see the Nearby tab in-app. ` : ''}
                Source: Mapbox places data — general-purpose mapping data, not an official NSW
                register. Aboriginal cultural/heritage sites are deliberately not shown here.
              </div>
            </>
          )
        })()}

        <h2>Sources &amp; citations</h2>
        <ol className="report-citations">
          {citations.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
          <li>{MAPBOX_ATTRIB}</li>
        </ol>
      </section>
    </div>
  )
})

function Field({ f }) {
  return (
    <div className="report-field">
      <div className="rf-label">{f.label}</div>
      <div className={`rf-value ${f.kind === 'na' || f.kind === 'link' ? 'muted' : ''}`}>{f.value}</div>
      {f.note && <div className="rf-note">{f.note}</div>}
      {f.source && <div className="rf-source">Source: {f.source}</div>}
      {f.links && (
        <div className="rf-source">{f.links.map((l) => l.text + ' — ' + l.url).join('  ·  ')}</div>
      )}
    </div>
  )
}

export default ReportLayout
