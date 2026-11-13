import type { ImageRead } from '@taha/cms-config'

/**
 * An Image read as an `<img>`: srcset and sizes, width and height (so the box is reserved before
 * it loads), alt, and the focal point as `object-position` for crops. Lazy unless `priority`.
 */
export function Picture({
  image,
  sizes,
  className,
  priority = false,
}: {
  image: ImageRead
  /** The `sizes` attribute: how wide the image shows at each viewport width. */
  sizes: string
  className?: string
  priority?: boolean
}) {
  return (
    // A plain <img>: the CMS already makes the WebP sizes (ADR-0005), so next/image has no work.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.src}
      srcSet={image.srcset || undefined}
      sizes={image.srcset ? sizes : undefined}
      width={image.width}
      height={image.height}
      alt={image.alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      data-melt=""
      className={className}
      style={{ objectPosition: `${image.focalPoint.x}% ${image.focalPoint.y}%` }}
    />
  )
}
