// Orchestrates every NSW lookup for a confirmed site extent and assembles the
// provenance-tagged `site` object consumed by the panel + report. Each section
// resolves independently and progressively, so the panel fills in as data lands.
import { useEffect, useState } from 'react'
import { officialField, naField, field, loadingField, KIND } from '../lib/provenance.js'
import { SOURCES } from '../lib/nsw/endpoints.js'
import { adminAtPoint, lalcAtPoint } from '../lib/nsw/adminBoundaries.js'
import { nearestAddress } from '../lib/nsw/address.js'
import { planningAtPoint } from '../lib/nsw/planning.js'
import { countryFields, REFERENCES_REVIEWED } from '../lib/cultural/references.js'
import { speciesNear, alaExploreUrl } from '../lib/environment/ala.js'
import { formatArea } from '../lib/geo.js'

const PLANNING_LINK = [{ text: 'NSW Planning Portal — Spatial Viewer', url: 'https://www.planningportal.nsw.gov.au/spatialviewer/' }]
const ENV_LINKS = [
  { text: 'Atlas of Living Australia', url: 'https://www.ala.org.au/' },
  { text: 'NSW BioNet', url: 'https://www.environment.nsw.gov.au/topics/animals-and-plants/biodiversity/nsw-bionet' },
]

function emptySite() {
  return {
    name: 'Looking up address…',
    address: '…',
    center: null,
    geometry: null,
    status: 'loading',
    lgaName: null,
    lalc: null,
    epi: null,
    referencesReviewed: REFERENCES_REVIEWED,
    fields: {
      official: [
        loadingField('Address'),
        loadingField('Lot / Plan'),
        loadingField('Area'),
        loadingField('Local Government Area'),
        loadingField('Suburb'),
        loadingField('State'),
      ],
      planning: [loadingField('Zoning'), loadingField('Height of building'), loadingField('Floor space ratio')],
      country: [loadingField('Local Aboriginal Land Council'), loadingField('Nation / language group')],
      environment: [loadingField('Fauna recorded nearby'), loadingField('Flora recorded nearby')],
    },
    citations: [],
  }
}

/**
 * @param confirmed { center:[lng,lat], parcel|null, approximate:bool } | null
 */
