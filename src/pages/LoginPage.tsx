import { useEffect, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, Lock, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import BrandLogo from '../components/BrandLogo'
import ThemeSwitcher from '../components/ThemeSwitcher'
import InstallAppButton from '../components/InstallAppButton'
import { supabase } from '../lib/supabase'

type AuthMode = 'login' | 'register'

const LoginPage = () => {
  const [mode, setMode] = useState<AuthMode>('login')
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirmationPending, setConfirmationPending] = useState(false)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')
  const { login, signUp, resendConfirmation, isAuthenticated, error, clearError } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) navigate('/')
  }, [isAuthenticated, navigate])

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode)
    setConfirmationPending(false)
    setMessage('')
    setFormError('')
    clearError()
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    clearError()
    setFormError('')
    setMessage('')

    if (mode === 'register') {
      if (password.length < 8) {
        setFormError('Пароль должен содержать не менее 8 символов.')
        return
      }
      if (password !== passwordConfirmation) {
        setFormError('Пароли не совпадают.')
        return
      }
    }

    setSubmitting(true)
    try {
      if (mode === 'login') {
        if (await login(email.trim(), password)) navigate('/')
        return
      }

      const result = await signUp(email.trim(), password, firstName.trim(), lastName.trim())
      if (!result.success) return
      if (result.requiresEmailConfirmation) {
        setConfirmationPending(true)
        setMessage('Мы отправили письмо со ссылкой подтверждения. Откройте его на любом устройстве.')
      } else {
        navigate('/')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handlePasswordReset = async () => {
    clearError()
    setMessage('')
    setFormError('')

    if (!email.trim()) {
      setFormError('Сначала укажите email вашего аккаунта.')
      return
    }

    setResetting(true)
    const { error: passwordResetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/set-password` },
    )
    setResetting(false)

    if (passwordResetError) {
      setFormError('Не удалось отправить ссылку. Проверьте email и повторите попытку.')
      return
    }

    setMessage('Ссылка для создания нового пароля отправлена на указанный email.')
  }

  const handleResend = async () => {
    setSubmitting(true)
    const sent = await resendConfirmation(email.trim())
    setSubmitting(false)
    if (sent) setMessage('Новое письмо отправлено. Если его нет, проверьте папку «Спам».')
  }

  return (
    <div className="lumi-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="absolute right-5 top-5 z-20 flex items-center gap-2 sm:right-8 sm:top-8">
        <InstallAppButton compact />
        <ThemeSwitcher showLabel />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-[-20rem] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-[rgb(var(--lumi-accent-rgb)/0.18)] blur-3xl" />
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        <div className="lumi-panel rounded-3xl border p-7 backdrop-blur sm:p-9">
          <div className="mb-7 text-center">
            <BrandLogo className="justify-center" markClassName="h-11 w-11" />
            <h1 className="lumi-text mt-6 text-2xl font-bold">
              {mode === 'login' ? 'Вход в KvartoCRM' : 'Создайте свой офис'}
            </h1>
            <p className="lumi-muted mt-2 text-sm leading-6">
              {mode === 'login'
                ? 'Ваша CRM синхронизируется через защищённое облако и доступна с любого устройства.'
                : 'Зарегистрируйтесь бесплатно. Данные каждого офиса изолированы от других пользователей.'}
            </p>
          </div>

          <div className="lumi-control mb-6 grid grid-cols-2 rounded-xl p-1">
            <button type="button" onClick={() => changeMode('login')} className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${mode === 'login' ? 'lumi-panel lumi-text shadow-sm' : 'lumi-muted'}`}>
              Войти
            </button>
            <button type="button" onClick={() => changeMode('register')} className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${mode === 'register' ? 'lumi-panel lumi-text shadow-sm' : 'lumi-muted'}`}>
              Регистрация
            </button>
          </div>

          {(error || formError) && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 rounded-xl border border-red-800/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              {formError || error}
            </motion.div>
          )}

          {message && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-700/50 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{message}</span>
            </div>
          )}

          {confirmationPending ? (
            <div className="space-y-3">
              <button type="button" disabled={submitting} onClick={() => void handleResend()} className="lumi-gradient-button w-full rounded-xl py-3.5 font-semibold transition hover:opacity-90 disabled:opacity-60">
                {submitting ? 'Отправляем…' : 'Отправить письмо повторно'}
              </button>
              <button type="button" onClick={() => changeMode('login')} className="lumi-muted-strong w-full py-2 text-sm font-medium">
                Вернуться ко входу
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="firstName" className="lumi-muted-strong mb-2 block text-sm font-medium">Имя</label>
                    <div className="relative">
                      <UserRound className="lumi-muted absolute left-3.5 top-3.5 h-5 w-5" />
                      <input id="firstName" autoComplete="given-name" required value={firstName} onChange={event => setFirstName(event.target.value)} className="lumi-control w-full rounded-xl py-3 pl-11 pr-3 outline-none" placeholder="Анна" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="lastName" className="lumi-muted-strong mb-2 block text-sm font-medium">Фамилия</label>
                    <input id="lastName" autoComplete="family-name" required value={lastName} onChange={event => setLastName(event.target.value)} className="lumi-control w-full rounded-xl px-3 py-3 outline-none" placeholder="Иванова" />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="email" className="lumi-muted-strong mb-2 block text-sm font-medium">Email</label>
                <div className="relative">
                  <Mail className="lumi-muted absolute left-3.5 top-3.5 h-5 w-5" />
                  <input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className="lumi-control w-full rounded-xl py-3 pl-11 pr-4 outline-none" placeholder="office@example.com" />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="lumi-muted-strong mb-2 block text-sm font-medium">Пароль</label>
                <div className="relative">
                  <Lock className="lumi-muted absolute left-3.5 top-3.5 h-5 w-5" />
                  <input id="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 8 : undefined} required value={password} onChange={event => setPassword(event.target.value)} className="lumi-control w-full rounded-xl py-3 pl-11 pr-12 outline-none" placeholder={mode === 'register' ? 'Минимум 8 символов' : 'Введите пароль'} />
                  <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} className="lumi-muted absolute right-3 top-3 rounded-lg p-1 transition">
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {mode === 'register' && (
                <div>
                  <label htmlFor="passwordConfirmation" className="lumi-muted-strong mb-2 block text-sm font-medium">Повторите пароль</label>
                  <input id="passwordConfirmation" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} required value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} className="lumi-control w-full rounded-xl px-4 py-3 outline-none" placeholder="Повторите пароль" />
                </div>
              )}

              <button type="submit" disabled={submitting} className="lumi-gradient-button flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-semibold shadow-lg transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60">
                <ShieldCheck className="h-5 w-5" />
                {submitting ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
              </button>

              {mode === 'login' && (
                <button type="button" disabled={resetting} onClick={() => void handlePasswordReset()} className="lumi-muted-strong w-full text-center text-sm font-medium transition hover:opacity-80 disabled:opacity-60">
                  {resetting ? 'Отправляем ссылку…' : 'Забыли пароль?'}
                </button>
              )}
            </form>
          )}

          <p className="lumi-muted mt-6 text-center text-xs leading-5">
            Регистрируясь, вы создаёте отдельный защищённый офис KvartoCRM.
          </p>
        </div>
      </motion.div>
    </div>
  )
}

export default LoginPage
