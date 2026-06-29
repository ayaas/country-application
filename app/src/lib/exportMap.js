// A dedicated, hidden Mapbox instance used only for the PDF cover plan.
// The live map (MapView.jsx) is whatever size the user's screen/window gives
// it, and can be tilted, rotated, or in satellite mode — none of that is
// acceptable for an exported document, which must look identical in shape
// every time. Rendering a second, fixed-size map off-screen sidesteps all of
// that: same pixel dimensions, same flat top-down camera, same basemap,
// every export, regardless of the live map's current state.
import mapboxgl from 'mapbox-gl'
import { bboxOf, circlePolygon } from './geo.js'
import { addressPointsInBounds } from './nsw/address.js'
import { colorForIndex } from './poi.js'
import { buildSunPathLayers, arcToLineString } from './sunGeo.js'
import { getDayArc, SEASON_DATES } from './sunPosition.js'

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const STYLE = 'mapbox://styles/mapbox/light-v11'

// Fixed landscape frame for every export, independent of screen size.
export const EXPORT_MAP_W = 1280
export const EXPORT_MAP_H = 720 // 16:9
const FIT_PADDING = 56
const FALLBACK_ZOOM = 17

const PARCEL_SRC = 'export-parcel'
const HOUSE_SRC = 'export-house-numbers'

/** Render `geometry` (or `center` if there's no parcel) on a fixed-size,
 *  always-flat, always-north-up offscreen map and return a PNG data URL. */
export function captureSiteMap({ geometry, center }) {
  if (!TOKEN) return Promise.resolve(null)

  return new Promise((resolve) => {
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.left = '-10000px'
    container.style.top = '0'
    container.style.width = `${EXPORT_MAP_W}px`
    container.style.height = `${EXPORT_MAP_H}px`
    document.body.appendChild(container)

    mapboxgl.accessToken = TOKEN
    const map = new mapboxgl.Map({
      container,
      style: STYLE,
      center: center || [147.0, -32.5],
      zoom: FALLBACK_ZOOM,
      bearing: 0, // locked — north stays at the top of the page
      pitch: 0, // locked — flat orthographic plan view, never tilted
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: true,
      fadeDuration: 0,
    })

    function cleanup(result) {
      map.remove()
      container.remove()
      resolve(result)
    }

    map.on('load', () => {
      if (geometry) {
        map.addSource(PARCEL_SRC, {
          type: 'geojson',
          data: { type: 'Feature', properties: {}, geometry },
        })
        map.addLayer({
          id: 'export-parcel-fill', type: 'fill', source: PARCEL_SRC,
          paint: { 'fill-color': '#fc4c02', 'fill-opacity': 0.18 },
        })
        map.addLayer({
          id: 'export-parcel-line', type: 'line', source: PARCEL_SRC,
          paint: { 'line-color': '#fc4c02', 'line-width': 2.5 },
        })

        const bbox = bboxOf(geometry)
        if (bbox) {
          // Site boundary centred with a consistent padding/scale margin —
          // never the user's arbitrary live pan/zoom.
          map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
            padding: FIT_PADDING,
            bearing: 0,
            pitch: 0,
            animate: false,
            maxZoom: 19,
          })
        }
      } else if (center) {
        const el = document.createElement('div')
        el.style.width = '16px'
        el.style.height = '16px'
        el.style.borderRadius = '50%'
        el.style.background = '#fc4c02'
        el.style.border = '2px solid #fff'
        new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat(center).addTo(map)
        map.jumpTo({ center, zoom: FALLBACK_ZOOM, bearing: 0, pitch: 0 })
      }

      const capture = () => {
        try {
          cleanup(map.getCanvas().toDataURL('image/png'))
        } catch (e) {
          console.warn('Export map snapshot failed:', e)
          cleanup(null)
        }
      }

      // Once the camera has settled on the site (fitBounds/jumpTo above is
      // synchronous, but tiles still need to load), the viewport is final —
      // fetch house numbers for that exact frame, add them, then capture.
      const addHouseNumbersThenCapture = async () => {
        try {
          const b = map.getBounds()
          const fc = await addressPointsInBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
          map.addSource(HOUSE_SRC, { type: 'geojson', data: fc })
          map.addLayer({
            id: 'export-house-numbers-layer', type: 'symbol', source: HOUSE_SRC,
            layout: {
              'text-field': ['get', 'number'],
              'text-size': 12,
              'text-allow-overlap': false,
              'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            },
            paint: {
              'text-color': '#202030',
              'text-halo-color': '#ffffff',
              'text-halo-width': 1.2,
            },
          })
        } catch {
          // transient NSW service error — still export the plan, just without numbers
        }
        if (map.loaded() && map.areTilesLoaded()) capture()
        else {
          const t = setTimeout(capture, 2000)
          map.once('idle', () => { clearTimeout(t); capture() })
        }
      }

      if (map.loaded() && map.areTilesLoaded()) {
        addHouseNumbersThenCapture()
      } else {
        const timer = setTimeout(addHouseNumbersThenCapture, 4000)
        map.once('idle', () => {
          clearTimeout(timer)
          addHouseNumbersThenCapture()
        })
      }
    })

    map.on('error', () => cleanup(null))
  })
}

