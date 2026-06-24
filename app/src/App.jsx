import { useCallback, useRef, useState } from 'react'
import MapView from './components/MapView.jsx'
import SearchBar from './components/SearchBar.jsx'
import NorthArrow from './components/NorthArrow.jsx'
import DetailPanel from './components/DetailPanel.jsx'
import ReportLayout from './components/ReportLayout.jsx'
import { useSiteFacts } from './hooks/useSiteFacts.js'
import { useParcelFacts } from './hooks/useParcelFacts.js'
import { useNearbyPlaces } from './hooks/useNearbyPlaces.js'
import { lotAtPoint } from './lib/nsw/cadastre.js'
import { featureCollection, mergePolygons, centerOf, formatArea, circlePolygon } from './lib/geo.js'
import { colorForIndex } from './lib/poi.js'
import { exportReportPdf } from './lib/exportPdf.js'
import { captureSiteMap, captureNearbyMap } from './lib/exportMap.js'

const MAX_PARCELS = 3

export default function App() {
  const [styleKey, setStyleKey] = useState('streets')
  const [collapsed, setCollapsed] = useState(false)
  const [flyTarget, setFlyTarget] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [mapImage, setMapImage] = useState(null)
  const [nearbyMapImage, setNearbyMapImage] = useState(null)

  const [parcels, setParcels] = useState([]) // selected Lot records
  const [multiMode, setMultiMode] = useState(false)
  const [confirmed, setConfirmed] = useState(null)
  const [picking, setPicking] = useState(false)
  const [pickError, setPickError] = useState(null)
  const [radiusM, setRadiusM] = useState(200)
  const [tab, setTab] = useState('official')
  const [bucketFilter, setBucketFilter] = useState('All')

  const mapRef = useRef(null)
  const reportRef = useRef(null)

  const siteRaw = useSiteFacts(confirmed)
  const parcelFacts = useParcelFacts(parcels)
  const site = applyParcelFacts(siteRaw, parcelFacts)
  const nearby = useNearbyPlaces(confirmed?.center, radiusM)

  const handleMapReady = useCallback((map) => { mapRef.current = map }, [])

  function handlePick(result) {
    setFlyTarget({ lngLat: result.center, ts: Date.now(), zoom: 17 })
  }

  // Build the confirmed extent from a set of parcels.
  function confirmFrom(nextParcels) {
    if (nextParcels.length === 0) {
      setConfirmed(null) // deselected everything — back to empty state
      return
    }
    const geometry = mergePolygons(nextParcels.map((p) => p.geometry))
    const center = centerOf(geometry) || fallbackPoint
    const totalArea = nextParcels.reduce((s, p) => s + (p.areaM2 || 0), 0)
    const parcel =
      nextParcels.length === 1
        ? nextParcels[0]
        : { id: `${nextParcels.length} parcels`, areaM2: totalArea, geometry, multiple: true }
    setConfirmed({ center, parcel, approximate: false })
  }

  async function handleMapClick(lngLat) {
    setPicking(true)
    setPickError(null)
    try {
      const lot = await lotAtPoint(lngLat)
      if (!lot) {
        // No parcel here — offer an approximate extent at the clicked point.
        setParcels([])
        setConfirmed({ center: lngLat, parcel: null, approximate: true })
        setPickError('No cadastral parcel at that point — using an approximate location.')
        return
      }
      let next
      if (multiMode) {
        if (parcels.some((p) => p.id === lot.id)) {
          next = parcels.filter((p) => p.id !== lot.id)
        } else if (parcels.length >= MAX_PARCELS) {
          setPickError(`You can select up to ${MAX_PARCELS} adjoining parcels — clear one first.`)
          return
        } else {
          next = [...parcels, lot]
        }
      } else {
        next = [lot]
      }
      setParcels(next)
      confirmFrom(next)
    } catch (err) {
      setPickError('Parcel lookup failed — the NSW service may be busy. Try again.')
    } finally {
      setPicking(false)
    }
  }

  function clearSite() {
    setParcels([])
    setConfirmed(null)
    setPickError(null)
  }

  function resetNorth() {
    const map = mapRef.current
    if (map) map.easeTo({ bearing: 0, pitch: 0 })
  }

  async function handleExport() {
    if (!site || site.status !== 'ready') return
    setExporting(true)
    try {
      // Render the cover plan on a dedicated, fixed-size, always-flat,
      // north-up offscreen map — never the live map, which varies by screen
      // size, pan/zoom, tilt, and basemap style. Every export gets the same
      // landscape frame, the same orthographic camera, and the site boundary
      // fit-to-bounds with a consistent margin.
      const mapDataUrl = await captureSiteMap({ geometry: site.geometry, center: site.center })
      setMapImage(mapDataUrl)

      // Same idea for the Nearby section — a fresh fixed-frame capture of
      // the radius ring + pins, independent of whatever tab/zoom is live.
      if (nearby.places.length > 0 && confirmed?.center) {
        const nearbyDataUrl = await captureNearbyMap({ center: confirmed.center, radiusM, places: nearby.places })
        setNearbyMapImage(nearbyDataUrl)
      } else {
        setNearbyMapImage(null)
      }

      await new Promise((r) => setTimeout(r, 150)) // let report DOM paint the snapshots
      // Prefer the resolved address for the filename; fall back to locality
      // when no AddressPoint matched (site.name is then a status sentence).
      const base = site.name && !/not available/i.test(site.name) ? site.name : site.address || 'country-site-brief'
      const fname = base.replace(/[^\w\-]+/g, '-').toLowerCase()
      await exportReportPdf(reportRef.current, `${fname}.pdf`)
    } finally {
      setExporting(false)
    }
  }

  const parcelData = featureCollection(parcels.map((p) => p.geometry))
  const totalAreaLabel = parcels.length
    ? formatArea(parcels.reduce((s, p) => s + (p.areaM2 || 0), 0))
    : null

  // The radius ring + pins are Nearby-tab-specific context — they shouldn't
  // clutter the map while looking at Official/Country/Environment facts.
  const showNearbyOverlay = tab === 'nearby'
  const nearbyCircle = showNearbyOverlay && confirmed?.center ? circlePolygon(confirmed.center, radiusM) : null
  const nearbyPoints = showNearbyOverlay
    ? {
        type: 'FeatureCollection',
        features: nearby.places
          .map((p, i) => ({ ...p, i })) // colour is tied to position in the FULL list, never the filtered one
          .filter((p) => p.center && (bucketFilter === 'All' || p.bucket === bucketFilter))
          .map((p) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: p.center },
            properties: { name: p.name, color: colorForIndex(p.i) },
          })),
      }
    : null

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="wordmark">
          <span className="ribbon" />
          <span className="mark">Site Analysis Research</span>
          <span className="eyebrow" style={{ color: 'var(--body-muted)' }}>Site research · NSW</span>
        </div>
        <div className="spacer" />
        <button className="btn-ghost-dark" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? 'Show panel' : 'Hide panel'}
        </button>
        <button className="btn-primary" onClick={handleExport} disabled={exporting || site?.status !== 'ready'}>
          {exporting ? 'Preparing…' : 'Export report'}
        </button>
      </header>

      <div className="workspace">
        <div className="map-region">
          <MapView
            styleKey={styleKey}
            onMapReady={handleMapReady}
            onParcelClick={handleMapClick}
            flyTarget={flyTarget}
            parcelData={parcelData}
            marker={confirmed?.approximate ? confirmed.center : null}
            picking={picking}
            nearbyCircle={nearbyCircle}
            nearbyPoints={nearbyPoints}
          />

          <SearchBar onPick={handlePick} />

          <div className="map-tools">
            <div className="style-toggle">
              <button className={styleKey === 'streets' ? 'active' : ''} onClick={() => setStyleKey('streets')}>Map</button>
              <button className={styleKey === 'satellite' ? 'active' : ''} onClick={() => setStyleKey('satellite')}>Satellite</button>
            </div>
            <NorthArrow onReset={resetNorth} />
          </div>

          <div className="select-bar">
            <label className={`multi-toggle ${multiMode ? 'on' : ''}`}>
              <input type="checkbox" checked={multiMode} onChange={(e) => setMultiMode(e.target.checked)} />
              Add adjoining parcels
            </label>
            {parcels.length > 0 && (
              <span className="select-summary">
                {parcels.length} parcel{parcels.length > 1 ? 's' : ''}{totalAreaLabel ? ` · ${totalAreaLabel}` : ''}
                <button className="link-btn" onClick={clearSite}>Clear</button>
              </span>
            )}
            {picking && <span className="select-summary">Looking up parcel…</span>}
            {pickError && <span className="select-error">{pickError}</span>}
          </div>

          {collapsed && (
            <button className="panel-handle" onClick={() => setCollapsed(false)} title="Show panel">‹</button>
          )}
        </div>

        <DetailPanel
          site={site}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          onExport={handleExport}
          exporting={exporting}
          nearby={nearby}
          radiusM={radiusM}
          onRadiusChange={setRadiusM}
          tab={tab}
          onTabChange={setTab}
          bucketFilter={bucketFilter}
          onBucketChange={setBucketFilter}
        />
      </div>

      {site && (
        <ReportLayout
          ref={reportRef}
          site={site}
          citations={site.citations}
          mapImage={mapImage}
          nearbyPlaces={nearby.places}
          nearbyMapImage={nearbyMapImage}
          radiusM={radiusM}
        />
      )}
    </div>
  )
}

// Stack address/zoning/height/FSR across multiple selected parcels, in pick
// order. Address always stacks (every parcel has its own); zoning/height/FSR
// only stack when they actually differ — otherwise the merged single-point
// value from useSiteFacts already reads correctly.
function applyParcelFacts(site, parcelFacts) {
  if (!site || parcelFacts.status !== 'ready' || parcelFacts.items.length < 2) return site
  const items = parcelFacts.items

  const allSame = (key) => items.every((it) => it[key] === items[0][key])
  const stacked = (key) => items.map((it, i) => `Parcel ${i + 1}: ${it[key] || 'Not available'}`).join('\n')

  const official = site.fields.official.map((f) =>
    f.label === 'Address' ? { ...f, value: stacked('address'), kind: items.some((it) => it.address) ? f.kind : 'na' } : f
  )

  const planning = site.fields.planning.map((f) => {
    if (f.label === 'Zoning' && !allSame('zoning')) return { ...f, value: stacked('zoning') }
    if (f.label === 'Height of building' && !allSame('height')) return { ...f, value: stacked('height') }
    if (f.label === 'Floor space ratio' && !allSame('fsr')) return { ...f, value: stacked('fsr') }
    return f
  })

  return { ...site, fields: { ...site.fields, official, planning } }
}
