import { useCallback, useRef, useState } from 'react'
import MapView from './components/MapView.jsx'
import SearchBar from './components/SearchBar.jsx'
import NorthArrow from './components/NorthArrow.jsx'
import DetailPanel from './components/DetailPanel.jsx'
import ReportLayout from './components/ReportLayout.jsx'
import { useSiteFacts } from './hooks/useSiteFacts.js'
import { lotAtPoint } from './lib/nsw/cadastre.js'
import { featureCollection, mergePolygons, centerOf, formatArea } from './lib/geo.js'
import { exportReportPdf, snapshotMap, waitForIdle } from './lib/exportPdf.js'

export default function App() {
  const [styleKey, setStyleKey] = useState('streets')
  const [collapsed, setCollapsed] = useState(false)
  const [flyTarget, setFlyTarget] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [mapImage, setMapImage] = useState(null)

  const [parcels, setParcels] = useState([]) // selected Lot records
  const [multiMode, setMultiMode] = useState(false)
  const [confirmed, setConfirmed] = useState(null)
  const [picking, setPicking] = useState(false)
  const [pickError, setPickError] = useState(null)

  const mapRef = useRef(null)
  const reportRef = useRef(null)

  const site = useSiteFacts(confirmed)

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
      setParcels((prev) => {
        let next
        if (multiMode) {
          next = prev.some((p) => p.id === lot.id) ? prev.filter((p) => p.id !== lot.id) : [...prev, lot]
        } else {
          next = [lot]
        }
        confirmFrom(next)
        return next
      })
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
      const map = mapRef.current
      if (map) {
        // The cover plan must read as a flat 2D map, regardless of how the
        // user has the live map tilted/rotated — flatten it just for the
        // snapshot, then restore their view.
        const prevBearing = map.getBearing()
        const prevPitch = map.getPitch()
        map.jumpTo({ bearing: 0, pitch: 0 })
        await waitForIdle(map)
        setMapImage(snapshotMap(map))
        map.jumpTo({ bearing: prevBearing, pitch: prevPitch })
      }
      await new Promise((r) => setTimeout(r, 150)) // let report DOM paint the snapshot
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="wordmark">
          <span className="ribbon" />
          <span className="mark">Country</span>
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
        />
      </div>

      {site && (
        <ReportLayout ref={reportRef} site={site} citations={site.citations} mapImage={mapImage} />
      )}
    </div>
  )
}