const NEARBY_CIRCLE_SRC = 'export-nearby-circle'
const NEARBY_POINTS_SRC = 'export-nearby-points'

/** Render the nearby-places radius ring + coloured pins for the PDF report.
 *  `places` must be the full, unfiltered list (same order as the panel's
 *  legend) so each pin's colour matches its legend entry via colorForIndex. */
export function captureNearbyMap({ center, radiusM, places }) {
  if (!TOKEN || !center) return Promise.resolve(null)

  return new Promise((resolve) => {
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.left = '-10000px'
    container.style.top = '0'
    container.style.width = `${EXPORT_MAP_W}px`
    container.style.height = `${EXPORT_MAP_H}px`
    document.body.appendChild(container)

    mapboxgl.accessToken = TOKEN
    const map = new mapboxgl.Map({
      container,
      style: STYLE,
      center,
      zoom: FALLBACK_ZOOM,
      bearing: 0,
      pitch: 0,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: true,
      fadeDuration: 0,
    })

    function cleanup(result) {
      map.remove()
      container.remove()
      resolve(result)
    }

    map.on('load', () => {
      const circle = circlePolygon(center, radiusM)
      map.addSource(NEARBY_CIRCLE_SRC, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: circle },
      })
      map.addLayer({
        id: 'export-nearby-circle-line', type: 'line', source: NEARBY_CIRCLE_SRC,
        paint: { 'line-color': '#534ab7', 'line-width': 2, 'line-dasharray': [2, 2] },
      })

      map.addSource(NEARBY_POINTS_SRC, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: places
            .map((p, i) => ({ ...p, i }))
            .filter((p) => p.center)
            .map((p) => ({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: p.center },
              properties: { color: colorForIndex(p.i) },
            })),
        },
      })
      map.addLayer({
        id: 'export-nearby-points-layer', type: 'circle', source: NEARBY_POINTS_SRC,
        paint: {
          'circle-radius': 7,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      const bbox = bboxOf(circle)
      if (bbox) {
        map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
          padding: FIT_PADDING,
          bearing: 0,
          pitch: 0,
          animate: false,
          maxZoom: 19,
        })
      }

      const capture = () => {
        try {
          cleanup(map.getCanvas().toDataURL('image/png'))
        } catch (e) {
          console.warn('Export nearby-map snapshot failed:', e)
          cleanup(null)
        }
      }
      if (map.loaded() && map.areTilesLoaded()) capture()
      else {
        const t = setTimeout(capture, 4000)
        map.once('idle', () => { clearTimeout(t); capture() })
      }
    })

    map.on('error', () => cleanup(null))
  })
}

const SUN_LINES_SRC = 'export-sun-lines'
const SUN_POINTS_SRC = 'export-sun-points'
const SUN_EQUINOX_SRC = 'export-sun-equinox'
const SUN_GRID_LINES_SRC = 'export-sun-grid-lines'
const SUN_GRID_LABELS_SRC = 'export-sun-grid-labels'
const SUN_PARCEL_SRC = 'export-sun-parcel'

