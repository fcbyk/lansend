import { useCallback, useMemo, useState } from 'react'

import { getFileContent } from '../api'
import { isVideoFileName } from '../utils/files'
import type { DirectoryItem, PreviewFile } from '../types'

function isVideoFile(file: Pick<PreviewFile, 'name' | 'is_video'>) {
  if (typeof file.is_video === 'boolean') return file.is_video
  return isVideoFileName(file.name)
}

function isImageFile(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.bmp') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.tiff') ||
    lower.endsWith('.tif')
  )
}

export function useLansendPreview() {
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewVideoLoading, setPreviewVideoLoading] = useState(false)
  const [imageFiles, setImageFiles] = useState<DirectoryItem[]>([])
  const [currentImageIndex, setCurrentImageIndex] = useState(-1)

  const setupImageList = useCallback((items: DirectoryItem[], currentPath: string) => {
    const images = items.filter((item) => !item.is_dir && isImageFile(item.name))
    setImageFiles(images)

    const index = images.findIndex((img) => img.path === currentPath)
    setCurrentImageIndex(index >= 0 ? index : -1)
  }, [])

  const previewFileContent = useCallback(
    async (path: string, name: string, allItems?: DirectoryItem[]) => {
      setPreviewLoading(true)
      setPreviewError('')
      setPreviewFile({ path, name })
      setPreviewVideoLoading(false)

      try {
        const fileData = await getFileContent(path)
        setPreviewFile(fileData)

        if (isVideoFile(fileData)) {
          setPreviewVideoLoading(true)
        }

        if (allItems) {
          setupImageList(allItems, path)
        }
      } catch (err) {
        console.error('加载文件失败:', err)
        setPreviewError('无法加载文件内容')
        setPreviewFile({
          path,
          name,
          error: '无法加载文件内容',
        })
        setPreviewVideoLoading(false)
      } finally {
        setPreviewLoading(false)
      }
    },
    [setupImageList],
  )

  const prevImage = useCallback(() => {
    if (imageFiles.length === 0 || currentImageIndex <= 0) return

    const newIndex = currentImageIndex - 1
    const prevImageFile = imageFiles[newIndex]
    setCurrentImageIndex(newIndex)
    void previewFileContent(prevImageFile.path, prevImageFile.name, imageFiles)
  }, [currentImageIndex, imageFiles, previewFileContent])

  const nextImage = useCallback(() => {
    if (imageFiles.length === 0 || currentImageIndex >= imageFiles.length - 1) return

    const newIndex = currentImageIndex + 1
    const nextImageFile = imageFiles[newIndex]
    setCurrentImageIndex(newIndex)
    void previewFileContent(nextImageFile.path, nextImageFile.name, imageFiles)
  }, [currentImageIndex, imageFiles, previewFileContent])

  const closePreview = useCallback(() => {
    setPreviewFile(null)
    setPreviewError('')
    setPreviewVideoLoading(false)
    setImageFiles([])
    setCurrentImageIndex(-1)
  }, [])

  const onPreviewVideoLoaded = useCallback(() => {
    setPreviewVideoLoading(false)
  }, [])

  const onPreviewVideoError = useCallback(() => {
    setPreviewVideoLoading(false)
  }, [])

  const canGoPrev = useMemo(() => currentImageIndex > 0, [currentImageIndex])
  const canGoNext = useMemo(
    () => currentImageIndex < imageFiles.length - 1 && currentImageIndex >= 0,
    [currentImageIndex, imageFiles.length],
  )

  return {
    previewFile,
    previewLoading,
    previewError,
    previewVideoLoading,
    previewFileContent,
    closePreview,
    onPreviewVideoLoaded,
    onPreviewVideoError,
    prevImage,
    nextImage,
    canGoPrev,
    canGoNext,
    currentImageIndex,
    imageFiles,
  }
}
