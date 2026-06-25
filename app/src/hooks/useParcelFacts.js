// Per-parcel address + planning facts, in the order the parcels were picked.
// Only meaningful for multi-parcel ("adjoining parcels") selections — a single
// parcel's facts already come from useSiteFacts at its own point.
import { useEffect, useState } from 'react'
import { nearestAddress } from '../lib/nsw/address.js'
import { planningAtPoint } from '../lib/nsw/planning.js'
import { centerOf } from '../lib/geo.js'

function formatZoning(p) {
  if (!p.zoning) return null
  return `${p.zoning.label || ''} — ${p.zoning.class || ''}`.replace(/^ — | — $/, '')
}
function formatHeight(p) {
  return p.height ? `${p.height.value} ${p.height.units}` : null
}
function formatFsr(p) {
  return p.fsr ? `${p.fsr.value}:1` : null
}

export function useParcelFacts(parcels) {
  const [state, setState] = useState({ status: 'idle', items: [] })

  useEffect(() => {
    if (parcels.length < 2) {
      setState({ status: 'idle', items: [] })
      return
    }
    let cancelled = false
    setState({ status: 'loading', items: [] })

    Promise.all(
      parcels.map(async (p) => {
        const center = centerOf(p.geometry)
        const [address, planning] = await Promise.all([
          center ? nearestAddress(center, { geometry: p.geometry }).catch(() => null) : null,
          center ? planningAtPoint(center).catch(() => null) : null,
        ])
        return {
          id: p.id,
          address,
          zoning: planning ? formatZoning(planning) : null,
          height: planning ? formatHeight(planning) : null,
          fsr: planning ? formatFsr(planning) : null,
        }
      })
    ).then((items) => {
      if (!cancelled) setState({ status: 'ready', items })
    })

    return () => {
      cancelled = true
    }
  }, [parcels])

  return state
}
