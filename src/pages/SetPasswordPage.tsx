import { useState } from 'react'
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import BrandLogo from '../components/BrandLogo'
import ThemeSwitcher from '../components/ThemeSwitcher'

const SetPasswordPage = () => {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage(null)
    if (password.length < 8) {
      setMessage('Пароль должен содержать не менее 8 символов')
      return
    }
    if (password !== confirmation) {
      setMessage('Пароли не совпадают')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setMessage('Ссылка недействительна или устарела. Запросите новое приглашение.')
      return
    }

    setSuccess(true)
    setMessage('Пароль сохранён. Открываем KvartoCRM…')
    window.setTimeout(() => navigate('/'), 900)
  }

  return (
    <div className="lumi-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute right-5 top-5 z-20 sm:right-8 sm:top-8">
        <ThemeSwitcher showLabel />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-[-20rem] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-[rgb(var(--lumi-accent-rgb)/0.18)] blur-3xl" />
      <div className="lumi-panel relative w-full max-w-md rounded-3xl border p-7 backdrop-blur sm:p-9">
        <BrandLogo className="justify-center" markClassName="h-11 w-11" />
        <div className="mt-6 text-center">
          <div className="lumi-accent-soft mx-auto flex h-12 w-12 items-center justify-center rounded-2xl">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="lumi-text mt-4 text-2xl font-bold">Создайте пароль владельца</h1>
          <p className="lumi-muted mt-2 text-sm leading-6">Этот пароль будет использоваться для входа в KvartoCRM с любого устройства.</p>
        </div>

        {message && (
          <div className={`mt-6 rounded-xl border px-4 py-3 text-sm ${success ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300'}`}>
            {message}
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-5">
          <label className="lumi-muted-strong block text-sm font-medium">
            Новый пароль
            <span className="relative mt-2 block">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
                className="lumi-control w-full rounded-xl py-3 pl-4 pr-12 outline-none focus:ring-2 focus:ring-[rgb(var(--lumi-accent-rgb)/0.18)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(value => !value)}
                aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                className="lumi-muted absolute right-3 top-2.5 rounded-lg p-1"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </span>
          </label>
          <label className="lumi-muted-strong block text-sm font-medium">
            Повторите пароль
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmation}
              onChange={event => setConfirmation(event.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
              className="lumi-control mt-2 w-full rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[rgb(var(--lumi-accent-rgb)/0.18)]"
            />
          </label>
          <button
            type="submit"
            disabled={submitting || success}
            className="lumi-gradient-button flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-semibold shadow-lg transition hover:opacity-90 disabled:opacity-60"
          >
            <ShieldCheck className="h-5 w-5" />
            {submitting ? 'Сохраняем…' : 'Сохранить пароль'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default SetPasswordPage
