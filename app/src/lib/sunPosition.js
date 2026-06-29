import * as SunCalc from 'suncalc'

const SYDNEY_TZ = 'Australia/Sydney'

const tzFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SYDNEY_TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

// How far Sydney clock time is ahead of UTC, in minutes, at the given UTC instant.
// Reads the real instant back out through the Sydney timezone, so it reflects
// whatever the IANA database says for that date — including DST transitions.
function sydneyOffsetMinutes(utcDate) {
  const parts = tzFormatter.formatToParts(utcDate)
  const map = {}
  for (const p of parts) map[p.type] = p.value
  const asUtc = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second)
  return Math.round((asUtc - utcDate.getTime()) / 60000)
}

// Converts a Sydney wall-clock date/time into the correct UTC instant,
// honouring AEST (UTC+10) vs AEDT (UTC+11) for that specific date.
export function sydneyLocalToUtc(year, month, day, hour, minute) {
  let offset = 600 // seed with AEST; converges in 1-2 iterations
  for (let i = 0; i < 3; i++) {
    const candidate = new Date(Date.UTC(year, month, day, hour, minute) - offset * 60000)
    const actualOffset = sydneyOffsetMinutes(candidate)
    if (actualOffset === offset) return candidate
    offset = actualOffset
  }
  return new Date(Date.UTC(year, month, day, hour, minute) - offset * 60000)
}

// Sun azimuth/altitude (degrees) at a UTC instant. Pure astronomy — no
// dependency on the viewer's machine timezone.
export function getSunPosition(utcDate, lat, lng) {
  // suncalc v2's getPosition already returns a north-based compass azimuth
  // (0 = N, 90 = E) and altitude, both in degrees.
  const { azimuth, altitude } = SunCalc.getPosition(utcDate, lat, lng)
  return { azimuthDeg: azimuth, altitudeDeg: altitude }
}

const SAMPLE_STEP_MIN = 5
const SAMPLE_START_MIN = 4 * 60 // 04:00
const SAMPLE_END_MIN = 21 * 60 // 21:00

// Samples a day's sun path in Sydney local clock time, returning only the
// portion above the horizon. Each point carries its local clock minute so
// the time scrubber can map back to a position.
export function getDayArc(year, month, day, lat, lng) {
  const points = []
  for (let m = SAMPLE_START_MIN; m <= SAMPLE_END_MIN; m += SAMPLE_STEP_MIN) {
    const utc = sydneyLocalToUtc(year, month, day, Math.floor(m / 60), m % 60)
    const { azimuthDeg, altitudeDeg } = getSunPosition(utc, lat, lng)
    if (altitudeDeg > 0) points.push({ minute: m, azimuthDeg, altitudeDeg })
  }
  return points
}

export function sunPositionAtClockTime(year, month, day, minute, lat, lng) {
  const utc = sydneyLocalToUtc(year, month, day, Math.floor(minute / 60), minute % 60)
  return { minute, ...getSunPosition(utc, lat, lng) }
}

export function getSydneyNow() {
  const now = new Date()
  const parts = tzFormatter.formatToParts(now)
  const map = {}
  for (const p of parts) map[p.type] = p.value
  return {
    year: +map.year,
    month: +map.month - 1,
    day: +map.day,
    minute: +map.hour * 60 + +map.minute,
  }
}

// The sun's path is identical on both equinoxes (same ~0° declination), so
// there's only one equinox reference date/arc, not separate autumn/spring ones.
export const SEASON_DATES = {
  summer: { month: 11, day: 21, label: 'Summer solstice' },
  winter: { month: 5, day: 21, label: 'Winter solstice' },
  equinox: { month: 2, day: 21, label: 'Equinox' },
}
