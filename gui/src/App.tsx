import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ProfileSelect } from './components/auth/ProfileSelect'
import { AddProfile } from './components/auth/AddProfile'
import { TokenExpired } from './components/auth/TokenExpired'
import { Dashboard } from './components/layout/Dashboard'
import type { ProfileSummary, UserProfile, LoginResult } from './lib/types'

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
    <div className="min-h-screen bg-background">
      {renderScreen()}
    </div>
  )
}

export default App
