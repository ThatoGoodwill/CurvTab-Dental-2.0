import { useState } from 'react'
import type { ReactNode } from 'react'
import './PracticeBrandMark.css'

type Props = {
  src?: string | null
  alt: string
  fallback: ReactNode
}

export default function PracticeBrandMark({
  src,
  alt,
  fallback,
}: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  if (!src || failedUrl === src) {
    return <span className="ct-brand-fallback">{fallback}</span>
  }

  return (
    <img
      className="ct-practice-brand-image"
      src={src}
      alt={`${alt} logo`}
      decoding="async"
      onError={() => setFailedUrl(src)}
    />
  )
}
