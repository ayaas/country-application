// General points of interest near a confirmed site (parks, schools, shops,
// landmarks) — pulled from Mapbox's own street-level POI tiles via the
// Tilequery API. This is map navigation/context data, not an official NSW
// register, so it's surfaced as a plain "nearby places" list, never tagged
// official. Deliberately excludes anything Aboriginal-cultural/heritage —
// AHIMS site locations are access-restricted by design (see Country tab),
// so they are never plotted here even approximately.
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const TILESET = 'mapbox.mapbox-streets-v8'

function titleCase(s) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Nearby POIs within `radiusM` of [lng, lat]. Returns [{ name, category, distanceM, center }]. */
export async function poiNear([lng, lat], radiusM = 200, limit = 20) {
  if (!TOKEN) return []

  const url = new URL(`https://api.mapbox.com/v4/${TILESET}/tilequery/${lng},${lat}.json`)
  url.searchParams.set('radius', String(radiusM))
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('layers', 'poi_label')
  url.searchParams.set('access_token', TOKEN)

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Tilequery HTTP ${res.status}`)
  const data = await res.json()

  return (data.features || [])
    .filter((f) => f.properties?.name)
    .map((f) => ({
      name: f.properties.name,
      category: titleCase(f.properties.class || f.properties.type || 'Place'),
      distanceM: Math.round(f.properties.tilequery?.distance ?? 0),
      center: f.geometry?.coordinates || null,
    }))
    .sort((a, b) => a.distanceM - b.distanceM)
}
