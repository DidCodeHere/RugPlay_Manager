import { useState, useEffect, Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { ProfileSelect } from './components/auth/ProfileSelect'
import { AddProfile } from './components/auth/AddProfile'
import { TokenExpired } from './components/auth/TokenExpired'
import { Dashboard } from './components/layout/Dashboard'
import { activityStore } from './lib/activityStore'
import type {
  ProfileSummary,
  UserProfile,
  LoginResult,
  SniperTriggeredEvent,
  HarvesterClaimedEvent,
  TradeExecutedEvent,
  DipBuyerTriggeredEvent,
} from './lib/types'

type AppScreen = 
  | { type: 'loading' }
  | { type: 'profile-select'; profiles: ProfileSummary[] }
  | { type: 'add-profile' }
  | { type: 'token-expired'; profileId: number; username: string }
  | { type: 'dashboard'; user: UserProfile }

function App() {
  const [screen, setScreen] = useState<AppScreen>({ type: 'loading' })
  const [error, setError] = useState<string | null>(null)

  // Debug logging
  useEffect(() => {
    console.log('[App] Screen changed:', screen.type, screen)
  }, [screen])

  // Global event listeners — registered once at app startup so activities
  // and snipe log entries are captured even when dashboard/sniper tabs
  // are not mounted.
  useEffect(() => {
    const unlisteners: (() => void)[] = []

    listen<{ sentinelId: number; symbol: string; reason: string; triggerType: string }>(
      'sentinel-triggered',
      (event) => {
        const p = event.payload
        activityStore.addActivity({
          type: 'sentinel',
          title: `Sentinel ${p.triggerType === 'stop_loss' ? 'SL' : p.triggerType === 'take_profit' ? 'TP' : 'TS'} — ${p.symbol}`,
          description: p.reason,
          timestamp: Date.now(),
        })
      }
    ).then((u) => unlisteners.push(u))

    listen<SniperTriggeredEvent>('sniper-triggered', (event) => {
      const p = event.payload
      activityStore.addActivity({
        type: 'sniper',
        title: `Sniped ${p.symbol}`,
        description: `$${p.buyAmountUsd.toFixed(2)} at $${p.price.toFixed(8)}`,
        timestamp: Date.now(),
      })
      activityStore.addSnipe(p)
    }).then((u) => unlisteners.push(u))

    listen<HarvesterClaimedEvent>('harvester-claimed', (event) => {
      const p = event.payload
      activityStore.addActivity({
        type: 'harvester',
        title: `Reward Claimed — ${p.username}`,
        description: `$${p.rewardAmount.toFixed(2)} (streak: ${p.loginStreak})`,
        timestamp: Date.now(),
      })
    }).then((u) => unlisteners.push(u))

    listen<TradeExecutedEvent>('trade-executed', (event) => {
      const p = event.payload
      activityStore.addActivity({
        type: 'trade',
        title: `${p.tradeType} ${p.symbol}`,
        description: p.success ? `$${p.amount.toFixed(2)} @ $${p.newPrice.toFixed(8)}` : `Failed: ${p.error}`,
        timestamp: Date.now(),
      })
    }).then((u) => unlisteners.push(u))

    listen<DipBuyerTriggeredEvent>('dipbuyer-triggered', (event) => {
      const p = event.payload
      activityStore.addActivity({
        type: 'dipbuyer',
        title: `Dip Buy ${p.symbol}`,
        description: `$${p.buyAmountUsd.toFixed(2)} — @${p.sellerUsername} sold $${p.sellValueUsd.toFixed(0)}`,
        timestamp: Date.now(),
      })
    }).then((u) => unlisteners.push(u))

    return () => {
      unlisteners.forEach((u) => u())
    }
  }, [])

  // Load profiles on startup
  useEffect(() => {
    loadProfiles()
  }, [])

  async function loadProfiles() {
    try {
      const profiles = await invoke<ProfileSummary[]>('list_profiles')
      
      if (profiles.length === 0) {
        setScreen({ type: 'add-profile' })
      } else {
        // Check if there's an active profile
        const activeProfile = await invoke<ProfileSummary | null>('get_active_profile')
        
        if (activeProfile) {
          // Try to login to active profile
          handleSelectProfile(activeProfile.id)
        } else {
          setScreen({ type: 'profile-select', profiles })
        }
      }
    } catch (e) {
      setError(`Failed to load profiles: ${e}`)
      setScreen({ type: 'add-profile' })
    }
  }

  async function handleSelectProfile(profileId: number) {
    try {
      setError(null)
      console.log('[App] Selecting profile:', profileId)
      const result = await invoke<LoginResult>('select_profile', { profileId })
      console.log('[App] Login result:', result)
      
      if (result.status === 'success') {
        console.log('[App] Login success, user:', result.profile)
        setScreen({ type: 'dashboard', user: result.profile })
      } else if (result.status === 'expired') {
        // Find the profile to get username
        const profiles = await invoke<ProfileSummary[]>('list_profiles')
        const profile = profiles.find(p => p.id === profileId)
        setScreen({ 
          type: 'token-expired', 
          profileId, 
          username: profile?.username || 'Unknown' 
        })
      } else {
        setError(result.message || 'Login failed')
      }
    } catch (e) {
      setError(`Login failed: ${e}`)
    }
  }

  async function handleAddProfile(token: string) {
    try {
      setError(null)
      const profile = await invoke<ProfileSummary>('add_profile', { token })
      
      // Auto-login to the new profile
      handleSelectProfile(profile.id)
    } catch (e) {
      setError(`Failed to add profile: ${e}`)
    }
  }

  async function handleUpdateToken(profileId: number, newToken: string) {
    try {
      setError(null)
      await invoke<ProfileSummary>('update_profile_token', { 
        profileId, 
        newToken 
      })
      
      // Re-attempt login
      handleSelectProfile(profileId)
    } catch (e) {
      setError(`Failed to update token: ${e}`)
    }
  }

  async function handleLogout() {
    try {
      await invoke('logout')
      loadProfiles()
    } catch (e) {
      setError(`Logout failed: ${e}`)
    }
  }

  async function handleDeleteProfile(profileId: number) {
    try {
      await invoke('delete_profile', { profileId })
      loadProfiles()
    } catch (e) {
      setError(`Failed to delete profile: ${e}`)
    }
  }

  // Render current screen
  function renderScreen() {
    console.log('[App] renderScreen called with:', screen.type)
    
    switch (screen.type) {
      case 'loading':
        return (
          <div className="flex items-center justify-center h-screen">
            <div className="text-xl text-foreground-muted">Loading...</div>
          </div>
        )

      case 'profile-select':
        return (
          <ProfileSelect
            profiles={screen.profiles}
            onSelect={handleSelectProfile}
            onAddNew={() => setScreen({ type: 'add-profile' })}
            onDelete={handleDeleteProfile}
            error={error}
          />
        )

      case 'add-profile':
        return (
          <AddProfile
            onSubmit={handleAddProfile}
            onBack={screen.type === 'add-profile' ? loadProfiles : undefined}
            error={error}
          />
        )

      case 'token-expired':
        return (
          <TokenExpired
            username={screen.username}
            onSubmit={(token) => handleUpdateToken(screen.profileId, token)}
            onCancel={loadProfiles}
            error={error}
          />
        )

      case 'dashboard':
        return (
          <Dashboard
            user={screen.user}
            onLogout={handleLogout}
          />
        )
    }
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background">
        {renderScreen()}
      </div>
    </ErrorBoundary>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; info: string }> {
  state = { error: null as Error | null, info: '' }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
    this.setState({ info: info.componentStack || '' })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-8">
          <div className="max-w-xl w-full space-y-4">
            <h1 className="text-xl font-bold text-rose-400">Something went wrong</h1>
            <p className="text-sm text-foreground-muted">{this.state.error.message}</p>
            <pre className="text-xs bg-white/5 rounded-lg p-4 overflow-auto max-h-48 text-foreground-muted">
              {this.state.error.stack}
            </pre>
            <button
              onClick={() => { this.setState({ error: null, info: '' }) }}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default App
