import { FileText, ShieldCheck } from 'lucide-react'
import EntityFilesPanel from '../components/EntityFilesPanel'

const DocumentsPage = () => (
  <div className="space-y-6">
    <div>
      <h1 className="lumi-text text-3xl font-bold">Документы</h1>
      <p className="lumi-muted mt-2 max-w-3xl">
        Общий архив офиса. Документы, загруженные из карточек собственников и объектов,
        также отображаются здесь.
      </p>
    </div>

    <div className="lumi-panel-muted lumi-border flex items-start gap-3 rounded-2xl border p-4">
      <ShieldCheck className="lumi-accent-text mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="lumi-text font-medium">Защищённые документы</p>
        <p className="lumi-muted text-sm">
          Файлы доступны только из вашего аккаунта и открываются по временной защищённой ссылке.
        </p>
      </div>
      <FileText className="lumi-muted ml-auto hidden h-6 w-6 sm:block" />
    </div>

    <EntityFilesPanel title="Все документы офиса" />
  </div>
)

export default DocumentsPage
