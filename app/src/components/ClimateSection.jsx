import { useEffect, useState } from 'react'
import { fetchClimateNormals, fallbackClimateNormals } from '../lib/climate.js'

export default function ClimateSection({ center }) {
  const [state, setState] = useState({ status: 'loading', data: null })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading', data: null })
    fetchClimateNormals(center)
      .then((data) => { if (!cancelled) setState({ status: 'ready', data }) })
      .catch(() => { if (!cancelled) setState({ status: 'ready', data: fallbackClimateNormals() }) })
    return () => { cancelled = true }
  }, [center])

  if (state.status === 'loading') {
    return <div className="section-foot">Loading climate data…</div>
  }

  const { source, months, windRose, startYear, endYear } = state.data
  const avg = (key) => round1(months.reduce((s, m) => s + m[key], 0) / months.length)
  const prevailing = windRose.reduce((a, b) => (b.pct > a.pct ? b : a), windRose[0])
  const uvPeak = Math.max(...months.map((m) => m.uvIndex))
  const yearLabel = startYear && endYear ? `${startYear}–${endYear} average` : 'long-term average'

  return (
    <div>
      <div className="climate-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-md)' }}>
        <Stat label="Temperature" value={`${avg('tempMaxC')}° / ${avg('tempMinC')}°`} sub="avg max / min °C" />
        <Stat label="Rainfall" value={`${avg('rainfallMm')} mm`} sub={`${avg('rainDays')} rain days/month`} />
        <Stat label="Sunshine" value={`${avg('sunshineHrs')} h`} sub="average per day" />
        <Stat label="UV index" value={avg('uvIndex')} sub={`peak ${uvPeak}`} />
        <Stat label="Humidity" value={`${avg('humidityPct')}%`} sub="average" />
        <Stat label="Wind" value={`${avg('windSpeedKmh')} km/h`} sub={`mean, prevailing ${prevailing.dir}`} />
      </div>

      <div className="section-foot">
        Source: {source} ({yearLabel})
        {source !== 'Open-Meteo' && ' — live data unavailable, showing offline reference data'}.
        UV index is a modelled clear-sky estimate from solar elevation, not a measured record — it
        doesn't account for cloud cover, so it can read higher than the real value on overcast days.
      </div>
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--canvas)', borderRadius: 'var(--r-sm)', padding: 'var(--s-md)' }}>
      <div style={{ fontSize: 12, color: 'var(--body-muted)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 500, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--body-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

function round1(n) {
  return Math.round(n * 10) / 10
}