/** Render the summer/winter sun-path diagram (lines + 9am/12pm/3pm markers +
 *  polar grid) over a fixed-size, always-flat, north-up offscreen map — the
 *  single capture used for the PDF's sun-path page. Both solstice lines are
 *  always at full emphasis here; there's no live date selector to defer to
 *  for an exported document. Composites a north arrow onto the result since
 *  this is a flat PNG, not a live DOM tree something could overlay. */
export function captureSunPathMap({ geometry, center }) {
  if (!TOKEN || !center) return Promise.resolve(null)

  return new Promise((resolve) => {
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.left = '-10000px'
    container.style.top = '0'
    container.style.width = `${EXPORT_MAP_W}px`
    container.style.height = `${EXPORT_MAP_H}px`
    document.body.appendChild(container)

    mapboxgl.accessToken = TOKEN
    const map = new mapboxgl.Map({
      container,
      style: STYLE,
      center,
      zoom: FALLBACK_ZOOM,
      bearing: 0,
      pitch: 0,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: true,
      fadeDuration: 0,
    })

    function cleanup(result) {
      map.remove()
      container.remove()
      resolve(result)
    }

    map.on('load', () => {
      if (geometry) {
        map.addSource(SUN_PARCEL_SRC, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry } })
        map.addLayer({
          id: 'export-sun-parcel-fill', type: 'fill', source: SUN_PARCEL_SRC,
          paint: { 'fill-color': '#fc4c02', 'fill-opacity': 0.18 },
        })
        map.addLayer({
          id: 'export-sun-parcel-line', type: 'line', source: SUN_PARCEL_SRC,
          paint: { 'line-color': '#fc4c02', 'line-width': 2.5 },
        })
      }

      const { sunLines, sunPoints, sunGridLinesData, sunGridLabelsData, radiusM } = buildSunPathLayers(center, geometry, [
        'summer', 'winter',
      ])

      const eq = SEASON_DATES.equinox
      const equinoxArc = getDayArc(new Date().getFullYear(), eq.month, eq.day, center[1], center[0])
      const equinoxLine =
        equinoxArc.length >= 2
          ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: arcToLineString(equinoxArc, center, radiusM) }] }
          : { type: 'FeatureCollection', features: [] }

      map.addSource(SUN_GRID_LINES_SRC, { type: 'geojson', data: sunGridLinesData })
      map.addLayer({
        id: 'export-sun-grid-lines-layer', type: 'line', source: SUN_GRID_LINES_SRC,
        paint: { 'line-color': '#8a8a9a', 'line-width': 1, 'line-opacity': 0.6 },
      })
      map.addSource(SUN_GRID_LABELS_SRC, { type: 'geojson', data: sunGridLabelsData })
      map.addLayer({
        id: 'export-sun-grid-labels-layer', type: 'symbol', source: SUN_GRID_LABELS_SRC,
        layout: {
          'text-field': ['get', 'compass'], 'text-size': 14, 'text-allow-overlap': true,
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        },
        paint: { 'text-color': '#5f5e5a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
      })

      map.addSource(SUN_EQUINOX_SRC, { type: 'geojson', data: equinoxLine })
      map.addLayer({
        id: 'export-sun-equinox-layer', type: 'line', source: SUN_EQUINOX_SRC,
        paint: { 'line-color': '#5f5e5a', 'line-width': 2, 'line-dasharray': [2, 2] },
      })

      map.addSource(SUN_LINES_SRC, { type: 'geojson', data: sunLines })
      map.addLayer({
        id: 'export-sun-lines-layer', type: 'line', source: SUN_LINES_SRC,
        paint: { 'line-color': ['match', ['get', 'kind'], 'winter', '#185FA5', '#BA7517'], 'line-width': 3 },
      })

      map.addSource(SUN_POINTS_SRC, { type: 'geojson', data: sunPoints })
      map.addLayer({
        id: 'export-sun-points-layer', type: 'circle', source: SUN_POINTS_SRC,
        paint: {
          'circle-radius': 6,
          'circle-color': ['match', ['get', 'kind'], 'winter', '#185FA5', '#BA7517'],
          'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff',
        },
      })
      map.addLayer({
        id: 'export-sun-labels-layer', type: 'symbol', source: SUN_POINTS_SRC,
        layout: {
          'text-field': ['get', 'label'], 'text-size': 13, 'text-offset': [0, -1.3], 'text-allow-overlap': true,
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        },
        paint: {
          'text-color': ['match', ['get', 'kind'], 'winter', '#042c53', '#412402'],
          'text-halo-color': '#ffffff', 'text-halo-width': 1.4,
        },
      })

      const bbox = geometry ? bboxOf(geometry) : null
      if (bbox) {
        map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
          padding: FIT_PADDING, bearing: 0, pitch: 0, animate: false, maxZoom: 19,
        })
      } else {
        map.jumpTo({ center, zoom: FALLBACK_ZOOM, bearing: 0, pitch: 0 })
      }

      const capture = () => {
        try {
          const baseUrl = map.getCanvas().toDataURL('image/png')
          compositeNorthArrow(baseUrl, EXPORT_MAP_W, EXPORT_MAP_H).then(cleanup)
        } catch (e) {
          console.warn('Export sun-path snapshot failed:', e)
          cleanup(null)
        }
      }
      if (map.loaded() && map.areTilesLoaded()) capture()
      else {
        const t = setTimeout(capture, 4000)
        map.once('idle', () => { clearTimeout(t); capture() })
      }
    })

    map.on('error', () => cleanup(null))
  })
}

