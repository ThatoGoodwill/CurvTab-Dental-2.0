import type { SVGProps } from 'react'

/**
 * Currency glyph for the South African practice: R, never a dollar sign.
 * Use wherever a money icon is needed in Billing or Finance.
 */
type RandIconProps = Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & {
  size?: number
}

export default function RandIcon({ size = 20, ...props }: RandIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="4.5" />
      <text
        x="12"
        y="16.3"
        fill="currentColor"
        stroke="none"
        fontSize="13.5"
        fontWeight="800"
        fontFamily="Arial, sans-serif"
        textAnchor="middle"
      >
        R
      </text>
    </svg>
  )
}