export function useSiteFacts(confirmed) {
  const [site, setSite] = useState(null)

  useEffect(() => {
    if (!confirmed?.center) {
      setSite(null)
      return
    }
    let cancelled = false
    const { center, parcel, approximate } = confirmed
    const next = emptySite()
    next.center = center
    next.geometry = parcel?.geometry || null

    // Parcel facts are already in hand (from the click) — fill immediately.
    const parcelFields = parcel
      ? [
          officialField('Lot / Plan', parcel.id, SOURCES.cadastre),
          officialField('Area', formatArea(parcel.areaM2), SOURCES.cadastre),
        ]
      : [
          field('Lot / Plan', approximate ? 'Approximate extent (no parcel)' : 'No parcel selected', KIND.NA),
          naField('Area'),
        ]

    setSite(next)

    async function resolveOfficial() {
      // Admin boundaries are fast + reliable — render the official section first,
      // with Address still loading. Address (occasionally slow) patches in after.
      const admin = await adminAtPoint(center).catch(() => ({}))
      if (cancelled) return
      const a = admin || {}

      const buildOfficial = (addressField) => [
        addressField,
        ...parcelFields,
        officialField('Local Government Area', a.councilName || a.lgaName, SOURCES.admin),
        officialField('Suburb', a.suburb ? `${a.suburb}${a.postcode ? ' ' + a.postcode : ''}` : null, SOURCES.admin),
        officialField('State', a.state || 'New South Wales', SOURCES.admin),
      ]

      // `name` is the header headline and is reserved for the actual street
      // address — it must never silently fall back to the suburb, or the
      // panel/PDF would look like an address when it's really just a locality.
      setSite((prev) =>
        prev
          ? {
              ...prev,
              name: 'Looking up address…',
              address: [a.suburb, a.state].filter(Boolean).join(', ') || 'New South Wales',
              lgaName: a.lgaName,
              fields: { ...prev.fields, official: buildOfficial(loadingField('Address')) },
            }
          : prev
      )

      // Country references (LGA + LALC) and the authoritative address resolve in
      // parallel; each patches in as it lands. Await both before 'ready' so the
      // citations list is complete.
      const lalcPromise = lalcAtPoint(center)
        .catch(() => null)
        .then((lalc) => {
          if (cancelled) return
          setSite((prev) =>
            prev ? { ...prev, lalc, fields: { ...prev.fields, country: countryFields(a.lgaKey, lalc) } } : prev
          )
        })

      const addressPromise = nearestAddress(center, { geometry: parcel?.geometry })
        .catch(() => null)
        .then((address) => {
          if (cancelled) return
          setSite((prev) => {
            if (!prev) return prev
            const addressField = officialField('Address', address, SOURCES.address)
            return {
              ...prev,
              // Honest fallback if no AddressPoint matched — never the suburb.
              name: address || 'Address not available — see Lot/Plan below',
              fields: { ...prev.fields, official: buildOfficial(addressField) },
            }
          })
        })

      await Promise.allSettled([lalcPromise, addressPromise])
    }

    async function resolvePlanning() {
      let p
      try {
        p = await planningAtPoint(center)
      } catch {
        if (cancelled) return
        setSite((prev) =>
          prev
            ? { ...prev, fields: { ...prev.fields, planning: [naField('Planning controls', PLANNING_LINK)] } }
            : prev
        )
        return
      }
      if (cancelled) return
      const planning = [
        p.zoning
          ? field('Zoning', `${p.zoning.label || ''} — ${p.zoning.class || ''}`.replace(/^ — | — $/, ''), KIND.OFFICIAL, { source: SOURCES.planning, links: PLANNING_LINK })
          : naField('Zoning', PLANNING_LINK, SOURCES.planning),
        p.height
          ? officialField('Height of building', `${p.height.value} ${p.height.units}`, SOURCES.planning)
          : naField('Height of building', undefined, SOURCES.planning),
        p.fsr
          ? officialField('Floor space ratio', `${p.fsr.value}:1`, SOURCES.planning)
          : naField('Floor space ratio', undefined, SOURCES.planning),
        p.minLotSize
          ? officialField('Minimum lot size', `${p.minLotSize.value} ${p.minLotSize.units}`, SOURCES.planning)
          : naField('Minimum lot size', undefined, SOURCES.planning),
        p.heritage
          ? field('Heritage', `${p.heritage.name || p.heritage.class}${p.heritage.significance ? ' · ' + p.heritage.significance : ''}`, KIND.OFFICIAL, { source: SOURCES.planning })
          : field('Heritage', 'No heritage listing mapped at this point', KIND.NA),
      ]
      setSite((prev) =>
        prev ? { ...prev, epi: p.epi, fields: { ...prev.fields, planning } } : prev
      )
    }

    async function resolveEnvironment() {
      let s
      try {
        s = await speciesNear(center)
      } catch {
        if (cancelled) return
        setSite((prev) =>
          prev
            ? {
                ...prev,
                fields: {
                  ...prev.fields,
                  environment: [
                    naField('Fauna recorded nearby', ENV_LINKS),
                    naField('Flora recorded nearby', ENV_LINKS),
                  ],
                },
              }
            : prev
        )
        return
      }
      if (cancelled) return
      const exploreLink = [{ text: 'Explore records on Atlas of Living Australia', url: alaExploreUrl(center) }]
      const speciesField = (label, group) =>
        group.names.length > 0
          ? field(label, group.names.join(', '), KIND.OFFICIAL, {
              source: `Atlas of Living Australia — within ${s.radiusKm} km (${group.total.toLocaleString()} records)`,
              links: [...exploreLink, ...ENV_LINKS],
            })
          : naField(label, ENV_LINKS)
      setSite((prev) =>
        prev
          ? {
              ...prev,
              fields: {
                ...prev.fields,
                environment: [
                  speciesField('Fauna recorded nearby', s.fauna),
                  speciesField('Flora recorded nearby', s.flora),
                ],
              },
            }
          : prev
      )
    }

    Promise.allSettled([resolveOfficial(), resolvePlanning(), resolveEnvironment()]).then(() => {
      if (cancelled) return
      setSite((prev) => (prev ? { ...prev, status: 'ready', citations: buildCitations(prev) } : prev))
    })

    return () => {
      cancelled = true
    }
  }, [confirmed])

  return site
}

// Each citation is tagged with the tab(s) it's actually used in, so the panel
// can show only what's relevant to the tab someone's looking at instead of
// the site's entire bibliography on every tab.
function buildCitations(site) {
  const c = [
    {
      text: 'NSW Spatial Services — portal.spatial.nsw.gov.au/server/rest/services (address, cadastre, administrative boundaries)',
      tabs: ['official'],
    },
  ]
  if (site.fields.planning?.some((f) => f.kind === KIND.OFFICIAL)) {
    c.push({
      text: `NSW Planning Portal — ePlanning Principal Planning${site.epi ? ' (' + site.epi + ')' : ''}`,
      tabs: ['official'],
    })
  }
  if (site.fields.environment?.some((f) => f.kind === KIND.OFFICIAL)) {
    c.push({
      text: 'Atlas of Living Australia — biocache-ws.ala.org.au (species records within 3 km of the confirmed point)',
      tabs: ['environment'],
    })
  }
  const nationField = site.fields.country?.find((f) => f.label.startsWith('Nation / language group'))
  if (nationField?.kind === KIND.CURATED && nationField.source) {
    const pending = nationField.label.includes('pending review')
    c.push({
      text: `${nationField.source} — drafted from the council's published Acknowledgement of Country${pending ? ', pending review' : ''}`,
      tabs: ['country'],
    })
  }
  c.push({
    text: 'AIATSIS Map of Indigenous Australia — aiatsis.gov.au (indicative only; not for land claims or native title)',
    tabs: ['country'],
  })
  c.push({ text: 'NSW Connecting with Country framework — planning.nsw.gov.au', tabs: ['country'] })
  if (site.lalc?.localCouncil) {
    c.push({ text: `${site.lalc.localCouncil} Local Aboriginal Land Council — alc.org.au/lalc`, tabs: ['country'] })
  }
  return c
}
