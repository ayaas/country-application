const SIZE = 280
const CENTER = SIZE / 2
const RADIUS = SIZE / 2 - 24

function polar(azimuthDeg, altitudeDeg) {
  const r = RADIUS * (90 - altitudeDeg) / 90
  const rad = (azimuthDeg * Math.PI) / 180
  return { x: CENTER + r * Math.sin(rad), y: CENTER - r * Math.cos(rad) }
}

function arcPath(points) {
  if (points.length === 0) return ''
  return points
    .map((p, i) => {
      const { x, y } = polar(p.azimuthDeg, p.altitudeDeg)
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

const RING_ALTITUDES = [60, 30, 0]
const COMPASS = [
  { label: 'N', deg: 0 },
  { label: 'E', deg: 90 },
  { label: 'S', deg: 180 },
  { label: 'W', deg: 270 },
]

export default function SunPathDiagram({ summerArc, winterArc, equinoxArc, current, mode }) {
  const showEquinox = mode === 'year' || mode === 'equinox'

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={{ width: '75%', maxWidth: 220, display: 'block', margin: '0 auto', background: 'var(--canvas)', borderRadius: 'var(--r-sm)' }}
      role="img"
    >
      <title>Sun path diagram, north up</title>

      {RING_ALTITUDES.map((alt) => (
        <circle
          key={alt}
          cx={CENTER}
          cy={CENTER}
          r={RADIUS * (90 - alt) / 90}
          fill="none"
          stroke="var(--hairline)"
          strokeWidth="1"
        />
      ))}

      {COMPASS.map(({ label, deg }) => {
        const rad = (deg * Math.PI) / 180
        const x1 = CENTER + RADIUS * Math.sin(rad)
        const y1 = CENTER - RADIUS * Math.cos(rad)
        const lx = CENTER + (RADIUS + 12) * Math.sin(rad)
        const ly = CENTER - (RADIUS + 12) * Math.cos(rad)
        return (
          <g key={label}>
            <line x1={CENTER} y1={CENTER} x2={x1} y2={y1} stroke="var(--hairline)" strokeWidth="1" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="var(--body-muted)">
              {label}
            </text>
          </g>
        )
      })}

      {showEquinox && equinoxArc.length > 0 && (
        <path d={arcPath(equinoxArc)} fill="none" stroke="var(--body-muted)" strokeWidth="1.5" strokeDasharray="4 3" />
      )}
      {summerArc.length > 0 && <path d={arcPath(summerArc)} fill="none" stroke="#BA7517" strokeWidth="2" />}
      {winterArc.length > 0 && <path d={arcPath(winterArc)} fill="none" stroke="#185FA5" strokeWidth="2" />}

      {current && current.altitudeDeg > 0 && (() => {
        const { x, y } = polar(current.azimuthDeg, current.altitudeDeg)
        return <circle cx={x} cy={y} r="5" fill="#D85A30" stroke="white" strokeWidth="1.5" />
      })()}
    </svg>
  )
}
