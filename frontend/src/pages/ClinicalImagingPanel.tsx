import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ImagePlus, Eye, X, RefreshCw } from 'lucide-react'
import { apiRequest } from '../services/api'
import './ClinicalImagingPanel.css'

type ClinicalImage = {
  id: string
  patientId: string
  orthodonticCaseId: string | null
  imageType: string
  originalFileName: string
  contentType: string
  sizeBytes: number
  uploadedAtUtc: string
  uploadedByUserId: string
}

type Props = {
  patientId: string
  orthodonticCaseId?: string | null
}

export default function ClinicalImagingPanel({
  patientId,
  orthodonticCaseId,
}: Props) {
  const [images, setImages] = useState<ClinicalImage[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [imageType, setImageType] = useState('Photo')
  const [linkToCase, setLinkToCase] = useState(Boolean(orthodonticCaseId))
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [reload, setReload] = useState(0)
  const [preview, setPreview] = useState<{
    url: string
    name: string
  } | null>(null)

  const previewUrl = useRef<string | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const endpoint =
    `/dentist/patients/${encodeURIComponent(patientId)}/images`

  useEffect(() => {
    let active = true

    apiRequest<ClinicalImage[]>(endpoint)
      .then(rows => {
        if (!active) return
        setImages(rows)
        setError('')
      })
      .catch(cause => {
        if (!active) return
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load patient images.'
        )
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [endpoint, reload])

  useEffect(() => {
    return () => {
      if (previewUrl.current) {
        URL.revokeObjectURL(previewUrl.current)
      }
    }
  }, [])

  function closePreview() {
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = null
    }
    setPreview(null)
  }

  async function viewImage(image: ClinicalImage) {
    setError('')
    closePreview()

    try {
      const response = await fetch(
        `/api${endpoint}/${encodeURIComponent(image.id)}/file`,
        {
          credentials: 'include',
          cache: 'no-store',
        }
      )

      if (!response.ok) {
        throw new Error(`Unable to open image (${response.status}).`)
      }

      const contentType = response.headers.get('content-type') || ''
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) {
        throw new Error('The server returned an unsupported image type.')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)

      previewUrl.current = url
      setPreview({
        url,
        name: image.originalFileName,
      })
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Image preview failed.'
      )
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!file || busy) return

    if (file.size === 0 || file.size > 10_000_000) {
      setError('Choose an image smaller than 10 MB.')
      return
    }

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Only PNG, JPEG and WebP files are supported.')
      return
    }

    setBusy(true)
    setError('')
    setSuccess('')

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('imageType', imageType)

      if (orthodonticCaseId && linkToCase) {
        form.append('orthodonticCaseId', orthodonticCaseId)
      }

      const response = await fetch(`/api${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: form,
      })

      if (!response.ok) {
        let message = `Upload failed (${response.status}).`

        try {
          const result = await response.json() as {
            message?: string
            title?: string
          }
          message = result.message || result.title || message
        } catch {
          // Keep the HTTP error when no JSON message is returned.
        }

        throw new Error(message)
      }

      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      setSuccess('Clinical image uploaded successfully.')
      setLoading(true)
      setReload(value => value + 1)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to upload image.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel ct-imaging-panel">
      <div className="ct-imaging-heading">
        <div>
          <h2>Clinical Imaging</h2>
          <p>Private patient photographs and radiographs</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={loading}
          onClick={() => {
            setLoading(true)
            setReload(value => value + 1)
          }}
        >
          <RefreshCw size={16}/> Refresh
        </button>
      </div>

      {error && <p role="alert" className="ct-imaging-error">{error}</p>}
      {success && <p role="status" className="ct-imaging-success">{success}</p>}

      <form className="ct-imaging-form" onSubmit={event => void upload(event)}>
        <label>
          Image category
          <select
            value={imageType}
            onChange={event => setImageType(event.target.value)}
          >
            <option value="Photo">Clinical photograph</option>
            <option value="Radiograph">Radiograph</option>
            <option value="Other">Other clinical image</option>
          </select>
        </label>

        <label>
          Select image
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={event =>
              setFile(event.currentTarget.files?.[0] ?? null)
            }
          />
        </label>

        {orthodonticCaseId && (
          <label className="ct-imaging-checkbox">
            <input
              type="checkbox"
              checked={linkToCase}
              onChange={event => setLinkToCase(event.target.checked)}
            />
            Link image to selected orthodontic case
          </label>
        )}

        <button
          type="submit"
          className="primary-button"
          disabled={!file || busy}
        >
          <ImagePlus size={17}/>
          {busy ? 'Uploading…' : 'Upload clinical image'}
        </button>
      </form>

      <p className="ct-imaging-note">
        Protected clinical files. PNG, JPEG or WebP, maximum 10 MB.
        DICOM files are not supported in this version.
      </p>

      <div className="ct-imaging-list">
        <h3>Saved patient images</h3>

        {loading ? (
          <p>Loading imaging records…</p>
        ) : images.length === 0 ? (
          <p>No images recorded for this patient.</p>
        ) : (
          images.map(image => (
            <article className="ct-imaging-item" key={image.id}>
              <div>
                <strong>{image.originalFileName}</strong>
                <span>
                  {image.imageType} ·
                  {' '}{(image.sizeBytes / 1024).toFixed(0)} KB
                </span>
                <small>
                  {new Date(image.uploadedAtUtc).toLocaleString('en-ZA')}
                  {image.orthodonticCaseId ? ' · Orthodontics' : ''}
                </small>
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => void viewImage(image)}
              >
                <Eye size={16}/> View
              </button>
            </article>
          ))
        )}
      </div>

      {preview && (
        <div className="ct-imaging-preview">
          <div className="ct-imaging-preview-heading">
            <strong>{preview.name}</strong>
            <button
              type="button"
              className="secondary-button"
              onClick={closePreview}
              aria-label="Close image preview"
            >
              <X size={17}/> Close
            </button>
          </div>
          <img src={preview.url} alt={preview.name}/>
        </div>
      )}
    </section>
  )
}
