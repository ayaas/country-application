// Search-box geocoding. The NSW address text service is unindexed and takes
// 20–50 s per query, so it is unusable for interactive search. We instead use
// the Mapbox Geocoding API (we already load Mapbox + a token) purely to NAVIGATE
// the map to a location. This is map navigation, not a displayed fact: the
// authoritative address shown in the panel is still the nearest NSW AddressPoint
// looked up at the confirmed parcel (see lib/nsw/address.js). Restricted to NSW.

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const NSW_BBOX = [140.999, -37.505, 153.638, -28.157] // minLng,minLat,maxLng,maxLat
const NSW_CENTER = [147.0, -32.5]

/** Forward-geocode a query within NSW. Returns [{ name, place, center:[lng,lat] }]. */
export async function searchPlaces(query, signal) {
  const q = query.trim()
  if (!q || !TOKEN) return []

  // Pure coordinate input bypasses the geocoder entirely.
  const coord = q.match(/^(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)$/)
  if (coord) {
    const a = parseFloat(coord[1]), b = parseFloat(coord[2])
    const center = Math.abs(a) > Math.abs(b) ? [a, b] : [b, a] // infer lng/lat order
    return [{ name: `${center[1].toFixed(5)}, ${center[0].toFixed(5)}`, place: 'Coordinates', center }]
  }

  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward')
  url.searchParams.set('q', q)
  url.searchParams.set('access_token', TOKEN)
  url.searchParams.set('country', 'au')
  url.searchParams.set('bbox', NSW_BBOX.join(','))
  url.searchParams.set('proximity', NSW_CENTER.join(','))
  url.searchParams.set('limit', '6')
  url.searchParams.set('types', 'address,street,place,postcode,locality,neighborhood')

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Geocoder HTTP ${res.status}`)
  const data = await res.json()
  return (data.features || [])
    .map((f) => {
      const p = f.properties || {}
      const ctx = p.context || {}
      const suburb = ctx.locality?.name || ctx.neighborhood?.name || ctx.place?.name
      const place = [suburb, ctx.region?.name].filter(Boolean).join(', ')
      return {
        name: p.name_preferred || p.name || p.full_address || q,
        place: place || p.place_formatted || '',
        center: p.coordinates ? [p.coordinates.longitude, p.coordinates.latitude] : null,
      }
    })
    .filter((r) => r.center)
}
