import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { addressPointsInBounds } from '../lib/nsw/address.js'
import { lotsInBounds } from '../lib/nsw/cadastre.js'
import { featureCollection } from '../lib/geo.js'

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const STYLES = {
  streets: 'mapbox://styles/mapbox/light-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
}

const NSW_CENTER = [147.0, -32.5]

const PARCEL_SRC = 'site-parcel'
const PARCEL_FILL = 'site-parcel-fill'
const PARCEL_LINE = 'site-parcel-line'

const HOUSE_SRC = 'house-numbers'
const HOUSE_LAYER = 'house-numbers-layer'
const HOUSE_MIN_ZOOM = 17

const CADASTRE_SRC = 'cadastre-outlines'
const CADASTRE_LAYER = 'cadastre-outlines-layer'
const CADASTRE_MIN_ZOOM = 15

const NEARBY_CIRCLE_SRC = 'nearby-circle'
const NEARBY_POINTS_SRC = 'nearby-points'

const SUN_LINES_SRC = 'sun-path-lines'
const SUN_POINTS_SRC = 'sun-path-points'
const SUN_EQUINOX_SRC = 'sun-path-equinox'
const SUN_CURRENT_SRC = 'sun-path-current'
const SUN_GRID_LINES_SRC = 'sun-path-grid-lines'
const SUN_GRID_LABELS_SRC = 'sun-path-grid-labels'

