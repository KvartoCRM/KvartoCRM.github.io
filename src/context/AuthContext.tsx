import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { authStorageKey, supabase } from '../lib/supabase'
import { isExistingEmailSignUp, isTemporarySessionError, loginErrorMessage } from '../lib/authGuards'
import type { ThemeId } from './ThemeContext'
import { setOfflineSession } from '../lib/offlineTransport'
import { setOfflineFileSession } from '../lib/offlineFiles'
import { crmQueryKeys, queryClient } from '../lib/queryClient'

export type IconSize = 'compact' | 'comfortable' | 'large'
export type InterfaceDensity = 'compact' | 'comfortable' | 'spacious'
export type NavigationPosition = 'left' | 'right'

export interface UiPreferences {
  theme: ThemeId
  iconSize: IconSize
  density: InterfaceDensity
  navigationPosition: NavigationPosition
}

export interface NotificationPreferences {
  enabled: boolean
  newRequests: boolean
  taskReminders: boolean
  callReminders: boolean
  meetingReminders: boolean
  reminderMinutes: number
}

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  displayName: string
  middleName?: string
  phone?: string
  position?: string
  avatarPath?: string
  avatarUrl?: string
  onboardingCompleted: boolean
  preferences: UiPreferences
  notificationPreferences: NotificationPreferences
}

interface SignUpResult {
  success: boolean
  requiresEmailConfirmation: boolean
}

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<boolean>
  signUp: (email: string, password: string, firstName: string, lastName: string) => Promise<SignUpResult>
  resendConfirmation: (email: string) => Promise<boolean>
  updateUser: (data: Partial<User>) => Promise<void>
  changePassword: (password: string) => Promise<boolean>
  updateAvatar: (file: File) => Promise<boolean>
  removeAvatar: () => Promise<boolean>
  updatePreferences: (data: Partial<UiPreferences>) => Promise<boolean>
  updateNotificationPreferences: (data: Partial<NotificationPreferences>) => Promise<boolean>
  completeOnboarding: () => Promise<boolean>
  logout: () => Promise<void>
  isAuthenticated: boolean
  error: string | null
  clearError: () => void
}

const defaultPreferences: UiPreferences = {
  theme: 'midnight',
  iconSize: 'comfortable',
  density: 'comfortable',
  navigationPosition: 'left',
}

