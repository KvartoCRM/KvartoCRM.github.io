import { useRef, useState } from 'react'
import { Bell, BellRing, Camera, DatabaseBackup, FileJson, LayoutPanelLeft, LockKeyhole, LogOut, Maximize2, Palette, RefreshCw, Save, Settings, Smartphone, Trash2, Upload, UserRound, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth, type IconSize, type InterfaceDensity, type NavigationPosition } from '../context/AuthContext'
import { themeOptions, useTheme } from '../context/ThemeContext'
import { registerPushSubscription } from '../lib/pushNotifications'
import AppDownloadPanel from '../components/AppDownloadPanel'
import { Capacitor } from '@capacitor/core'
import { requestExactAlarmPermission, requestNativeNotificationPermission, syncNativeReminders } from '../lib/nativeReminders'
import { downloadWorkspaceBackup, parseWorkspaceBackup, restoreWorkspaceBackup, summarizeWorkspaceBackup, type WorkspaceBackup, type WorkspaceBackupSummary } from '../lib/workspaceBackup'

const SettingsPage = () => {
  const { user, updatePreferences, updateNotificationPreferences, updateUser, changePassword, updateAvatar, removeAvatar, logout, error: authError, clearError } = useAuth()
  const { theme, setTheme } = useTheme()
  const navigate = useNavigate()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const backupInputRef = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState({ firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', phone: user?.phone ?? '', position: user?.position ?? 'Риелтор' })
  const [savingProfile, setSavingProfile] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => Capacitor.isNativePlatform() ? 'default' : 'Notification' in window ? Notification.permission : 'unsupported')
  const [notificationMessage, setNotificationMessage] = useState('')
  const [backupMessage, setBackupMessage] = useState('')
  const [exportingBackup, setExportingBackup] = useState(false)
  const [selectedBackup, setSelectedBackup] = useState<{ name: string; backup: WorkspaceBackup; summary: WorkspaceBackupSummary } | null>(null)
  const [restoringBackup, setRestoringBackup] = useState(false)
  const [restoreProgress, setRestoreProgress] = useState('')
  const [restoreComplete, setRestoreComplete] = useState(false)
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [accountMessage, setAccountMessage] = useState('')

  if (!user) return null

  const savePreference = async <K extends keyof typeof user.preferences>(key: K, value: typeof user.preferences[K]) => {
    const saved = await updatePreferences({ [key]: value })
    setSavedMessage(saved ? 'Настройки сохранены' : '')
  }

  const saveProfile = async () => {
    clearError()
    setSavingProfile(true)
    await updateUser(profile)
    setSavingProfile(false)
    setSavedMessage('Данные профиля сохранены')
  }

  const selectAvatar = async (file?: File) => {
    if (!file) return
    clearError()
    setAccountMessage('')
    setAvatarSaving(true)
    const saved = await updateAvatar(file)
    setAvatarSaving(false)
    if (saved) setAccountMessage('Аватар обновлён')
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

  const deleteAvatar = async () => {
    clearError()
    setAccountMessage('')
    setAvatarSaving(true)
    const removed = await removeAvatar()
    setAvatarSaving(false)
    if (removed) setAccountMessage('Аватар удалён')
  }

  const savePassword = async () => {
    clearError()
    setAccountMessage('')
    if (newPassword.length < 8) {
      setAccountMessage('Новый пароль должен содержать не менее 8 символов.')
      return
    }
    if (newPassword !== confirmPassword) {
      setAccountMessage('Пароли не совпадают.')
      return
    }
    setPasswordSaving(true)
    const saved = await changePassword(newPassword)
    setPasswordSaving(false)
    if (saved) {
      setNewPassword('')
      setConfirmPassword('')
      setAccountMessage('Пароль изменён')
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const requestNotifications = async () => {
    if (Capacitor.isNativePlatform()) {
      const granted = await requestNativeNotificationPermission()
      setPermission(granted ? 'granted' : 'denied')
      if (granted) {
        const exactAlarms = await requestExactAlarmPermission()
        await updateNotificationPreferences({ enabled: true })
        await syncNativeReminders(user.id)
        setNotificationMessage(exactAlarms
          ? 'Системные уведомления и точные будильники на этом телефоне включены.'
          : 'Уведомления включены. Для точного срабатывания разрешите KvartoCRM будильники и напоминания в настройках Android.')
      } else {
        setNotificationMessage('Разрешите уведомления для KvartoCRM в настройках телефона.')
      }
      return
    }
    if (!('Notification' in window)) return
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === 'granted') {
      await updateNotificationPreferences({ enabled: true })
      try {
        await registerPushSubscription(user.id)
        setNotificationMessage('Push-уведомления на этом устройстве включены.')
      } catch (notificationError) {
        setNotificationMessage(notificationError instanceof Error ? notificationError.message : 'Не удалось создать push-подписку.')
      }
    }
  }

  const exportBackup = async () => {
    setExportingBackup(true)
    setBackupMessage('')
    try {
      const backup = await downloadWorkspaceBackup(user.id)
      const rows = Object.values(backup.tables).reduce((total, table) => total + table.length, 0)
      setBackupMessage(`Резервная копия сохранена: ${rows} записей${backup.warnings.length ? `. Предупреждений: ${backup.warnings.length}` : ''}.`)
    } catch (backupError) {
      setBackupMessage(backupError instanceof Error ? backupError.message : 'Не удалось создать резервную копию.')
    } finally {
      setExportingBackup(false)
    }
  }

  const selectBackup = async (file?: File) => {
    if (!file) return
    setBackupMessage('')
    setRestoreProgress('')
    setRestoreComplete(false)
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('Файл резервной копии больше 50 МБ. Выберите исходный JSON-файл KvartoCRM.')
      const backup = parseWorkspaceBackup(await file.text())
      setSelectedBackup({ name: file.name, backup, summary: summarizeWorkspaceBackup(backup) })
    } catch (backupError) {
      setSelectedBackup(null)
      setBackupMessage(backupError instanceof Error ? backupError.message : 'Не удалось прочитать резервную копию.')
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = ''
    }
  }

  const restoreBackup = async () => {
    if (!selectedBackup) return
    setRestoringBackup(true)
    setBackupMessage('')
    setRestoreComplete(false)
    try {
      const result = await restoreWorkspaceBackup(selectedBackup.backup, user.id, progress => {
        const counter = progress.total > 1 ? ` (${Math.min(progress.completed, progress.total)} из ${progress.total})` : ''
        setRestoreProgress(`${progress.label}${counter}`)
      })
      const details = [
        `${result.importedRows} записей`,
        result.restoredFiles ? `${result.restoredFiles} файлов` : '',
        result.skippedFiles ? `не перенесено файлов: ${result.skippedFiles}` : '',
        result.skippedTables.length ? `служебные разделы пересозданы: ${result.skippedTables.length}` : '',
        result.warnings.length ? `предупреждений: ${result.warnings.length}` : '',
      ].filter(Boolean).join(' · ')
      setBackupMessage(`Копия восстановлена: ${details}.`)
      setRestoreComplete(true)
      setSelectedBackup(null)
    } catch (backupError) {
      setBackupMessage(backupError instanceof Error ? backupError.message : 'Не удалось восстановить резервную копию.')
    } finally {
      setRestoringBackup(false)
      setRestoreProgress('')
    }
  }

  const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) => (
    <button type="button" role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)} className={`relative inline-flex h-8 w-14 shrink-0 rounded-full border-2 border-transparent transition ${value ? 'lumi-accent-bg' : 'lumi-control'}`}>
      <span className={`pointer-events-none inline-block h-7 w-7 rounded-full bg-white shadow transition ${value ? 'translate-x-6' : 'translate-x-0'}`} />
    </button>
  )

  const SelectSetting = <T extends string,>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) => (
    <div>
      <label className="lumi-muted-strong mb-2 block text-sm font-medium">{label}</label>
      <select value={value} onChange={event => onChange(event.target.value as T)} className="lumi-control w-full rounded-xl px-4 py-3 outline-none">
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  )

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="lumi-text text-3xl font-bold">Настройки</h1>
          <p className="lumi-muted mt-2">Параметры сохраняются в вашем облачном профиле.</p>
        </div>
        <Settings className="lumi-muted h-8 w-8" />
      </div>

      {savedMessage && <div className="rounded-xl border border-emerald-700/40 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300">{savedMessage}</div>}

      <section id="account" className="lumi-panel scroll-mt-28 rounded-2xl border p-4 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <UserRound className="lumi-accent-text h-6 w-6" />
          <div><h2 className="lumi-text text-xl font-semibold">Аккаунт и безопасность</h2><p className="lumi-muted text-sm">Аватар, личные данные, пароль и выход из KvartoCRM.</p></div>
        </div>

        <div className="lumi-panel-muted flex flex-col gap-5 rounded-2xl border p-4 sm:flex-row sm:items-center">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="Аватар профиля" className="h-24 w-24 shrink-0 rounded-full object-cover ring-2 ring-[rgb(var(--lumi-accent-rgb)/0.35)]" /> : <div className="lumi-accent-soft flex h-24 w-24 shrink-0 items-center justify-center rounded-full"><UserRound className="h-11 w-11" /></div>}
          <div className="min-w-0 flex-1"><p className="lumi-text truncate text-lg font-semibold">{user.displayName || 'Владелец офиса'}</p><p className="lumi-muted mt-1 truncate text-sm">{user.email}</p><p className="lumi-muted mt-2 text-xs">JPG, PNG или WebP, до 5 МБ.</p></div>
          <div className="flex w-full flex-col gap-2 sm:w-auto">
            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => void selectAvatar(event.target.files?.[0])} />
            <button type="button" disabled={avatarSaving} onClick={() => avatarInputRef.current?.click()} className="lumi-control inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"><Camera className="h-4 w-4" />{avatarSaving ? 'Сохраняем…' : user.avatarUrl ? 'Заменить фото' : 'Добавить фото'}</button>
            {user.avatarPath && <button type="button" disabled={avatarSaving} onClick={() => void deleteAvatar()} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-60"><Trash2 className="h-4 w-4" />Удалить фото</button>}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {([{ key: 'firstName', label: 'Имя' }, { key: 'lastName', label: 'Фамилия' }, { key: 'phone', label: 'Телефон' }, { key: 'position', label: 'Должность' }] as const).map(field => <div key={field.key}><label className="lumi-muted-strong mb-2 block text-sm font-medium">{field.label}</label><input value={profile[field.key]} onChange={event => setProfile(current => ({ ...current, [field.key]: event.target.value }))} className="lumi-control w-full rounded-xl px-4 py-3 outline-none" /></div>)}
          <div className="sm:col-span-2"><label className="lumi-muted-strong mb-2 block text-sm font-medium">Email для входа</label><input value={user.email} readOnly className="lumi-control w-full cursor-not-allowed rounded-xl px-4 py-3 opacity-75 outline-none" /></div>
        </div>
        <button type="button" disabled={savingProfile} onClick={() => void saveProfile()} className="lumi-gradient-button mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold disabled:opacity-60 sm:w-auto"><Save className="h-4 w-4" />{savingProfile ? 'Сохраняем…' : 'Сохранить профиль'}</button>

        <div className="lumi-border mt-6 border-t pt-6">
          <div className="flex items-start gap-3"><LockKeyhole className="lumi-accent-text mt-0.5 h-5 w-5" /><div><h3 className="lumi-text font-semibold">Сменить пароль</h3><p className="lumi-muted mt-1 text-sm">После смены используйте новый пароль на всех устройствах.</p></div></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2"><input type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="Новый пароль" className="lumi-control w-full rounded-xl px-4 py-3 outline-none" /><input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Повторите пароль" className="lumi-control w-full rounded-xl px-4 py-3 outline-none" /></div>
          <button type="button" disabled={passwordSaving || !newPassword || !confirmPassword} onClick={() => void savePassword()} className="lumi-control mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold disabled:opacity-50 sm:w-auto"><LockKeyhole className="h-4 w-4" />{passwordSaving ? 'Меняем…' : 'Изменить пароль'}</button>
        </div>

        {(accountMessage || authError) && <p className={`mt-4 rounded-xl border px-4 py-3 text-sm ${authError ? 'border-red-700/40 bg-red-950/20 text-red-300' : 'border-emerald-700/40 bg-emerald-950/20 text-emerald-300'}`}>{authError || accountMessage}</p>}
        <button type="button" onClick={() => void handleLogout()} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/15 px-5 py-3 font-semibold text-red-400 sm:w-auto"><LogOut className="h-5 w-5" />Выйти из аккаунта</button>
      </section>

      <AppDownloadPanel />

      <section className="lumi-panel rounded-2xl border p-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <DatabaseBackup className="lumi-accent-text mt-0.5 h-6 w-6" />
            <div>
              <h2 className="lumi-text text-xl font-semibold">Резервная копия офиса</h2>
              <p className="lumi-muted mt-1 text-sm">Скачайте данные офиса или восстановите их из JSON-копии KvartoCRM.</p>
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button type="button" disabled={exportingBackup || restoringBackup} onClick={() => void exportBackup()} className="lumi-gradient-button inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold disabled:opacity-60">
              <DatabaseBackup className="h-4 w-4" />{exportingBackup ? 'Подготавливаем…' : 'Скачать копию'}
            </button>
            <input ref={backupInputRef} type="file" accept="application/json,.json" className="hidden" onChange={event => void selectBackup(event.target.files?.[0])} />
            <button type="button" disabled={restoringBackup} onClick={() => backupInputRef.current?.click()} className="lumi-control inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold disabled:opacity-60">
              <Upload className="h-4 w-4" />Загрузить копию
            </button>
          </div>
        </div>
        {selectedBackup && (
          <div className="lumi-panel-muted mt-5 rounded-2xl border p-4">
            <div className="flex items-start gap-3">
              <FileJson className="lumi-accent-text mt-0.5 h-6 w-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="lumi-text break-all font-semibold">{selectedBackup.name}</p>
                <p className="lumi-muted mt-1 text-sm">Создана {new Date(selectedBackup.summary.exportedAt).toLocaleString('ru-RU')} · {selectedBackup.summary.totalRows} записей · {selectedBackup.summary.fileRecords} файлов</p>
              </div>
              <button type="button" disabled={restoringBackup} onClick={() => setSelectedBackup(null)} aria-label="Отменить выбор копии" className="lumi-control rounded-lg p-2 disabled:opacity-50"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              Записи из копии будут добавлены или обновлены. Данные, созданные после этой копии, не удаляются. Служебная очередь уведомлений пересоздаётся автоматически.
            </div>
            {selectedBackup.summary.sourceUserId !== user.id && <p className="lumi-muted mt-3 text-sm">Копия создана в другом аккаунте. Все импортированные записи будут безопасно привязаны к текущему аккаунту.</p>}
            {selectedBackup.summary.warnings.length > 0 && <p className="mt-3 text-sm text-amber-300">В исходной копии предупреждений: {selectedBackup.summary.warnings.length}.</p>}
            <button type="button" disabled={restoringBackup} onClick={() => void restoreBackup()} className="lumi-gradient-button mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold disabled:opacity-60 sm:w-auto">
              <RefreshCw className={`h-4 w-4 ${restoringBackup ? 'animate-spin' : ''}`} />{restoringBackup ? restoreProgress || 'Восстанавливаем…' : 'Восстановить данные'}
            </button>
          </div>
        )}
        {backupMessage && <p className={`mt-4 rounded-xl border px-4 py-3 text-sm ${restoreComplete ? 'border-emerald-700/40 bg-emerald-950/20 text-emerald-300' : 'lumi-border lumi-muted'}`}>{backupMessage}</p>}
        {restoreComplete && <button type="button" onClick={() => window.location.reload()} className="lumi-control mt-3 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"><RefreshCw className="h-4 w-4" />Обновить данные на экране</button>}
        <p className="lumi-muted mt-4 text-xs leading-5">JSON-копия хранит записи и временные ссылки на файлы. Файлы переносятся, пока ссылки доступны. Если ссылка истекла, KvartoCRM дополнительно проверит локальный кэш устройства, на котором файл был загружен.</p>
      </section>

      <section className="lumi-panel rounded-2xl border p-6">
        <div className="mb-5 flex items-center gap-3">
          <Palette className="lumi-accent-text h-6 w-6" />
          <div><h2 className="lumi-text text-xl font-semibold">Оформление</h2><p className="lumi-muted text-sm">Тема применяется ко всем блокам и сохраняется отдельно на каждом устройстве.</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {themeOptions.map(option => (
            <button key={option.id} type="button" onClick={() => { setTheme(option.id); setSavedMessage('Тема сохранена на этом устройстве') }} className={`rounded-2xl border p-4 text-left transition ${theme.id === option.id ? 'border-[var(--lumi-accent)] ring-2 ring-[rgb(var(--lumi-accent-rgb)/0.18)]' : 'lumi-border lumi-panel-muted'}`}>
              <div className="mb-3 flex gap-1.5">{option.swatches.map(color => <span key={color} className="h-5 flex-1 rounded-md" style={{ backgroundColor: color }} />)}</div>
              <p className="lumi-text font-semibold">{option.name}</p>
              <p className="lumi-muted mt-1 text-xs leading-5">{option.description}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="lumi-panel rounded-2xl border p-6">
        <div className="mb-5 flex items-center gap-3"><LayoutPanelLeft className="lumi-accent-text h-6 w-6" /><div><h2 className="lumi-text text-xl font-semibold">Интерфейс</h2><p className="lumi-muted text-sm">Размер и расположение рабочих элементов.</p></div></div>
        <div className="grid gap-4 md:grid-cols-3">
          <SelectSetting<IconSize> label="Размер значков" value={user.preferences.iconSize} options={[{ value: 'compact', label: 'Компактные' }, { value: 'comfortable', label: 'Обычные' }, { value: 'large', label: 'Крупные' }]} onChange={value => void savePreference('iconSize', value)} />
          <SelectSetting<InterfaceDensity> label="Плотность интерфейса" value={user.preferences.density} options={[{ value: 'compact', label: 'Компактная' }, { value: 'comfortable', label: 'Обычная' }, { value: 'spacious', label: 'Просторная' }]} onChange={value => void savePreference('density', value)} />
          <SelectSetting<NavigationPosition> label="Положение меню" value={user.preferences.navigationPosition} options={[{ value: 'left', label: 'Слева' }, { value: 'right', label: 'Справа' }]} onChange={value => void savePreference('navigationPosition', value)} />
        </div>
      </section>

      <section className="lumi-panel rounded-2xl border p-6">
        <div className="mb-5 flex items-center gap-3"><BellRing className="lumi-accent-text h-6 w-6" /><div><h2 className="lumi-text text-xl font-semibold">Уведомления</h2><p className="lumi-muted text-sm">Настройки применяются к вашему аккаунту; разрешение выдаётся отдельно на каждом устройстве.</p></div></div>
        <div className="space-y-1">
          {[
            { key: 'newRequests' as const, label: 'Новые заявки', icon: Bell },
            { key: 'taskReminders' as const, label: 'Напоминания о задачах', icon: Maximize2 },
            { key: 'callReminders' as const, label: 'Напоминания о звонках', icon: Bell },
            { key: 'meetingReminders' as const, label: 'Напоминания о встречах', icon: BellRing },
          ].map(item => {
            const Icon = item.icon
            return <div key={item.key} className="lumi-border flex items-center justify-between border-b py-4 last:border-0"><div className="flex items-center gap-3"><div className="lumi-control rounded-xl p-3"><Icon className="h-5 w-5" /></div><span className="lumi-text font-medium">{item.label}</span></div><Toggle label={item.label} value={user.notificationPreferences[item.key]} onChange={value => void updateNotificationPreferences({ [item.key]: value })} /></div>
          })}
        </div>
        <p className="lumi-muted mt-4 text-sm">Для задач, звонков и встреч со временем KvartoCRM напоминает за день, за час, за 5 минут и точно в назначенный момент.</p>
        <div className="lumi-panel-muted mt-5 flex flex-col items-start justify-between gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3"><Smartphone className="lumi-accent-text mt-0.5 h-5 w-5" /><div><p className="lumi-text font-medium">Разрешение на этом устройстве</p><p className="lumi-muted mt-1 text-sm">{permission === 'granted' ? 'Разрешено' : permission === 'denied' ? 'Заблокировано в браузере' : permission === 'unsupported' ? 'Не поддерживается' : 'Ещё не запрошено'}</p></div></div>
          {permission === 'default' && <button type="button" onClick={() => void requestNotifications()} className="lumi-gradient-button rounded-xl px-4 py-2.5 text-sm font-semibold">Включить</button>}
        </div>
        {notificationMessage && <p className="lumi-muted mt-3 text-sm">{notificationMessage}</p>}
      </section>

    </div>
  )
}

export default SettingsPage
