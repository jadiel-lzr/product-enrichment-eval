import type { Product } from '@/types/enrichment'

interface ProductListItemProps {
  readonly product: Product
  readonly isSelected: boolean
  readonly onClick: () => void
  readonly compact?: boolean
}

function ProductThumbnail({
  images,
  name,
  size = 40,
}: {
  readonly images: string[]
  readonly name: string
  readonly size?: number
}) {
  const hasImage = images.length > 0
  const style = { width: size, height: size, minWidth: size, minHeight: size }

  if (!hasImage) {
    return (
      <div
        className="flex items-center justify-center rounded bg-gray-200 text-gray-400"
        style={style}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    )
  }

  return (
    <img
      src={images[0]}
      alt={name}
      className="rounded bg-gray-100 object-cover"
      style={style}
      loading="lazy"
    />
  )
}

export function ProductListItem({
  product,
  isSelected,
  onClick,
  compact = false,
}: ProductListItemProps) {
  if (compact) {
    return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center justify-center rounded p-1 transition-colors ${
          isSelected ? 'bg-blue-50' : 'hover:bg-gray-100'
        }`}
        title={`${product.brand} - ${product.name}`}
      >
        <ProductThumbnail images={product.images} name={product.name} size={32} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-left transition-colors ${
        isSelected
          ? 'border-l-4 border-blue-600 bg-blue-50'
          : 'border-l-4 border-transparent hover:bg-gray-100'
      }`}
    >
      <ProductThumbnail images={product.images} name={product.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-gray-500">{product.brand}</p>
        <p className="truncate text-sm font-medium text-gray-900">
          {product.name}
        </p>
      </div>
    </button>
  )
}
