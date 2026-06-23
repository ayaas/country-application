// Provenance model — the visual heartbeat of the product.
// Every field declares where it came from, so facts look like facts and
// pointers look like pointers. NOTHING is ever generated.
//
//   'official' → live value from a public NSW ArcGIS service
//   'curated'  → human-maintained reference text (cultural-references.json)
//   'link'     → outbound pointer only (no asserted value)
//   'na'       → not available / not yet looked up
//   'loading'  → request in flight (renders a skeleton)

export const KIND = {
  OFFICIAL: 'official',
  CURATED: 'curated',
  LINK: 'link',
  NA: 'na',
  LOADING: 'loading',
}

/** Build a field record for the panel / report. */
export function field(label, value, kind, { source, links, note } = {}) {
  return { label, value, kind, source, links, note }
}

/** A field whose lookup is still in flight. */
export function loadingField(label) {
  return { label, value: '…', kind: KIND.LOADING }
}

/** A field that resolved to nothing — honest "not available", never a guess.
 *  `source` is the service that WAS queried (and came back empty) — showing
 *  it tells the reader where the gap actually is, instead of just "see links". */
export function naField(label, links, source) {
  return { label, value: 'Not available — see links', kind: KIND.NA, links, source }
}

/** An official NSW value, or NA if the lookup came back empty. */
export function officialField(label, value, source, links) {
  if (value === null || value === undefined || value === '') return naField(label, links, source)
  return field(label, value, KIND.OFFICIAL, { source, links })
}
