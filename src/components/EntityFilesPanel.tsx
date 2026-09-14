import { useRef, useState } from 'react'
import { Download, FileText, Loader2, Paperclip, Trash2, Upload } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import {
  createSignedFileUrl,
  formatFileSize,
  type CrmFileRecord,
} from '../lib/files'
import { useCrmFiles } from '../hooks/useCrmFiles'

interface EntityFilesPanelProps {
  clientId?: string
  propertyId?: string
  title?: string
  compact?: boolean
}

const EntityFilesPanel = ({ clientId, propertyId, title = 'Документы', compact = false }: EntityFilesPanelProps) => {
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const { data: files = [], isPending: loading, error: queryError, uploadFiles, removeFile, uploading } = useCrmFiles({ userId: user?.id, bucket: 'crm-documents', clientId, propertyId })
  const loadError = queryError instanceof Error ? queryError.message : queryError ? 'Не удалось загрузить документы' : ''

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || [])
    if (!user || selected.length === 0) return
    setError('')
    try {
      await uploadFiles(selected, propertyId ? 'Документы объекта' : clientId ? 'Документы клиента' : 'Общие документы')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Не удалось загрузить документы')
    } finally {
      event.target.value = ''
    }
  }

  const download = async (file: CrmFileRecord) => {
    try {
      const url = await createSignedFileUrl(file)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Не удалось открыть документ')
    }
  }

  const remove = async (file: CrmFileRecord) => {
    try {
      await removeFile(file)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить документ')
    }
  }

  return (
    <section className={compact ? 'space-y-3' : 'lumi-panel rounded-2xl border p-6'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="lumi-text flex items-center gap-2 text-lg font-semibold"><Paperclip className="h-5 w-5" />{title}</h3>
          <p className="lumi-muted mt-1 text-sm">Доступ только из вашего аккаунта · до 25 МБ на файл</p>
        </div>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="lumi-gradient-button inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'Загружаем…' : 'Загрузить'}
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={upload} accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.jpg,.jpeg,.png,.webp" />
      </div>

      {(error || loadError) && <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error || loadError}</p>}
      {loading ? (
        <div className="lumi-muted flex items-center gap-2 py-6"><Loader2 className="h-5 w-5 animate-spin" />Загрузка документов…</div>
      ) : files.length === 0 ? (
        <div className="lumi-panel-muted lumi-muted mt-4 flex flex-col items-center rounded-xl border px-4 py-8 text-center">
          <FileText className="mb-2 h-9 w-9" />
          <span>Документов пока нет</span>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {files.map(file => (
            <div key={file.id} className="lumi-panel-muted flex items-center gap-3 rounded-xl border p-3">
              <div className="lumi-accent-soft rounded-lg p-2"><FileText className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <p className="lumi-text truncate text-sm font-semibold">{file.name}</p>
                <p className="lumi-muted text-xs">{formatFileSize(file.size_bytes)} · {new Date(file.created_at).toLocaleDateString('ru-RU')}</p>
              </div>
              <button type="button" onClick={() => void download(file)} className="lumi-control rounded-lg p-2" title="Открыть"><Download className="h-4 w-4" /></button>
              <button type="button" onClick={() => void remove(file)} className="rounded-lg bg-red-500/10 p-2 text-red-500" title="Удалить"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default EntityFilesPanel
