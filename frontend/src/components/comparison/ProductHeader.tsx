import type { Product } from '@/types/enrichment'
import { OriginalDataSection } from './OriginalDataSection'
import { ProductImage } from './ProductImage'

interface ProductHeaderProps {
  readonly product: Product
}

function Tag({ children }: { readonly children: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
      {children}
    </span>
  )
}

export function ProductHeader({ product }: ProductHeaderProps) {
  return (
    <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="w-full max-w-[220px] shrink-0">
          <ProductImage
            images={product.images}
            sku={product.sku}
            alt={product.name}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-gray-400">
              {product.brand}
            </p>
            <h1 className="text-2xl font-semibold text-gray-900">
              {product.name}
            </h1>
            <p className="font-mono text-sm text-gray-500">{product.sku}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {product.category ? <Tag>{product.category}</Tag> : null}
            {product.department ? <Tag>{product.department}</Tag> : null}
          </div>
        </div>
      </div>

      <OriginalDataSection product={product} />
    </section>
  )
}
