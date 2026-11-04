import { useState } from 'react'
import { apiRequest } from '../services/api'
import type { PracticeAppearance } from '../hooks/usePracticeAppearance'
import './PracticeBrandAssetsEditor.css'

type Kind = 'logo' | 'badge'
type Assets = {
  logoUrl: string | null
  badgeUrl: string | null
}

type Props = {
  appearance: PracticeAppearance
  onSaved: (value: PracticeAppearance) => void
}

export default function PracticeBrandAssetsEditor({
  appearance,
  onSaved,
}: Props) {
  const [assets, setAssets] = useState<Assets>({
    logoUrl: appearance.logoUrl ?? null,
    badgeUrl: appearance.badgeUrl ?? null,
  })
  const [uploading, setUploading] = useState<Kind | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function upload(kind: Kind, file?: File) {
    if (!file) return

    if (file.size > 2_500_000) {
      setError('Choose an image smaller than 2.5 MB.')
      return
    }

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Only PNG, JPEG and WebP images are supported.')
      return
    }

    setUploading(kind)
    setError('')
    setSuccess('')

    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('Unable to read the image.'))
        reader.onload = () => {
          const result = String(reader.result)
          resolve(result.substring(result.indexOf(',') + 1))
        }
        reader.readAsDataURL(file)
      })

      const result = await apiRequest<{ url: string }>(
        '/practice/media',
        'POST',
        { kind, data }
      )

      setAssets(previous => ({
        ...previous,
        [kind === 'logo' ? 'logoUrl' : 'badgeUrl']: result.url,
      }))
      setDirty(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed.')
    } finally {
      setUploading(null)
    }
  }

  function remove(kind: Kind) {
    setAssets(previous => ({
      ...previous,
      [kind === 'logo' ? 'logoUrl' : 'badgeUrl']: null,
    }))
    setDirty(true)
    setSuccess('')
  }

  async function save() {
    if (!dirty || saving || uploading) return

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const result = await apiRequest<Assets>(
        '/practice/branding-assets',
        'PUT',
        assets
      )

      setAssets(result)
      setDirty(false)
      onSaved({ ...appearance, ...result })
      setSuccess('Practice logo and badge saved successfully.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save branding.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel ct-brand-assets">
      <h2>Practice logo & badge</h2>
      <p>
        Choose the images that represent your practice.
        Changes apply to your practice only.
      </p>

      <div className="ct-brand-assets-grid">
        {(['logo', 'badge'] as const).map(kind => {
          const url = kind === 'logo' ? assets.logoUrl : assets.badgeUrl

          return (
            <div className="ct-brand-asset" key={kind}>
              <h3>{kind === 'logo' ? 'Practice logo' : 'Practice badge'}</h3>
              <p>
                {kind === 'logo'
                  ? 'Use your clinic name and official logo artwork.'
                  : 'Use a small square icon or symbol.'}
              </p>

              <div className="ct-brand-asset-preview">
                {url ? (
                  <img
                    src={url}
                    alt={`${kind} preview`}
                  />
                ) : (
                  <span>No {kind} selected</span>
                )}
              </div>

              <label>
                Upload {kind}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading !== null || saving}
                  onChange={event => {
                    const file = event.currentTarget.files?.[0]
                    void upload(kind, file)
                    event.currentTarget.value = ''
                  }}
                />
              </label>

              <button
                type="button"
                className="secondary-button"
                disabled={!url || uploading !== null || saving}
                onClick={() => remove(kind)}
              >
                Remove {kind}
              </button>

              {uploading === kind && <p>Uploading image…</p>}
            </div>
          )
        })}
      </div>

      {error && <p role="alert" className="slides-error">{error}</p>}
      {success && <p role="status" className="slides-success">{success}</p>}

      <button
        type="button"
        className="primary-button"
        disabled={!dirty || saving || uploading !== null}
        onClick={() => void save()}
      >
        {saving ? 'Saving branding…' : 'Save logo & badge'}
      </button>

      <p className="appearance-note">
        PNG, JPEG or WebP only, maximum 2.5 MB per image.
        Upload only public practice branding, never patient images.
      </p>
    </section>
  )
}
