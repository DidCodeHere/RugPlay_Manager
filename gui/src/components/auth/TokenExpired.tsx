import { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

interface TokenExpiredProps {
  username: string
  onSubmit: (token: string) => void
  onCancel: () => void
  error: string | null
}

export function TokenExpired({ username, onSubmit, onCancel, error }: TokenExpiredProps) {
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
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-yellow-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">
            Session Expired
          </h1>
          <p className="text-foreground-muted text-sm">
            The session token for <span className="text-foreground font-medium">{username}</span> has expired.
            Please paste a new token to continue.
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
              New Session Token
            </label>
            <textarea
              id="token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your new __Secure-better-auth.session_token here..."
              className="input min-h-[100px] resize-none font-mono text-xs"
              disabled={isLoading}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="btn btn-ghost flex-1 h-12 border border-background-tertiary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!token.trim() || isLoading}
              className="btn btn-primary flex-1 h-12"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Token'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
