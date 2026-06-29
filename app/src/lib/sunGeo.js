// Projects sun-path azimuth/altitude points onto real ground coordinates
// around a site, so the sun path can be drawn as ordinary Mapbox GeoJSON
// layers on the live map — it pans, zooms and rotates with everything else,
// and "up" only means north because the data itself is geographic.
//
// Altitude maps to distance from the site the same way the standalone polar
// diagram maps it to radius: high in the sky = close to the site, near the
// horizon = out at `radiusM`. Same equirectangular approximation already
// used by geo.js's circlePolygon — fine at the site/street scale this is
// drawn at, not meant for survey accuracy.
import { bboxOf } from './geo.js'
import { getDayArc, sunPositionAtClockTime, SEASON_DATES } from './sunPosition.js'

const EARTH_R = 6371000

function destinationPoint([lng, lat], bearingDeg, distanceM) {
  const latRad = (lat * Math.PI) / 180
  const bearingRad = (bearingDeg * Math.PI) / 180
  const dLat = ((distanceM * Math.cos(bearingRad)) / EARTH_R) * (180 / Math.PI)
  const dLng = ((distanceM * Math.sin(bearingRad)) / (EARTH_R * Math.cos(latRad))) * (180 / Math.PI)
  return [lng + dLng, lat + dLat]
}

function pointForPosition(center, radiusM, { azimuthDeg, altitudeDeg }) {
  const distance = radiusM * (90 - altitudeDeg) / 90
  return destinationPoint(center, azimuthDeg, distance)
}

/** A day-arc (array of {azimuthDeg, altitudeDeg}) as a GeoJSON LineString around `center`. */
export function arcToLineString(points, center, radiusM) {
  return { type: 'LineString', coordinates: points.map((p) => pointForPosition(center, radiusM, p)) }
}

/** A single sun position as a GeoJSON Point around `center`. */
export function positionToPoint(position, center, radiusM) {
  return { type: 'Point', coordinates: pointForPosition(center, radiusM, position) }
}

/** Sizes the sun-path radius to the site: ~1.3x the parcel's bounding diagonal,
 *  clamped to a sensible range, or a fixed default when there's no parcel. */
export function sunPathRadiusM(bbox) {
  if (!bbox) return 50
  const [minX, minY, maxX, maxY] = bbox
  const latRad = ((minY + maxY) / 2) * Math.PI / 180
  const dx = (maxX - minX) * Math.cos(latRad) * 111320
  const dy = (maxY - minY) * 110540
  const diagonal = Math.sqrt(dx * dx + dy * dy)
  return Math.min(200, Math.max(30, diagonal * 0.8))
}

const GRID_ALTITUDES = [60, 30, 0]
const COMPASS = [
  { label: 'N', azimuthDeg: 0 },
  { label: 'E', azimuthDeg: 90 },
  { label: 'S', azimuthDeg: 180 },
  { label: 'W', azimuthDeg: 270 },
]

/** The polar diagram's background grid (altitude rings + N/E/S/W spokes),
 *  projected onto the ground the same way the sun-path arcs are, so the same
 *  diagram a designer reads in the abstract sky chart reads the same way
 *  laid over the actual site. */
export function sunGridLines(center, radiusM, ringPoints = 64) {
  const ringFeatures = GRID_ALTITUDES.map((altitudeDeg) => {
    const distance = radiusM * (90 - altitudeDeg) / 90
    const coords = []
    for (let i = 0; i <= ringPoints; i++) {
      const azimuthDeg = (i / ringPoints) * 360
      coords.push(destinationPoint(center, azimuthDeg, distance))
    }
    return { type: 'Feature', properties: { altitudeDeg }, geometry: { type: 'LineString', coordinates: coords } }
  })

  const spokeFeatures = COMPASS.map(({ azimuthDeg }) => ({
    type: 'Feature',
    properties: { azimuthDeg },
    geometry: { type: 'LineString', coordinates: [center, destinationPoint(center, azimuthDeg, radiusM)] },
  }))

  return { type: 'FeatureCollection', features: [...ringFeatures, ...spokeFeatures] }
}

/** N/E/S/W labels just beyond the outer grid ring. */
export function sunGridLabels(center, radiusM) {
  return {
    type: 'FeatureCollection',
    features: COMPASS.map(({ label, azimuthDeg }) => ({
      type: 'Feature',
      properties: { compass: label },
      geometry: { type: 'Point', coordinates: destinationPoint(center, azimuthDeg, radiusM * 1.1) },
    })),
  }
}

const HOUR_MARKS = [
  { minute: 9 * 60, label: '9am' },
  { minute: 12 * 60, label: '12pm' },
  { minute: 15 * 60, label: '3pm' },
]

/** Builds the summer/winter sun-path lines, their 9am/12pm/3pm markers, and
 *  the background polar grid for a site — shared by the live map overlay
 *  and the PDF export capture. `activeKinds` controls which solstice line
 *  reads at full opacity vs the dimmed envelope reference; the PDF (no live
 *  date selector to defer to) always passes both. */
export function buildSunPathLayers(center, geometry, activeKinds = ['summer', 'winter']) {
  const [lng, lat] = center
  const year = new Date().getFullYear()
  const radiusM = sunPathRadiusM(geometry ? bboxOf(geometry) : null)
  const seasons = [
    { key: 'summer', kind: 'summer' },
    { key: 'winter', kind: 'winter' },
  ]

  const lineFeatures = seasons
    .map(({ key, kind }) => {
      const sd = SEASON_DATES[key]
      const arc = getDayArc(year, sd.month, sd.day, lat, lng)
      if (arc.length < 2) return null
      return {
        type: 'Feature',
        properties: { kind, active: activeKinds.includes(kind) },
        geometry: arcToLineString(arc, center, radiusM),
      }
    })
    .filter(Boolean)

  const pointFeatures = []
  for (const { key, kind } of seasons) {
    const sd = SEASON_DATES[key]
    for (const h of HOUR_MARKS) {
      const pos = sunPositionAtClockTime(year, sd.month, sd.day, h.minute, lat, lng)
      if (pos.altitudeDeg > 0) {
        pointFeatures.push({
          type: 'Feature',
          properties: { kind, label: h.label },
          geometry: positionToPoint(pos, center, radiusM),
        })
      }
    }
  }

  return {
    sunLines: { type: 'FeatureCollection', features: lineFeatures },
    sunPoints: { type: 'FeatureCollection', features: pointFeatures },
    sunGridLinesData: sunGridLines(center, radiusM),
    sunGridLabelsData: sunGridLabels(center, radiusM),
    radiusM,
  }
}
