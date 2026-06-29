// Monthly climate normals from Open-Meteo's historical archive (ERA5
// reanalysis) — averaged over the last 5 complete years, which is far
// shorter than a true 30-year normal but is what's freely available
// without an account, and is good enough for a design-stage climate study.
// Falls back to a bundled Sydney dataset (sydneyClimate.json) if the
// request fails — e.g. no network during a studio demo.
import sydneyClimate from '../data/sydneyClimate.json'
import { sunPositionAtClockTime } from './sunPosition.js'

const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'
const DAILY_VARS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'wind_speed_10m_mean',
  'wind_direction_10m_dominant',
  'relative_humidity_2m_mean',
  'sunshine_duration',
].join(',')

const COMPASS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

function compassBucket(deg) {
  return COMPASS_8[Math.round(((deg % 360) / 45)) % 8]
}

// Rough clear-sky UV model: peak midday UV scales with how high the sun gets
// at solar noon. Not a measured record — there's no free historical UV
// dataset — but it tracks the real seasonal swing well enough for a design
// brief, and reuses the same solar-position math as the sun-path diagram.
// Ignores cloud cover, so it reads as a clear-sky ceiling, not a true average.
function modelledUvIndex(year, month, lat, lng) {
  const { altitudeDeg } = sunPositionAtClockTime(year, month, 21, 12 * 60, lat, lng)
  if (altitudeDeg <= 0) return 0
  return Math.min(14, Math.round(12 * Math.sin((altitudeDeg * Math.PI) / 180)))
}

export async function fetchClimateNormals([lng, lat]) {
  const today = new Date()
  const endYear = today.getFullYear()
  const startYear = endYear - 5 // 6-year span, including the current (partial) year
  const endDate = today.toISOString().slice(0, 10) // archive API rejects dates past "today"
  const url = `${ARCHIVE_URL}?latitude=${lat}&longitude=${lng}&start_date=${startYear}-01-01&end_date=${endDate}&daily=${DAILY_VARS}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Open-Meteo archive request failed: ${res.status}`)
  const json = await res.json()
  const daily = json.daily
  if (!daily || !daily.time) throw new Error('Open-Meteo archive returned no daily data')

  const months = Array.from({ length: 12 }, () => ({
    tempMaxSum: 0, tempMinSum: 0, tempCount: 0,
    rainfallSum: 0, rainDaysCount: 0, rainfallYears: new Set(),
    windSum: 0, windCount: 0,
    humiditySum: 0, humidityCount: 0,
    sunshineSum: 0, sunshineCount: 0,
  }))
  const dirCounts = Object.fromEntries(COMPASS_8.map((d) => [d, 0]))
  let dirTotal = 0

  daily.time.forEach((dateStr, i) => {
    const month = parseInt(dateStr.slice(5, 7), 10) - 1
    const year = parseInt(dateStr.slice(0, 4), 10)
    const m = months[month]

    const tMax = daily.temperature_2m_max?.[i]
    const tMin = daily.temperature_2m_min?.[i]
    if (tMax != null && tMin != null) { m.tempMaxSum += tMax; m.tempMinSum += tMin; m.tempCount++ }

    const rain = daily.precipitation_sum?.[i]
    if (rain != null) {
      m.rainfallSum += rain
      if (rain >= 1) m.rainDaysCount++
      m.rainfallYears.add(year)
    }

    const wind = daily.wind_speed_10m_mean?.[i]
    if (wind != null) { m.windSum += wind; m.windCount++ }

    const humidity = daily.relative_humidity_2m_mean?.[i]
    if (humidity != null) { m.humiditySum += humidity; m.humidityCount++ }

    const sunshine = daily.sunshine_duration?.[i]
    if (sunshine != null) { m.sunshineSum += sunshine / 3600; m.sunshineCount++ }

    const dir = daily.wind_direction_10m_dominant?.[i]
    if (dir != null) { dirCounts[compassBucket(dir)]++; dirTotal++ }
  })

  const refYear = endYear
  const monthsOut = months.map((m, idx) => {
    const years = m.rainfallYears.size || 1
    return {
      month: idx + 1,
      tempMaxC: round1(m.tempMaxSum / (m.tempCount || 1)),
      tempMinC: round1(m.tempMinSum / (m.tempCount || 1)),
      rainfallMm: round1(m.rainfallSum / years),
      rainDays: round1(m.rainDaysCount / years),
      windSpeedKmh: round1(m.windSum / (m.windCount || 1)),
      humidityPct: round1(m.humiditySum / (m.humidityCount || 1)),
      sunshineHrs: round1(m.sunshineSum / (m.sunshineCount || 1)),
      uvIndex: modelledUvIndex(refYear, idx, lat, lng),
    }
  })

  const windRose = COMPASS_8.map((dir) => ({
    dir,
    pct: dirTotal > 0 ? Math.round((dirCounts[dir] / dirTotal) * 100) : 0,
  }))

  return { source: 'Open-Meteo', months: monthsOut, windRose, startYear, endYear }
}

export function fallbackClimateNormals() {
  return sydneyClimate
}

function round1(n) {
  return Math.round(n * 10) / 10
}