export default function MapView({
  styleKey, onMapReady, onParcelClick, flyTarget, parcelData, marker, picking, nearbyCircle, nearbyPoints,
  sunLines, sunPoints, sunEquinoxLine, sunCurrentPoint, sunGridLines, sunGridLabels,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const clickRef = useRef(onParcelClick)
  clickRef.current = onParcelClick

  // Init once
  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return
    mapboxgl.accessToken = TOKEN

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLES[styleKey] || STYLES.streets,
      center: NSW_CENTER,
      zoom: 5.2,
      preserveDrawingBuffer: true, // required for PDF snapshot
      attributionControl: true,
    })

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true, showCompass: true }), 'bottom-right')
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left')

    function addParcelLayers() {
      if (map.getSource(PARCEL_SRC)) return
      map.addSource(PARCEL_SRC, { type: 'geojson', data: emptyFC() })
      map.addLayer({
        id: PARCEL_FILL, type: 'fill', source: PARCEL_SRC,
        paint: { 'fill-color': '#fc4c02', 'fill-opacity': 0.18 },
      })
      map.addLayer({
        id: PARCEL_LINE, type: 'line', source: PARCEL_SRC,
        paint: { 'line-color': '#fc4c02', 'line-width': 2 },
      })
    }

    function addCadastreLayer() {
      if (map.getSource(CADASTRE_SRC)) return
      map.addSource(CADASTRE_SRC, { type: 'geojson', data: emptyFC() })
      map.addLayer({
        id: CADASTRE_LAYER, type: 'line', source: CADASTRE_SRC,
        minzoom: CADASTRE_MIN_ZOOM,
        paint: { 'line-color': '#8a8a9a', 'line-width': 1, 'line-opacity': 0.7 },
      }, PARCEL_FILL) // draw below the selected-parcel highlight
    }

    function addHouseLayer() {
      if (map.getSource(HOUSE_SRC)) return
      map.addSource(HOUSE_SRC, { type: 'geojson', data: emptyFC() })
      map.addLayer({
        id: HOUSE_LAYER, type: 'symbol', source: HOUSE_SRC,
        minzoom: HOUSE_MIN_ZOOM,
        layout: {
          'text-field': ['get', 'number'],
          'text-size': 11,
          'text-allow-overlap': false,
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        },
        paint: {
          'text-color': '#202030',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2,
        },
      })
    }

    let houseReqId = 0
    let houseDebounce = null
    function refreshHouseNumbers() {
      clearTimeout(houseDebounce)
      if (map.getZoom() < HOUSE_MIN_ZOOM) {
        const src = map.getSource(HOUSE_SRC)
        if (src) src.setData(emptyFC())
        return
      }
      houseDebounce = setTimeout(async () => {
        const reqId = ++houseReqId
        const b = map.getBounds()
        try {
          const fc = await addressPointsInBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
          if (reqId !== houseReqId) return // stale — a newer pan/zoom superseded this
          const src = map.getSource(HOUSE_SRC)
          if (src) src.setData(fc)
        } catch {
          // transient service error — leave existing labels in place
        }
      }, 300)
    }

    let cadastreReqId = 0
    let cadastreDebounce = null
    function refreshCadastreOutlines() {
      clearTimeout(cadastreDebounce)
      if (map.getZoom() < CADASTRE_MIN_ZOOM) {
        const src = map.getSource(CADASTRE_SRC)
        if (src) src.setData(emptyFC())
        return
      }
      cadastreDebounce = setTimeout(async () => {
        const reqId = ++cadastreReqId
        const b = map.getBounds()
        try {
          const fc = await lotsInBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
          if (reqId !== cadastreReqId) return // stale — a newer pan/zoom superseded this
          const src = map.getSource(CADASTRE_SRC)
          if (src) src.setData(fc)
        } catch {
          // transient service error — leave existing outlines in place
        }
      }, 300)
    }

    function addNearbyLayers() {
      if (map.getSource(NEARBY_CIRCLE_SRC)) return
      map.addSource(NEARBY_CIRCLE_SRC, { type: 'geojson', data: emptyFC() })
      map.addLayer({
        id: 'nearby-circle-line', type: 'line', source: NEARBY_CIRCLE_SRC,
        paint: { 'line-color': '#534ab7', 'line-width': 1.5, 'line-dasharray': [2, 2] },
      })
      map.addSource(NEARBY_POINTS_SRC, { type: 'geojson', data: emptyFC() })
      map.addLayer({
        id: 'nearby-points-layer', type: 'circle', source: NEARBY_POINTS_SRC,
        paint: {
          'circle-radius': 5,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      })
    }

    function addSunPathLayers() {
      if (map.getSource(SUN_LINES_SRC)) return

      // Background polar grid (altitude rings + N/E/S/W spokes) — the same
      // grid the standalone diagram draws, laid over the real site.
      map.addSource(SUN_GRID_LINES_SRC, { type: 'geojson', data: emptyFC() })
      map.addLayer({
        id: 'sun-path-grid-lines-layer', type: 'line', source: SUN_GRID_LINES_SRC,
        paint: { 'line-color': '#8a8a9a', 'line-width': 1, 'line-opacity': 0.6 },
      })
      map.addSource(SUN_GRID_LABELS_SRC, { type: 'geojson', data: emptyFC() })
      map.addLayer({
        id: 'sun-path-grid-labels-layer', type: 'symbol', source: SUN_GRID_LABELS_SRC,
        layout: {
          'text-field': ['get', 'compass'],
          'text-size': 12,
          'text-allow-overlap': true,
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        },
        paint: { 'text-color': '#5f5e5a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
      })

      // Equinox reference line — dashed, drawn separately since Mapbox line
      // dash patterns aren't data-driven per-feature.
      map.addSource(SUN_EQUINOX_SRC, { type: 'geojson', data: emptyFC() })
      map.addLayer({
        id: 'sun-path-equinox-layer', type: 'line', source: SUN_EQUINOX_SRC,
        paint: { 'line-color': '#5f5e5a', 'line-width': 2, 'line-dasharray': [2, 2] },
      })

      map.addSource(SUN_LINES_SRC, { type: 'geojson', data: emptyFC() })
      map.addLayer({
        id: 'sun-path-lines-layer', type: 'line', source: SUN_LINES_SRC,
        paint: {
          'line-color': ['match', ['get', 'kind'], 'winter', '#185FA5', '#BA7517'],
          'line-width': 2.5,
          // Dims to a faint envelope reference when its date isn't selected,
          // matching the emphasis the panel's mini diagram already shows.
          'line-opacity': ['case', ['get', 'active'], 1, 0.35],
        },
      })
      map.addSource(SUN_POINTS_SRC, { type: 'geojson', data: emptyFC() })
      map.addLayer({
        id: 'sun-path-points-layer', type: 'circle', source: SUN_POINTS_SRC,
        paint: {
          'circle-radius': 5,
          'circle-color': ['match', ['get', 'kind'], 'winter', '#185FA5', '#BA7517'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      })
      map.addLayer({
        id: 'sun-path-labels-layer', type: 'symbol', source: SUN_POINTS_SRC,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 11,
          'text-offset': [0, -1.2],
          'text-allow-overlap': true,
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        },
        paint: {
          'text-color': ['match', ['get', 'kind'], 'winter', '#042c53', '#412402'],
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.2,
        },
      })

      // Scrubber-driven current position — on top of everything else.
      map.addSource(SUN_CURRENT_SRC, { type: 'geojson', data: emptyFC() })
      map.addLayer({
        id: 'sun-path-current-layer', type: 'circle', source: SUN_CURRENT_SRC,
        paint: {
          'circle-radius': 7,
          'circle-color': '#D85A30',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })
    }

    map.on('load', () => {
      addParcelLayers()
      addCadastreLayer()
      addHouseLayer()
      addNearbyLayers()
      addSunPathLayers()
      onMapReady && onMapReady(map)
    })
    // Re-add custom layers after a basemap style switch.
    map.on('style.load', () => {
      addParcelLayers(); addCadastreLayer(); addHouseLayer(); addNearbyLayers(); addSunPathLayers()
    })
    map.on('moveend', refreshHouseNumbers)
    map.on('moveend', refreshCadastreOutlines)

    map.on('click', (e) => {
      clickRef.current && clickRef.current([e.lngLat.lng, e.lngLat.lat])
    })

    mapRef.current = map

    // Mapbox GL doesn't auto-resize when its container's size changes (e.g.
    // the side panel collapsing/expanding) — without this the canvas keeps
    // its old dimensions and leaves blank space.
    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Style toggle
  useEffect(() => {
    const map = mapRef.current
    if (map) map.setStyle(STYLES[styleKey] || STYLES.streets)
  }, [styleKey])

  // Cursor feedback for parcel-pick mode
  useEffect(() => {
    const map = mapRef.current
    if (map) map.getCanvas().style.cursor = picking ? 'crosshair' : ''
  }, [picking])

  // Push parcel highlight geometry
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource(PARCEL_SRC)
    if (src) src.setData(parcelData || emptyFC())
  }, [parcelData])

  // Confirmed-site marker
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (markerRef.current) { markerRef.current.remove(); markerRef.current = null }
    if (marker) {
      const el = document.createElement('div')
      el.className = 'site-marker'
      markerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(marker)
        .addTo(map)
    }
  }, [marker])

  // Push nearby-places radius ring + pins
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const circleSrc = map.getSource(NEARBY_CIRCLE_SRC)
    if (circleSrc) circleSrc.setData(nearbyCircle ? featureCollection([nearbyCircle]) : emptyFC())
    const pointsSrc = map.getSource(NEARBY_POINTS_SRC)
    if (pointsSrc) pointsSrc.setData(nearbyPoints || emptyFC())
  }, [nearbyCircle, nearbyPoints])

  // Push the sun-path diagram (geographic, so it follows pan/zoom/rotate)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const setData = (srcId, data) => {
      const src = map.getSource(srcId)
      if (src) src.setData(data || emptyFC())
    }
    setData(SUN_LINES_SRC, sunLines)
    setData(SUN_POINTS_SRC, sunPoints)
    setData(SUN_EQUINOX_SRC, sunEquinoxLine)
    setData(SUN_CURRENT_SRC, sunCurrentPoint)
    setData(SUN_GRID_LINES_SRC, sunGridLines)
    setData(SUN_GRID_LABELS_SRC, sunGridLabels)
  }, [sunLines, sunPoints, sunEquinoxLine, sunCurrentPoint, sunGridLines, sunGridLabels])

  // Fly to a search/confirm target
  useEffect(() => {
    const map = mapRef.current
    if (map && flyTarget?.lngLat) {
      map.flyTo({ center: flyTarget.lngLat, zoom: flyTarget.zoom || 17, essential: true })
    }
  }, [flyTarget])

  if (!TOKEN) {
    return (
      <div className="map-fallback">
        <div className="card">
          <div className="eyebrow" style={{ color: 'var(--accent-mint)' }}>Map not configured</div>
          <h3 style={{ fontWeight: 500, margin: '12px 0 8px' }}>Add your Mapbox token</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#cfcfe0', margin: 0 }}>
            Copy <code>.env.example</code> to <code>.env</code> and set{' '}
            <code>VITE_MAPBOX_TOKEN</code>, then restart the dev server. The rest of the
            interface works without it.
          </p>
        </div>
      </div>
    )
  }

  return <div ref={containerRef} className="map-canvas" />
}

function emptyFC() {
  return { type: 'FeatureCollection', features: [] }
}
