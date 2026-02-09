import { useState } from 'react'
import { ArrowLeft, Key, Loader2 } from 'lucide-react'

interface AddProfileProps {
  onSubmit: (token: string) => void
  onBack?: () => void
  error: string | null
}

export function AddProfile({ onSubmit, onBack, error }: AddProfileProps) {
  const [token, setToken] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) return
    
    setIsLoading(true)
    await onSubmit(token.trim())
    setIsLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-6 flex items-center gap-2 text-foreground-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to profiles
          </button>
        )}

        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-background-secondary flex items-center justify-center mx-auto mb-4">
            <Key className="w-8 h-8 text-blue-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Add New Profile
          </h1>
          <p className="text-foreground-muted text-sm">
            Paste your Rugplay session token to add a new profile
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-sell/10 border border-sell text-sell text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label 
              htmlFor="token" 
              className="block text-sm font-medium text-foreground mb-2"
            >
              Session Token
            </label>
            <textarea
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your __Secure-better-auth.session_token here..."
              className="input min-h-[100px] resize-none font-mono text-xs"
              disabled={isLoading}
            />
            <p className="mt-2 text-xs text-foreground-muted">
              Find this in your browser's cookies at rugplay.com
            </p>
          </div>

          <button
            type="submit"
            disabled={!token.trim() || isLoading}
            className="btn btn-primary w-full h-12 text-base"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Validating...
              </>
            ) : (
              'Add Profile'
            )}
          </button>
        </form>

        <div className="mt-8 p-4 rounded-lg bg-background-secondary border border-background-tertiary">
          <h3 className="text-sm font-medium text-foreground mb-2">
            How to get your session token:
          </h3>
          <ol className="text-xs text-foreground-muted space-y-1 list-decimal list-inside">
            <li>Log in to rugplay.com in your browser</li>
            <li>Open Developer Tools (F12)</li>
            <li>Go to Application → Cookies → rugplay.com</li>
            <li>Find <code className="text-blue-400">__Secure-better-auth.session_token</code></li>
            <li>Copy the entire value</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