// Burns a north arrow into the corner of a flat PNG capture. Unlike the live
// map, an exported image has no DOM to overlay an icon onto, so it's drawn
// directly with Canvas2D after the Mapbox capture resolves.
function compositeNorthArrow(baseDataUrl, w, h) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)

      const ax = w - 50, ay = 44
      ctx.fillStyle = 'rgba(255,255,255,0.88)'
      ctx.beginPath()
      ctx.roundRect(ax - 24, ay - 26, 64, 48, 8)
      ctx.fill()

      ctx.beginPath()
      ctx.moveTo(ax, ay - 16)
      ctx.lineTo(ax + 7, ay + 2)
      ctx.lineTo(ax, ay - 2)
      ctx.lineTo(ax - 7, ay + 2)
      ctx.closePath()
      ctx.fillStyle = '#fc4c02'
      ctx.fill()

      ctx.fillStyle = '#010120'
      ctx.font = '600 15px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('N', ax, ay + 18)

      drawLegend(ctx, w, h)

      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(baseDataUrl)
    img.src = baseDataUrl
  })
}

// Colour key for the sun-path lines, bottom-right corner — same swatch
// colours as the live map overlay and the panel's mini diagram.
const LEGEND_ITEMS = [
  { color: '#BA7517', label: 'Summer solstice' },
  { color: '#185FA5', label: 'Winter solstice' },
  { color: '#5f5e5a', label: 'Equinox', dashed: true },
]

function drawLegend(ctx, w, h) {
  const rowH = 22
  const boxW = 168
  const boxH = LEGEND_ITEMS.length * rowH + 16
  const bx = w - boxW - 20
  const by = h - boxH - 20

  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  ctx.beginPath()
  ctx.roundRect(bx, by, boxW, boxH, 8)
  ctx.fill()

  LEGEND_ITEMS.forEach(({ color, label, dashed }, i) => {
    const ly = by + 16 + i * rowH + 8
    ctx.strokeStyle = color
    ctx.lineWidth = dashed ? 2 : 3
    ctx.setLineDash(dashed ? [3, 3] : [])
    ctx.beginPath()
    ctx.moveTo(bx + 16, ly)
    ctx.lineTo(bx + 38, ly)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = '#010120'
    ctx.font = '500 13px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText(label, bx + 48, ly + 4)
  })
}
