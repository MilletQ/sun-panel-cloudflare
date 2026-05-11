type CompressImageFileOptions = {
  maxWidth: number
  maxHeight: number
  quality?: number
}

type LoadedImage = {
  element: HTMLImageElement
  width: number
  height: number
  release: () => void
}

const compressibleMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

const mimeTypeByExt: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

const extByMimeType: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

export async function compressImageFile(file: File, options: CompressImageFileOptions) {
  const sourceType = getImageMimeType(file)

  // Keep vector, animated, and icon-container files unchanged.
  if (!sourceType || !compressibleMimeTypes.has(sourceType))
    return file

  const image = await loadImage(file)
  const scale = Math.min(options.maxWidth / image.width, options.maxHeight / image.height, 1)

  if (scale >= 1) {
    image.release()
    return file
  }

  const targetWidth = Math.max(1, Math.round(image.width * scale))
  const targetHeight = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    image.release()
    return file
  }

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image.element, 0, 0, targetWidth, targetHeight)

  const blob = await canvasToBlob(canvas, sourceType, options.quality ?? 0.86)
  image.release()

  if (!blob || blob.size >= file.size)
    return file

  return new File([blob], replaceExt(file.name, extByMimeType[sourceType]), {
    type: sourceType,
    lastModified: file.lastModified,
  })
}

function getImageMimeType(file: File) {
  if (compressibleMimeTypes.has(file.type))
    return file.type

  const ext = getExt(file.name)
  return mimeTypeByExt[ext] || ''
}

function getExt(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ''
}

function replaceExt(fileName: string, ext: string) {
  const dotIndex = fileName.lastIndexOf('.')
  const baseName = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName
  return `${baseName}${ext}`
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality)
  })
}

function loadImage(file: File) {
  return new Promise<LoadedImage>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      resolve({
        element: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      })
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    image.src = url
  })
}
