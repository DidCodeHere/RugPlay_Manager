import {
  ShieldAlert,
  DollarSign,
  Hash,
  Timer,
  RotateCcw,
  Clock,
  Layers,
} from 'lucide-react'
import type { RiskLimits } from '@/lib/types'

interface RiskTabProps {
  limits: RiskLimits
  setLimits: React.Dispatch<React.SetStateAction<RiskLimits>>
  onChanged: () => void
}

export function RiskTab({ limits, setLimits, onChanged }: RiskTabProps) {
  const update = <K extends keyof RiskLimits>(key: K, value: RiskLimits[K]) => {
    setLimits(prev => ({ ...prev, [key]: value }))
    onChanged()
  }

  return (
    <div className="space-y-6">
      {/* Position & Volume Limits */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-semibold">Position & Volume Limits</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          Set guardrails on automated and manual trading. Set to 0 to disable a limit.
        </p>

        <div className="grid grid-cols-2 gap-4">
          {/* Max Position Size */}
          <div className="form-field">
            <label className="form-label">
              <DollarSign className="w-4 h-4 text-blue-400" />
              Max Position Size
            </label>
            <div className="flex items-center gap-2">
              <span className="text-foreground-muted">$</span>
              <input
                type="number"
                min="0"
                step="100"
                value={limits.maxPositionUsd}
                onChange={e => update('maxPositionUsd', parseFloat(e.target.value) || 0)}
                className="input flex-1"
              />
            </div>
            <p className="form-hint">
              Max USD for a single buy order
            </p>
          </div>

          {/* Max Daily Trades */}
          <div className="form-field">
            <label className="form-label">
              <Hash className="w-4 h-4 text-purple-400" />
              Max Daily Trades
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={limits.maxDailyTradesCount}
              onChange={e => update('maxDailyTradesCount', parseInt(e.target.value) || 0)}
              className="input"
            />
            <p className="form-hint">
              Max trades per 24-hour rolling window
            </p>
          </div>

          {/* Max Daily Volume */}
          <div className="form-field">
            <label className="form-label">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Max Daily Volume
            </label>
            <div className="flex items-center gap-2">
              <span className="text-foreground-muted">$</span>
              <input
                type="number"
                min="0"
                step="1000"
                value={limits.maxDailyVolumeUsd}
                onChange={e => update('maxDailyVolumeUsd', parseFloat(e.target.value) || 0)}
                className="input flex-1"
              />
            </div>
            <p className="form-hint">
              Max total USD volume per 24h
            </p>
          </div>

          {/* Loss Cooldown */}
          <div className="form-field">
            <label className="form-label">
              <Timer className="w-4 h-4 text-rose-400" />
              Loss Cooldown
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="30"
                value={limits.cooldownAfterLossSecs}
                onChange={e => update('cooldownAfterLossSecs', parseInt(e.target.value) || 0)}
                className="input flex-1"
              />
              <span className="text-foreground-muted text-sm">sec</span>
            </div>
            <p className="form-hint">
              Pause buys for N seconds after a loss
            </p>
          </div>
        </div>
      </div>

      {/* Trade Execution Settings */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold">Trade Execution</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          Control retry behavior and rate limiting for the trade executor
        </p>

        <div className="grid grid-cols-3 gap-4">
          {/* Retry Count */}
          <div className="form-field">
            <label className="form-label">
              <RotateCcw className="w-4 h-4 text-blue-400" />
              Retry Count
            </label>
            <input
              type="number"
              min="0"
              max="5"
              step="1"
              value={limits.retryCount}
              onChange={e => update('retryCount', parseInt(e.target.value) || 0)}
              className="input"
            />
            <p className="form-hint">
              Times to retry a failed trade (0–5)
            </p>
          </div>

          {/* Retry Delay */}
          <div className="form-field">
            <label className="form-label">
              <Clock className="w-4 h-4 text-amber-400" />
              Retry Backoff
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="500"
                max="10000"
                step="500"
                value={limits.retryDelayMs}
                onChange={e => update('retryDelayMs', parseInt(e.target.value) || 1000)}
                className="input flex-1"
              />
              <span className="text-foreground-muted text-sm">ms</span>
            </div>
            <p className="form-hint">
              Base delay between retries (doubles each attempt)
            </p>
          </div>

          {/* Rate Limit */}
          <div className="form-field">
            <label className="form-label">
              <Timer className="w-4 h-4 text-purple-400" />
              Rate Limit
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="200"
                max="2000"
                step="100"
                value={limits.rateLimitMs}
                onChange={e => update('rateLimitMs', parseInt(e.target.value) || 500)}
                className="input flex-1"
              />
              <span className="text-foreground-muted text-sm">ms</span>
            </div>
            <p className="form-hint">
              Minimum delay between consecutive trades
            </p>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="card bg-blue-500/10 border-blue-500/30">
        <h3 className="font-semibold text-blue-400 mb-2">About Risk Limits</h3>
        <ul className="text-sm text-foreground-muted space-y-1 list-disc list-inside">
          <li>Risk limits apply to ALL automated trades (sentinel, sniper, mirror)</li>
          <li>Set any limit to 0 to disable it</li>
          <li>Daily counts/volume use a 24-hour rolling window</li>
          <li>Loss cooldown pauses buying but still allows selling</li>
          <li>Failed trades are retried with exponential backoff (delay doubles each attempt)</li>
          <li>Rate limiting prevents overwhelming the API with rapid trades</li>
        </ul>
      </div>
    </div>
  )
}
