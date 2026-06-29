// Single source of truth for the Sun & climate tab's date/time selection.
// Lifted to App so both the panel controls (date buttons, time scrubber,
// standalone diagram) and the live map overlay (sun-path lines + the
// scrubber-driven current-position marker) stay in sync off one state.
import { useMemo, useState } from 'react'
import { getDayArc, getSydneyNow, sunPositionAtClockTime, SEASON_DATES } from '../lib/sunPosition.js'

export function useSunPath(center) {
  const [dateKey, setDateKey] = useState('equinox')
  const [scrubMinutes, setScrubMinutes] = useState(12 * 60)

  const year = useMemo(() => new Date().getFullYear(), [])
  const sydneyNow = useMemo(() => getSydneyNow(), [])
  const [lng, lat] = center || [null, null]

  const ymd = useMemo(() => {
    if (dateKey === 'live') return { year: sydneyNow.year, month: sydneyNow.month, day: sydneyNow.day }
    if (dateKey === 'year') return null
    const s = SEASON_DATES[dateKey]
    return { year, month: s.month, day: s.day }
  }, [dateKey, year, sydneyNow])

  const summerArc = useMemo(
    () => (center ? getDayArc(year, SEASON_DATES.summer.month, SEASON_DATES.summer.day, lat, lng) : []),
    [year, lat, lng, center]
  )
  const winterArc = useMemo(
    () => (center ? getDayArc(year, SEASON_DATES.winter.month, SEASON_DATES.winter.day, lat, lng) : []),
    [year, lat, lng, center]
  )
  const equinoxArc = useMemo(
    () => (center ? getDayArc(year, SEASON_DATES.equinox.month, SEASON_DATES.equinox.day, lat, lng) : []),
    [year, lat, lng, center]
  )

  const activeArc = useMemo(() => {
    if (!center || dateKey === 'year' || !ymd) return null
    if (dateKey === 'summer') return summerArc
    if (dateKey === 'winter') return winterArc
    if (dateKey === 'equinox') return equinoxArc
    return getDayArc(ymd.year, ymd.month, ymd.day, lat, lng)
  }, [dateKey, ymd, summerArc, winterArc, equinoxArc, lat, lng, center])

  const scrubBounds = useMemo(() => {
    if (!activeArc || activeArc.length === 0) return { min: 6 * 60, max: 18 * 60 }
    return { min: activeArc[0].minute, max: activeArc[activeArc.length - 1].minute }
  }, [activeArc])

  const effectiveMinutes =
    dateKey === 'live'
      ? sydneyNow.minute
      : Math.min(Math.max(scrubMinutes, scrubBounds.min), scrubBounds.max)

  const current = useMemo(() => {
    if (!center || dateKey === 'year' || !ymd) return null
    return sunPositionAtClockTime(ymd.year, ymd.month, ymd.day, effectiveMinutes, lat, lng)
  }, [dateKey, ymd, effectiveMinutes, lat, lng, center])

  return {
    dateKey, setDateKey,
    scrubMinutes, setScrubMinutes,
    effectiveMinutes,
    scrubBounds,
    summerArc, winterArc, equinoxArc,
    current,
    showScrubber: dateKey !== 'year',
  }
}
