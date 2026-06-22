// Curated Country references — static, human-maintained, links-first.
// No retrieval, no summarisation, no generation. The app derives the LGA from
// the official NSW lookup (Tier A) and renders the matching curated links + any
// human-written notes. Anything without verified notes resolves to statewide
// links plus an honest "No verified reference yet" marker.
import data from '../../data/cultural-references.json'
import { KIND, field } from '../provenance.js'

export const REFERENCES_REVIEWED = data.meta?.reviewed || null

/**
 * Build the Country-section fields for a given LGA (uppercase key) and the
 * official Local Aboriginal Land Council name (from NSW admin boundaries).
 * Returns an array of provenance-tagged field records — all link/curated/na,
 * never 'official' for cultural meaning (only the LALC name is official).
 */
export function countryFields(lgaKey, lalc) {
  const sw = data.statewide
  const lga = (lgaKey && data.byLga[lgaKey]) || null
  const hasNotes = !!(lga && lga.notes && lga.notes.trim())

  const fields = []

  // Local Aboriginal Land Council — this IS an official NSW administrative fact.
  if (lalc?.localCouncil) {
    fields.push(
      field('Local Aboriginal Land Council', `${lalc.localCouncil} LALC`, KIND.OFFICIAL, {
        source: 'NSW Administrative Boundaries (LALC area)',
        links: [{ text: 'Aboriginal Land Council of NSW', url: 'https://alc.org.au/lalc/' }],
        note: lalc.regionalCouncil ? `${lalc.regionalCouncil} region` : undefined,
      })
    )
  }

  // Nation / language group — named only where a council's own published
  // Acknowledgement of Country gives a citable name for this LGA; otherwise
  // an indicative pointer. Either way, never a boundary or a guess.
  fields.push(nationField(lga, sw))

  // Cultural significance / historical context: curated note if a person has
  // verified one (or it's drafted from the same Acknowledgement of Country),
  // else honest NA + statewide links.
  fields.push(curatedOrNa('Cultural significance', lga, hasNotes, sw.significance.links))
  fields.push(curatedOrNa('Historical context', lga, hasNotes, sw.history.links))

  return fields
}

function nationField(lga, sw) {
  if (!lga?.nation) {
    return field('Nation / language group', sw.nation.value, KIND.LINK, {
      links: [...sw.nation.links, ...sw.language.links],
    })
  }
  const pending = !lga.reviewed
  return field(lga.reviewed ? 'Nation / language group' : 'Nation / language group (drafted — pending review)', lga.nation, KIND.CURATED, {
    source: lga.source,
    note: pending
      ? 'Sourced from the local council\'s own published Acknowledgement of Country, not yet confirmed by a person. Treat as indicative, not a precise boundary.'
      : 'Sourced from the local council\'s own published Acknowledgement of Country. Treat as indicative, not a precise boundary.',
    links: [...(lga.nationLinks || []), ...sw.nation.links],
  })
}

function curatedOrNa(label, lga, hasNotes, fallbackLinks) {
  if (hasNotes) {
    return field(label, lga.notes, KIND.CURATED, {
      source: 'Curated reference',
      links: [...(lga.links || []), ...fallbackLinks],
    })
  }
  return field(label, 'No verified reference yet — follow the links and consult locally.', KIND.NA, {
    links: fallbackLinks,
  })
}
