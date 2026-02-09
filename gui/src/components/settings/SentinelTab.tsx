import { useState } from 'react'
import {
  Shield,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Percent,
  Plus,
  X,
  Timer,
  Clock,
} from 'lucide-react'
import type { AppSettings, SentinelDefaults } from '@/lib/types'
import type { SentinelMonitorStatus } from './SettingsLayout'

interface SentinelTabProps {
  settings: AppSettings
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>
  monitor: SentinelMonitorStatus
  setMonitor: React.Dispatch<React.SetStateAction<SentinelMonitorStatus>>
  onChanged: () => void
}

export function SentinelTab({ settings, setSettings, monitor, setMonitor, onChanged }: SentinelTabProps) {
  const [newBlacklistCoin, setNewBlacklistCoin] = useState('')

  const updateDefault = (key: keyof SentinelDefaults, value: number | boolean | null) => {
    setSettings(prev => ({
      ...prev,
      sentinelDefaults: { ...prev.sentinelDefaults, [key]: value },
    }))
    onChanged()
  }

  const addBlacklistCoin = () => {
    const coin = newBlacklistCoin.toUpperCase().trim()
    if (coin && !settings.blacklistedCoins.includes(coin)) {
      setSettings(prev => ({
        ...prev,
        blacklistedCoins: [...prev.blacklistedCoins, coin],
      }))
      setNewBlacklistCoin('')
      onChanged()
    }
  }

  const removeBlacklistCoin = (coin: string) => {
    setSettings(prev => ({
      ...prev,
      blacklistedCoins: prev.blacklistedCoins.filter(c => c !== coin),
    }))
    onChanged()
  }

  return (
    <div className="space-y-6">
      {/* Default Thresholds */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold">Default Thresholds</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          These defaults are applied when creating new sentinels. Saving will also update all existing sentinels.
        </p>

        <div className="grid grid-cols-2 gap-4">
          {/* Stop Loss */}
          <div className="p-4 rounded-lg bg-background">
            <label className="flex items-center gap-2 text-sm text-foreground-muted mb-2">
              <TrendingDown className="w-4 h-4 text-rose-400" />
              Default Stop Loss
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="100"
                value={settings.sentinelDefaults.stopLossPct}
                onChange={e => updateDefault('stopLossPct', parseFloat(e.target.value) || 0)}
                className="flex-1 px-3 py-2 rounded-lg bg-background-tertiary border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
              />
              <Percent className="w-4 h-4 text-foreground-muted" />
            </div>
            <p className="text-xs text-foreground-muted mt-1">
              Sell when price drops this % below entry
            </p>
          </div>

          {/* Take Profit */}
          <div className="p-4 rounded-lg bg-background">
            <label className="flex items-center gap-2 text-sm text-foreground-muted mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Default Take Profit
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="10000"
                value={settings.sentinelDefaults.takeProfitPct}
                onChange={e => updateDefault('takeProfitPct', parseFloat(e.target.value) || 0)}
                className="flex-1 px-3 py-2 rounded-lg bg-background-tertiary border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
              />
              <Percent className="w-4 h-4 text-foreground-muted" />
            </div>
            <p className="text-xs text-foreground-muted mt-1">
              Sell when price rises this % above entry
            </p>
          </div>

          {/* Trailing Stop */}
          <div className="p-4 rounded-lg bg-background">
            <label className="flex items-center gap-2 text-sm text-foreground-muted mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Default Trailing Stop
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={settings.sentinelDefaults.trailingStopPct ?? ''}
                onChange={e =>
                  updateDefault('trailingStopPct', e.target.value ? parseFloat(e.target.value) : null)
                }
                placeholder="Disabled"
                className="flex-1 px-3 py-2 rounded-lg bg-background-tertiary border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
              <Percent className="w-4 h-4 text-foreground-muted" />
            </div>
            <p className="text-xs text-foreground-muted mt-1">
              Tracks highest price, sells on drop (leave empty to disable)
            </p>
          </div>

          {/* Sell Percentage */}
          <div className="p-4 rounded-lg bg-background">
            <label className="flex items-center gap-2 text-sm text-foreground-muted mb-2">
              <Percent className="w-4 h-4 text-blue-400" />
              Default Sell Amount
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="100"
                value={settings.sentinelDefaults.sellPercentage}
                onChange={e => updateDefault('sellPercentage', parseFloat(e.target.value) || 100)}
                className="flex-1 px-3 py-2 rounded-lg bg-background-tertiary border border-zinc-700 text-white focus:outline-none focus:border-emerald-500"
              />
              <Percent className="w-4 h-4 text-foreground-muted" />
            </div>
            <p className="text-xs text-foreground-muted mt-1">
              Percentage of holding to sell when triggered
            </p>
          </div>
        </div>
      </div>

      {/* Check Interval */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold">Check Interval</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          How frequently the sentinel system checks your positions against price data
        </p>

        <div className="p-4 rounded-lg bg-background">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-sm text-foreground-muted">
              <Timer className="w-4 h-4 text-blue-400" />
              Polling Interval
            </label>
            <span className="text-sm font-mono text-white">{monitor.intervalSecs}s</span>
          </div>
          <input
            type="range"
            min="5"
            max="60"
            step="1"
            value={monitor.intervalSecs}
            onChange={e => {
              setMonitor(prev => ({ ...prev, intervalSecs: parseInt(e.target.value) }))
              onChanged()
            }}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between text-xs text-foreground-muted mt-1">
            <span>5s (fast)</span>
            <span>60s (conservative)</span>
          </div>
          {monitor.intervalSecs < 10 && (
            <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Fast intervals increase API load. Risk of rate limiting.
            </p>
          )}
        </div>
      </div>

      {/* Auto-Manage */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold">Auto-Management</h2>
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg bg-background">
          <div>
            <div className="font-medium">Auto-Manage Holdings</div>
            <p className="text-sm text-foreground-muted mt-1">
              Automatically create sentinels for holdings when activity is detected in live feed
            </p>
          </div>
          <button
            onClick={() => {
              setSettings(prev => ({ ...prev, autoManageSentinels: !prev.autoManageSentinels }))
              onChanged()
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.autoManageSentinels ? 'bg-emerald-600' : 'bg-zinc-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.autoManageSentinels ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Blacklisted Coins */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <X className="w-5 h-5 text-rose-400" />
          <h2 className="text-lg font-semibold">Blacklisted Coins</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          Coins in this list will be excluded from auto-sentinel management
        </p>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newBlacklistCoin}
            onChange={e => setNewBlacklistCoin(e.target.value.toUpperCase())}
            placeholder="Enter coin symbol (e.g., PEPE)"
            className="flex-1 px-3 py-2 rounded-lg bg-background border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            onKeyDown={e => {
              if (e.key === 'Enter') addBlacklistCoin()
            }}
          />
          <button
            onClick={addBlacklistCoin}
            disabled={!newBlacklistCoin.trim()}
            className="px-4 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {settings.blacklistedCoins.length === 0 ? (
            <span className="text-sm text-foreground-muted">No coins blacklisted</span>
          ) : (
            settings.blacklistedCoins.map(coin => (
              <span
                key={coin}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 text-sm"
              >
                ${coin}
                <button
                  onClick={() => removeBlacklistCoin(coin)}
                  className="p-0.5 rounded hover:bg-rose-500/30 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Info */}
      <div className="card bg-blue-500/10 border-blue-500/30">
        <h3 className="font-semibold text-blue-400 mb-2">How Sentinel Works</h3>
        <ul className="text-sm text-foreground-muted space-y-1 list-disc list-inside">
          <li>Monitors your coin holdings at the configured interval</li>
          <li>Triggers stop-loss, take-profit, or trailing-stop sells automatically</li>
          <li>Trailing stop tracks the highest price seen and sells on drop</li>
          <li>60-second cooldown after each trigger prevents rapid re-triggers</li>
        </ul>
      </div>
    </div>
  )
}
