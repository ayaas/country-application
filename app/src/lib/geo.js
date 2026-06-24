// Small geometry helpers. We request/send everything in WGS84 (wkid 4326)
// via the ArcGIS inSR/outSR params, so no client-side reprojection is needed.
// GDA2020/GDA94 vs WGS84 differ by ~1.8 m — immaterial for site research, and
// the parcel geometry returned is authoritative regardless.

/** Convert an Esri polygon (rings) to a GeoJSON geometry. */
export function esriRingsToGeoJson(esri) {
  if (!esri || !esri.rings) return null
  return { type: 'Polygon', coordinates: esri.rings }
}

/** Wrap one or more GeoJSON geometries as a FeatureCollection. */
export function featureCollection(geometries) {
  return {
    type: 'FeatureCollection',
    features: geometries
      .filter(Boolean)
      .map((geometry) => ({ type: 'Feature', properties: {}, geometry })),
  }
}

/** Merge several Polygon geometries into one MultiPolygon. */
export function mergePolygons(geometries) {
  const polys = geometries.filter((g) => g && g.type === 'Polygon')
  if (polys.length === 0) return null
  if (polys.length === 1) return polys[0]
  return { type: 'MultiPolygon', coordinates: polys.map((p) => p.coordinates) }
}

/** Bounding box [minLng, minLat, maxLng, maxLat] of a GeoJSON Polygon/MultiPolygon. */
export function bboxOf(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const visit = (ring) => {
    for (const [x, y] of ring) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (geometry.type === 'Polygon') geometry.coordinates.forEach(visit)
  else if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach((p) => p.forEach(visit))
  if (minX === Infinity) return null
  return [minX, minY, maxX, maxY]
}

/** Approximate centroid (bbox centre) of a geometry — good enough for label/flyTo. */
export function centerOf(geometry) {
  const b = bboxOf(geometry)
  if (!b) return null
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]
}

/** Approximate circle polygon (GeoJSON) of `radiusM` metres around [lng, lat].
 *  Good enough at the 100–500 m scale used for the nearby-places radius ring;
 *  not for anything requiring survey accuracy. */
export function circlePolygon([lng, lat], radiusM, points = 64) {
  const earthR = 6371000
  const latRad = (lat * Math.PI) / 180
  const ring = []
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI
    const dLat = ((radiusM * Math.cos(angle)) / earthR) * (180 / Math.PI)
    const dLng = ((radiusM * Math.sin(angle)) / (earthR * Math.cos(latRad))) * (180 / Math.PI)
    ring.push([lng + dLng, lat + dLat])
  }
  return { type: 'Polygon', coordinates: [ring] }
}

/** Format an area in m² as a friendly string (m² under 1 ha, else ha). */
export function formatArea(m2) {
  if (m2 == null || !isFinite(m2)) return null
  if (m2 < 10000) return `${Math.round(m2).toLocaleString()} m²`
  return `${(m2 / 10000).toLocaleString(undefined, { maximumFractionDigits: 2 })} ha (${Math.round(m2).toLocaleString()} m²)`
}
