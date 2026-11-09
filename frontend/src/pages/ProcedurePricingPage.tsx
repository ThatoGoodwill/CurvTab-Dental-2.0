
import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, X, History, Search } from 'lucide-react'
import { apiRequest } from '../services/api'
import './ProcedurePricingPage.css'

type ProcedurePrice = {
  id: string
  code: string
  name: string
  category: string
  price: number
  isActive: boolean
  createdAtUtc: string
  updatedAtUtc: string
}

type PriceHistory = {
  action: string
  code: string
  name: string
  previousPrice: number | null
  newPrice: number
  isActive: boolean
  changedAtUtc: string
}

type Draft = {
  code: string
  name: string
  category: string
  price: string
  isActive: boolean
}

const emptyDraft: Draft = {
  code: '',
  name: '',
  category: 'General',
  price: '',
  isActive: true
}

const money = (value: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR'
  }).format(value)

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Unable to complete the request.'
}

export default function ProcedurePricingPage() {
  const [rows, setRows] = useState<ProcedurePrice[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')

  const [editing, setEditing] =
    useState<ProcedurePrice | null>(null)

  const [showEditor, setShowEditor] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [history, setHistory] = useState<PriceHistory[] | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await apiRequest<ProcedurePrice[]>(
        '/practice/procedure-prices'
      )
      setRows(result)
      setError('')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function add() {
    setEditing(null)
    setDraft(emptyDraft)
    setShowEditor(true)
    setNotice('')
    setError('')
  }

  function edit(item: ProcedurePrice) {
    setEditing(item)
    setDraft({
      code: item.code,
      name: item.name,
      category: item.category,
      price: item.price.toFixed(2),
      isActive: item.isActive
    })
    setShowEditor(true)
    setNotice('')
    setError('')
  }

  async function save() {
    if (saving) return

    const price = draft.price.trim()

    if (
      !draft.code.trim() ||
      !draft.name.trim() ||
      !/^(?:\d+)(?:\.\d{1,2})?$/.test(price) ||
      Number(price) <= 0 ||
      Number(price) > 10000000
    ) {
      setError(
        'Enter a code, procedure name and valid positive ZAR price.'
      )
      return
    }

    setSaving(true)
    setError('')
    setNotice('')

    try {
      const payload = {
        code: draft.code.trim(),
        name: draft.name.trim(),
        category: draft.category.trim() || 'General',
        price: Number(price),
        isActive: draft.isActive,
        expectedUpdatedAtUtc: editing?.updatedAtUtc ?? null
      }

      if (editing) {
        await apiRequest(
          `/practice/procedure-prices/${encodeURIComponent(editing.id)}`,
          'PUT',
          payload
        )
      } else {
        await apiRequest(
          '/practice/procedure-prices',
          'POST',
          payload
        )
      }

      setShowEditor(false)
      setEditing(null)
      setNotice('Procedure pricing saved successfully.')
      await load()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  async function viewHistory(item: ProcedurePrice) {
    setError('')
    try {
      const result = await apiRequest<PriceHistory[]>(
        `/practice/procedure-prices/${encodeURIComponent(item.id)}/history`
      )
      setHistory(result)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  const filtered = rows.filter(item =>
    `${item.code} ${item.name} ${item.category}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  return (
    <div className="ct-pricing-v1">
      <header className="ct-pricing-header">
        <div>
          <h2>Procedure Pricing</h2>
          <p>Approved practice fees in South African Rand.</p>
        </div>
        <button type="button" className="ct-pricing-primary"
          onClick={add}>
          <Plus size={15} /> Add Procedure
        </button>
      </header>

      {error && (
        <p className="ct-pricing-error" role="alert">{error}</p>
      )}
      {notice && (
        <p className="ct-pricing-notice" role="status">{notice}</p>
      )}

      <div className="ct-pricing-search">
        <Search size={15} />
        <input
          aria-label="Search procedures"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search by procedure, code or category"
        />
      </div>

      <div className="ct-pricing-table-wrap">
        <table className="ct-pricing-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Procedure</th>
              <th>Price (ZAR)</th>
              <th>Status</th>
              <th>Manage</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id}>
                <td>{item.code}</td>
                <td>
                  <strong>{item.name}</strong>
                  <small>{item.category}</small>
                </td>
                <td>{money(item.price)}</td>
                <td>
                  <span className={
                    'ct-pricing-status ' +
                    (item.isActive ? 'active' : 'inactive')
                  }>
                    {item.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <div className="ct-pricing-actions">
                    <button type="button" onClick={() => edit(item)}
                      aria-label={'Edit ' + item.name}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" onClick={() =>
                      void viewHistory(item)}
                      aria-label={'Price history for ' + item.name}>
                      <History size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="ct-pricing-empty">
                  {rows.length
                    ? 'No matching procedures.'
                    : 'No prices configured yet. Add your first procedure.'}
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={5} className="ct-pricing-empty">
                  Loading prices…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showEditor && (
        <div className="ct-pricing-overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget && !saving)
              setShowEditor(false)
          }}>
          <div className="ct-pricing-dialog" role="dialog"
            aria-modal="true"
            aria-label={editing ? 'Edit procedure' : 'Add procedure'}>
            <header>
              <h3>{editing ? 'Edit Procedure' : 'Add Procedure'}</h3>
              <button type="button" disabled={saving}
                aria-label="Close procedure editor"
                onClick={() => setShowEditor(false)}>
                <X size={16} />
              </button>
            </header>

            <div className="ct-pricing-fields">
              <label>Procedure code
                <input maxLength={40} value={draft.code}
                  onChange={event => setDraft(prev => ({
                    ...prev, code: event.target.value
                  }))} placeholder="e.g. CONS-001" />
              </label>

              <label>Procedure name
                <input maxLength={160} value={draft.name}
                  onChange={event => setDraft(prev => ({
                    ...prev, name: event.target.value
                  }))} placeholder="Procedure name" />
              </label>

              <label>Category
                <input maxLength={80} value={draft.category}
                  onChange={event => setDraft(prev => ({
                    ...prev, category: event.target.value
                  }))} placeholder="General" />
              </label>

              <label>Approved price (ZAR)
                <input inputMode="decimal" value={draft.price}
                  onChange={event => setDraft(prev => ({
                    ...prev, price: event.target.value
                  }))} placeholder="0.00" />
              </label>

              <label className="ct-pricing-checkbox">
                <input type="checkbox" checked={draft.isActive}
                  onChange={event => setDraft(prev => ({
                    ...prev, isActive: event.target.checked
                  }))} />
                Active procedure
              </label>
            </div>

            <footer>
              <button type="button" disabled={saving}
                onClick={() => setShowEditor(false)}>
                Cancel
              </button>
              <button type="button" className="ct-pricing-primary"
                disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save Procedure'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {history !== null && (
        <div className="ct-pricing-overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget)
              setHistory(null)
          }}>
          <div className="ct-pricing-dialog" role="dialog"
            aria-modal="true" aria-label="Procedure price history">
            <header>
              <h3>Price History</h3>
              <button type="button"
                aria-label="Close price history"
                onClick={() => setHistory(null)}>
                <X size={16} />
              </button>
            </header>
            <div className="ct-pricing-history">
              {history.length === 0 && <p>No changes recorded.</p>}
              {history.map((item, index) => (
                <div key={index}>
                  <strong>{item.action}: {item.name}</strong>
                  <span>
                    {item.previousPrice === null
                      ? 'Initial price'
                      : money(item.previousPrice)}
                    {' → '}{money(item.newPrice)}
                  </span>
                  <small>
                    {new Date(item.changedAtUtc).toLocaleString('en-ZA')}
                  </small>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
