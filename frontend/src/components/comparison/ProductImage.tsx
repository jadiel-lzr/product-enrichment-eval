import { useMemo, useState } from 'react'

interface ProductImageProps {
  readonly images: readonly string[]
  readonly sku: string
  readonly alt: string
}

function ImagePlaceholder() {
  return (
    <div className="flex h-48 w-full flex-col items-center justify-center gap-2 rounded-xl bg-gray-100 text-gray-400">
      <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      <span className="text-sm font-medium">No image</span>
    </div>
  )
}

export function ProductImage({ images, sku, alt }: ProductImageProps) {
  const [attempt, setAttempt] = useState(0)

  const sources = useMemo(() => {
    const primary = images[0]
    return [primary, `/images/${sku}_0.jpg`].filter(
      (value): value is string => Boolean(value),
    )
  }, [images, sku])

  if (sources.length === 0 || attempt >= sources.length) {
    return <ImagePlaceholder />
  }

  return (
    <div className="overflow-hidden rounded-xl bg-gray-100">
      <img
        src={sources[attempt]}
        alt={alt}
        className="h-48 w-full object-contain"
        onError={() => setAttempt((current) => current + 1)}
      />
    </div>
  )
}