const defaultNotificationPreferences: NotificationPreferences = {
  enabled: true,
  newRequests: true,
  taskReminders: true,
  callReminders: true,
  meetingReminders: true,
  reminderMinutes: 60,
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const onboardingStorageKey = (userId: string) => `lumicrm-onboarding-completed:${userId}`
const userSnapshotStorageKey = (userId: string) => `lumicrm-user-snapshot:${userId}`
const lastUserStorageKey = 'lumicrm-last-user-id'

const readUserSnapshot = (userId: string) => {
  try {
    const value = window.localStorage.getItem(userSnapshotStorageKey(userId))
    return value ? JSON.parse(value) as User : null
  } catch {
    return null
  }
}

const saveUserSnapshot = (user: User) => {
  try {
    window.localStorage.setItem(userSnapshotStorageKey(user.id), JSON.stringify(user))
    window.localStorage.setItem(lastUserStorageKey, user.id)
  } catch {
    // Indexed cloud data remains available when browser storage is restricted.
  }
}

const hasLocalOnboardingCompletion = (userId: string) => {
  try {
    return window.localStorage.getItem(onboardingStorageKey(userId)) === 'true'
  } catch {
    return false
  }
}

const saveLocalOnboardingCompletion = (userId: string) => {
  try {
    window.localStorage.setItem(onboardingStorageKey(userId), 'true')
  } catch {
    // The cloud value remains authoritative when browser storage is unavailable.
  }
}

const normalizePreferences = (value: unknown): UiPreferences => {
  const source = value && typeof value === 'object' ? value as Partial<UiPreferences> : {}
  return { ...defaultPreferences, ...source }
}

const normalizeNotificationPreferences = (value: unknown): NotificationPreferences => {
  const source = value && typeof value === 'object' ? value as Partial<NotificationPreferences> : {}
  return { ...defaultNotificationPreferences, ...source }
}

function mapSupabaseUser(source: SupabaseUser, profile?: Record<string, unknown> | null): User {
  const metadata = source.user_metadata ?? {}
  const firstName = String(profile?.first_name ?? metadata.first_name ?? '')
  const lastName = String(profile?.last_name ?? metadata.last_name ?? '')
  return {
    id: source.id,
    email: source.email || '',
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`.trim(),
    middleName: String(profile?.middle_name ?? metadata.middle_name ?? '') || undefined,
    phone: String(profile?.phone ?? metadata.phone ?? '') || undefined,
    position: String(profile?.position ?? metadata.position ?? 'Риелтор'),
    avatarPath: String(metadata.avatar_path ?? '') || undefined,
    onboardingCompleted: Boolean(profile?.onboarding_completed),
    preferences: normalizePreferences(profile?.preferences),
    notificationPreferences: normalizeNotificationPreferences(profile?.notification_preferences),
  }
}

const authErrorMessage = (message?: string) => {
  const normalized = (message ?? '').toLowerCase()
  if (normalized.includes('already registered') || normalized.includes('already been registered')) {
    return 'Аккаунт с такой почтой уже существует.'
  }
  if (normalized.includes('password')) return 'Пароль не соответствует требованиям безопасности.'
  if (normalized.includes('rate limit')) return 'Слишком много попыток. Подождите немного и повторите.'
  return 'Не удалось выполнить запрос. Проверьте данные и подключение.'
}

const AUTH_STARTUP_TIMEOUT_MS = 5_000

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadGeneration = useRef(0)
  const activeSessionUserId = useRef<string | null>(null)

  const loadUser = async (source: SupabaseUser | null) => {
    const generation = ++loadGeneration.current
    const nextUserId = source?.id ?? null
    if (activeSessionUserId.current !== nextUserId) {
      activeSessionUserId.current = nextUserId
      setOfflineSession(nextUserId)
      setOfflineFileSession(nextUserId)
      queryClient.removeQueries({ queryKey: crmQueryKeys.root })
    }
    if (!source) {
      setUser(null)
      return
    }
    const cachedUser = readUserSnapshot(source.id)
    const applyMappedUser = (mappedUser: User) => {
      if (generation !== loadGeneration.current || activeSessionUserId.current !== source.id) return
      if (hasLocalOnboardingCompletion(source.id)) mappedUser.onboardingCompleted = true
      saveUserSnapshot(mappedUser)
      setUser(mappedUser)

      if (!mappedUser.avatarPath || !navigator.onLine) return
      void supabase.storage.from('crm-images').createSignedUrl(mappedUser.avatarPath, 7 * 24 * 60 * 60).then(({ data }) => {
        if (!data?.signedUrl) return
        setUser(previous => {
          if (!previous || previous.id !== mappedUser.id || previous.avatarPath !== mappedUser.avatarPath) return previous
          const next = { ...previous, avatarUrl: data.signedUrl }
          saveUserSnapshot(next)
          return next
        })
      }).catch(() => undefined)
    }

    if (cachedUser) {
      applyMappedUser(cachedUser)
      if (navigator.onLine) {
        void supabase.from('profiles').select('*').eq('id', source.id).maybeSingle().then(({ data: profile, error: profileError }) => {
          if (profileError) {
            console.error('Failed to refresh KvartoCRM profile:', profileError)
            return
          }
          applyMappedUser(mapSupabaseUser(source, profile as Record<string, unknown> | null))
        })
      }
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', source.id)
      .maybeSingle()
    if (profileError) console.error('Failed to load KvartoCRM profile:', profileError)
    applyMappedUser(mapSupabaseUser(source, profile as Record<string, unknown> | null))
  }

  useEffect(() => {
    let mounted = true

    const restoreCachedUser = () => {
      let storedSession: { user?: { id?: string }; refresh_token?: string } | null = null
      try {
        storedSession = JSON.parse(window.localStorage.getItem(authStorageKey) || 'null')
      } catch { return false }
      const lastUserId = storedSession?.user?.id
      const cachedUser = lastUserId && storedSession?.refresh_token ? readUserSnapshot(lastUserId) : null
      if (!cachedUser || cachedUser.id !== lastUserId) return false
      activeSessionUserId.current = cachedUser.id
      setOfflineSession(cachedUser.id)
      setOfflineFileSession(cachedUser.id)
      setUser(cachedUser)
      return true
    }

    const loadSession = async () => {
      const sessionRequest = supabase.auth.getSession()
      const startup = await Promise.race([
        sessionRequest.then(result => ({ result, timedOut: false as const })),
        new Promise<{ result: null; timedOut: true }>(resolve => {
          window.setTimeout(() => resolve({ result: null, timedOut: true }), AUTH_STARTUP_TIMEOUT_MS)
        }),
      ])
      if (!mounted) return
      if (startup.timedOut) {
        restoreCachedUser()
        setIsLoading(false)
        void sessionRequest.then(async ({ data, error: sessionError }) => {
          if (!mounted) return
          if (sessionError) {
            setError('Не удалось проверить облачную сессию')
            if (isTemporarySessionError(sessionError) && restoreCachedUser()) return
          }
          await loadUser(data.session?.user ?? null)
        }).catch(error => console.error('Delayed Supabase session recovery failed:', error))
        return
      }
      const { data, error: sessionError } = startup.result
      if (sessionError) {
        setError('Не удалось проверить облачную сессию')
        if (isTemporarySessionError(sessionError) && restoreCachedUser()) {
          setIsLoading(false)
          return
        }
      }
      await loadUser(data.session?.user ?? null)
      if (mounted) setIsLoading(false)
    }

    void loadSession().catch(() => {
      if (!mounted) return
      restoreCachedUser()
      setError('Не удалось проверить облачную сессию')
      setIsLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      if (event === 'INITIAL_SESSION' && !session && restoreCachedUser()) {
        setIsLoading(false)
        return
      }
      if (!session) {
        activeSessionUserId.current = null
        setOfflineSession(null)
        setOfflineFileSession(null)
        setUser(null)
      }
      window.setTimeout(() => {
        if (!mounted) return
        void loadUser(session?.user ?? null).finally(() => {
          if (mounted) setIsLoading(false)
        })
      }, 0)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) return
    const root = document.documentElement
    root.dataset.density = user.preferences.density
    root.style.setProperty('--lumi-nav-icon-size', {
      compact: '1rem',
      comfortable: '1.25rem',
      large: '1.5rem',
    }[user.preferences.iconSize])
  }, [user])

  const login = async (email: string, password: string) => {
    setError(null)
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
      if (loginError) {
        setError(loginErrorMessage(loginError.message))
        return false
      }
      return true
    } catch (loginError) {
      console.error('Supabase login failed:', loginError)
      setError(loginErrorMessage(loginError instanceof Error ? loginError.message : String(loginError)))
      return false
    }
  }

  const signUp = async (email: string, password: string, firstName: string, lastName: string): Promise<SignUpResult> => {
    setError(null)
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { first_name: firstName, last_name: lastName, position: 'Риелтор' },
      },
    })

    if (signUpError) {
      setError(authErrorMessage(signUpError.message))
      return { success: false, requiresEmailConfirmation: false }
    }

    // Supabase intentionally returns a successful-looking response for an
    // already registered email. An empty identities array is the supported
    // signal that no new account (and therefore no confirmation email) was made.
    if (isExistingEmailSignUp(data.user)) {
      setError('Аккаунт с такой почтой уже существует. Войдите или восстановите пароль.')
      return { success: false, requiresEmailConfirmation: false }
    }

    return { success: true, requiresEmailConfirmation: !data.session }
  }

  const resendConfirmation = async (email: string) => {
    setError(null)
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (resendError) {
      setError(authErrorMessage(resendError.message))
      return false
    }
    return true
  }

  const updateUser = async (data: Partial<User>) => {
    if (!user) return
    const metadata: Record<string, unknown> = {}
    const profileData: Record<string, unknown> = {}
    if (data.firstName !== undefined) metadata.first_name = profileData.first_name = data.firstName
    if (data.lastName !== undefined) metadata.last_name = profileData.last_name = data.lastName
    if (data.middleName !== undefined) metadata.middle_name = profileData.middle_name = data.middleName
    if (data.phone !== undefined) metadata.phone = profileData.phone = data.phone
    if (data.position !== undefined) metadata.position = profileData.position = data.position

    const { error: profileUpdateError } = await supabase.from('profiles').update(profileData).eq('id', user.id)
    const authUpdateError = navigator.onLine
      ? (await supabase.auth.updateUser({ data: metadata })).error
      : null
    if (authUpdateError || profileUpdateError) {
      setError('Не удалось обновить данные пользователя')
      return
    }

    setUser(previous => {
      if (!previous) return null
      const next = {
        ...previous,
        ...data,
        displayName: `${data.firstName ?? previous.firstName} ${data.lastName ?? previous.lastName}`.trim(),
      }
      saveUserSnapshot(next)
      return next
    })
  }

  const changePassword = async (password: string) => {
    if (!user) return false
    setError(null)
    if (!navigator.onLine) {
      setError('Для смены пароля нужно подключение к интернету.')
      return false
    }
    const { error: passwordError } = await supabase.auth.updateUser({ password })
    if (passwordError) {
      setError(authErrorMessage(passwordError.message))
      return false
    }
    return true
  }

  const updateAvatar = async (file: File) => {
    if (!user) return false
    setError(null)
    if (!navigator.onLine) {
      setError('Для загрузки аватара нужно подключение к интернету.')
      return false
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())) {
      setError('Выберите изображение в формате JPG, PNG или WebP.')
      return false
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Размер аватара не должен превышать 5 МБ.')
      return false
    }

    const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
    const storagePath = `${user.id}/profile/avatar-${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('crm-images').upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    })
    if (uploadError) {
      setError('Не удалось загрузить аватар. Проверьте подключение и повторите.')
      return false
    }

    const { error: metadataError } = await supabase.auth.updateUser({ data: { avatar_path: storagePath } })
    if (metadataError) {
      await supabase.storage.from('crm-images').remove([storagePath])
      setError('Не удалось привязать аватар к профилю.')
      return false
    }

    const { data: signed } = await supabase.storage.from('crm-images').createSignedUrl(storagePath, 7 * 24 * 60 * 60)
    const previousPath = user.avatarPath
    setUser(previous => {
      if (!previous) return null
      const next = { ...previous, avatarPath: storagePath, avatarUrl: signed?.signedUrl }
      saveUserSnapshot(next)
      return next
    })
    if (previousPath && previousPath !== storagePath) {
      void supabase.storage.from('crm-images').remove([previousPath])
    }
    return true
  }

  const removeAvatar = async () => {
    if (!user) return false
    setError(null)
    if (!navigator.onLine) {
      setError('Для удаления аватара нужно подключение к интернету.')
      return false
    }
    const previousPath = user.avatarPath
    const { error: metadataError } = await supabase.auth.updateUser({ data: { avatar_path: null } })
    if (metadataError) {
      setError('Не удалось удалить аватар из профиля.')
      return false
    }
    if (previousPath) void supabase.storage.from('crm-images').remove([previousPath])
    setUser(previous => {
      if (!previous) return null
      const next = { ...previous, avatarPath: undefined, avatarUrl: undefined }
      saveUserSnapshot(next)
      return next
    })
    return true
  }

  const updatePreferences = async (data: Partial<UiPreferences>) => {
    if (!user) return false
    const preferences = { ...user.preferences, ...data }
    const { error: updateError } = await supabase.from('profiles').update({ preferences }).eq('id', user.id)
    if (updateError) {
      console.error('Failed to update preferences:', updateError)
      setError('Не удалось сохранить настройки интерфейса')
      return false
    }
    setUser(previous => {
      if (!previous) return null
      const next = { ...previous, preferences }
      saveUserSnapshot(next)
      return next
    })
    return true
  }

  const updateNotificationPreferences = async (data: Partial<NotificationPreferences>) => {
    if (!user) return false
    const notificationPreferences = { ...user.notificationPreferences, ...data }
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ notification_preferences: notificationPreferences })
      .eq('id', user.id)
    if (updateError) {
      console.error('Failed to update notification preferences:', updateError)
      setError('Не удалось сохранить настройки уведомлений')
      return false
    }
    setUser(previous => {
      if (!previous) return null
      const next = { ...previous, notificationPreferences }
      saveUserSnapshot(next)
      return next
    })
    return true
  }

  const completeOnboarding = async () => {
    if (!user) return false
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ onboarding_completed: true })
      .eq('id', user.id)
    if (updateError) {
      console.error('Failed to complete onboarding:', updateError)
      // Onboarding must never lock a user out of the CRM. Keep a local marker
      // and retry the cloud state naturally on the next successful completion.
      saveLocalOnboardingCompletion(user.id)
      setUser(previous => {
        if (!previous) return null
        const next = { ...previous, onboardingCompleted: true }
        saveUserSnapshot(next)
        return next
      })
      return true
    }
    saveLocalOnboardingCompletion(user.id)
    setUser(previous => {
      if (!previous) return null
      const next = { ...previous, onboardingCompleted: true }
      saveUserSnapshot(next)
      return next
    })
    return true
  }

  const logout = async () => {
    const { error: logoutError } = await supabase.auth.signOut({ scope: 'local' })
    if (logoutError) setError('Не удалось завершить сессию')
    else {
      window.localStorage.removeItem(lastUserStorageKey)
      setUser(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 text-gray-400">
        Подключаем облачный офис…
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{
      user,
      login,
      signUp,
      resendConfirmation,
      updateUser,
      changePassword,
      updateAvatar,
      removeAvatar,
      updatePreferences,
      updateNotificationPreferences,
      completeOnboarding,
      logout,
      isAuthenticated: Boolean(user),
      error,
      clearError: () => setError(null),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
