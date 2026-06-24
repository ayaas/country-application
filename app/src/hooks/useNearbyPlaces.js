// Nearby general points of interest around the confirmed site, refetched
// whenever the site or the chosen radius changes. Deliberately excludes
// Aboriginal cultural/heritage sites — see lib/poi.js.
import { useEffect, useState } from 'react'
import { poiNear } from '../lib/poi.js'

export function useNearbyPlaces(center, radiusM) {
  const [state, setState] = useState({ status: 'idle', places: [] })

  useEffect(() => {
    if (!center) {
      setState({ status: 'idle', places: [] })
      return
    }
    let cancelled = false
    setState((prev) => ({ status: 'loading', places: prev.places }))

    poiNear(center, radiusM)
      .then((places) => {
        if (!cancelled) setState({ status: 'ready', places })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', places: [] })
      })

    return () => {
      cancelled = true
    }
  }, [center, radiusM])

  return state
}
