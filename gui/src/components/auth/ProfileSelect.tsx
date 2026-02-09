import { useState } from 'react'
import { User, Trash2, Plus, ChevronRight } from 'lucide-react'
import type { ProfileSummary } from '@/lib/types'

interface ProfileSelectProps {
  profiles: ProfileSummary[]
  onSelect: (profileId: number) => void
  onAddNew: () => void
  onDelete: (profileId: number) => void
  error: string | null
}

export function ProfileSelect({ 
  profiles, 
  onSelect, 
  onAddNew, 
  onDelete,
  error 
}: ProfileSelectProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSelect(profileId: number) {
    setSelectedId(profileId)
    setIsLoading(true)
    await onSelect(profileId)
    setIsLoading(false)
  }

  function handleDelete(e: React.MouseEvent, profileId: number) {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this profile?')) {
      onDelete(profileId)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Rugplay Bot
          </h1>
          <p className="text-foreground-muted">
            Select a profile to continue
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-sell/10 border border-sell text-sell text-sm">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              onClick={() => handleSelect(profile.id)}
              disabled={isLoading}
              className={`
                w-full flex items-center gap-3 p-4 rounded-lg border transition-colors
                ${selectedId === profile.id && isLoading
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-background-tertiary bg-background-secondary hover:bg-background-tertiary'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              <div className="w-10 h-10 rounded-full bg-background-tertiary flex items-center justify-center">
                <User className="w-5 h-5 text-foreground-muted" />
              </div>
              
              <div className="flex-1 text-left">
                <div className="font-medium text-foreground">
                  {profile.username}
                </div>
                {profile.last_verified && (
                  <div className="text-xs text-foreground-muted">
                    Last active: {new Date(profile.last_verified).toLocaleDateString()}
                  </div>
                )}
              </div>

              <button
                onClick={(e) => handleDelete(e, profile.id)}
                className="p-2 rounded hover:bg-sell/10 text-foreground-muted hover:text-sell transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <ChevronRight className="w-5 h-5 text-foreground-muted" />
            </button>
          ))}
        </div>

        <button
          onClick={onAddNew}
          className="mt-4 w-full flex items-center justify-center gap-2 p-4 rounded-lg border border-dashed border-background-tertiary text-foreground-muted hover:text-foreground hover:border-foreground-muted transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add New Profile
        </button>
      </div>
    </div>
  )
}
