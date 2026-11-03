// Small dependency-free SVG charts used by the overview dashboard.

export type Slice = {
  label: string
  value: number
  color: string
}

type DonutProps = {
  slices: Slice[]
  centerValue: string
  centerLabel: string
}

export function Donut({ slices, centerValue, centerLabel }: DonutProps) {
  const size = 170
  const stroke = 26
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1
  const gap = 2
  let offset = 0

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Appointments by status"
    >
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {slices.map((slice) => {
          const length = (slice.value / total) * circumference
          const drawn = Math.max(length - gap, 0)
          const circle = (
            <circle
              key={slice.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={stroke}
              strokeDasharray={`${drawn} ${circumference - drawn}`}
              strokeDashoffset={-offset}
            />
          )
          offset += length
          return circle
        })}
      </g>
      <text x="50%" y="47%" textAnchor="middle" className="ov-donut-value">
        {centerValue}
      </text>
      <text x="50%" y="60%" textAnchor="middle" className="ov-donut-label">
        {centerLabel}
      </text>
    </svg>
  )
}

type LineChartProps = {
  labels: string[]
  values: number[]
}

/** Picks a tidy axis (at most four steps) for the largest value. */
function niceAxis(maxValue: number): { max: number; step: number } {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]
  const step = steps.find((candidate) => maxValue / candidate <= 4) ?? 10000
  return { max: Math.max(step, Math.ceil(maxValue / step) * step), step }
}

export function LineChart({ labels, values }: LineChartProps) {
  const width = 520
  const height = 190
  const pad = { left: 36, right: 14, top: 12, bottom: 26 }
  const innerWidth = width - pad.left - pad.right
  const innerHeight = height - pad.top - pad.bottom
  const { max, step } = niceAxis(Math.max(...values, 1))

  const x = (index: number) =>
    pad.left + (values.length <= 1 ? innerWidth / 2 : (index / (values.length - 1)) * innerWidth)
  const y = (value: number) => pad.top + innerHeight - (value / max) * innerHeight

  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ')
  const area = `${pad.left},${pad.top + innerHeight} ${points} ${x(values.length - 1)},${pad.top + innerHeight}`
  const ticks: number[] = []
  for (let tick = 0; tick <= max; tick += step) ticks.push(tick)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Appointments per month">
      <defs>
        <linearGradient id="ovTrendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#e8edf6" />
          <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="ov-axis">
            {tick}
          </text>
        </g>
      ))}
      <polygon points={area} fill="url(#ovTrendFill)" />
      <polyline points={points} fill="none" stroke="#4f46e5" strokeWidth={2.4} strokeLinejoin="round" />
      {values.map((value, index) => (
        <circle key={index} cx={x(index)} cy={y(value)} r={4.2} fill="#fff" stroke="#4f46e5" strokeWidth={2.2} />
      ))}
      {labels.map((label, index) => (
        <text key={`${label}-${index}`} x={x(index)} y={height - 6} textAnchor="middle" className="ov-axis">
          {label}
        </text>
      ))}
    </svg>
  )
}
