import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Settings as SettingsIcon,
  Shield,
  ShieldAlert,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Percent,
  Plus,
  X,
  Save,
  RefreshCw,
  DollarSign,
  Timer,
  Hash,
  Bell,
} from 'lucide-react'
import type { AppSettings, SentinelDefaults, RiskLimits, NotificationConfig } from '@/lib/types'

// Re-export types for convenience
export type { AppSettings, SentinelDefaults } from '@/lib/types'

const DEFAULT_SETTINGS: AppSettings = {
  sentinelDefaults: {
    stopLossPct: -30,
    takeProfitPct: 500,
    trailingStopPct: null,
    sellPercentage: 100,
  },
  autoManageSentinels: true,
  blacklistedCoins: [],
}

const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxPositionUsd: 0,
  maxDailyTradesCount: 0,
  maxDailyVolumeUsd: 0,
  cooldownAfterLossSecs: 0,
  retryCount: 2,
  retryDelayMs: 1000,
  rateLimitMs: 500,
}

const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  enabled: true,
  sentinelTriggers: true,
  sniperBuys: true,
  harvesterClaims: true,
  riskAlerts: true,
  sessionAlerts: true,
  tradeConfirmations: false,
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [riskLimits, setRiskLimits] = useState<RiskLimits>(DEFAULT_RISK_LIMITS)
  const [notifConfig, setNotifConfig] = useState<NotificationConfig>(DEFAULT_NOTIFICATION_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [newBlacklistCoin, setNewBlacklistCoin] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [updateCount, setUpdateCount] = useState<number | null>(null)
  const [resetMessage, setResetMessage] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      // Load app settings from backend (migrated from localStorage)
      try {
        const backendSettings = await invoke<AppSettings | null>('get_app_settings')
        if (backendSettings) {
          setSettings(backendSettings)
        } else {
          // First-time migration: try loading from localStorage
          const stored = localStorage.getItem('rugplay_settings')
          if (stored) {
            const parsed = JSON.parse(stored) as AppSettings
            setSettings(parsed)
            // Persist to backend immediately
            await invoke('set_app_settings', { settings: parsed })
            // Clear localStorage after successful migration
            localStorage.removeItem('rugplay_settings')
          }
        }
      } catch {
        // Fallback to localStorage if backend not available
        const stored = localStorage.getItem('rugplay_settings')
        if (stored) {
          setSettings(JSON.parse(stored))
        }
      }

      // Load risk limits from backend
      try {
        const limits = await invoke<RiskLimits>('get_risk_limits')
        setRiskLimits(limits)
      } catch {
        // Risk limits not yet configured, use defaults
      }

      // Load notification config from backend
      try {
        const config = await invoke<NotificationConfig>('get_notification_config')
        setNotifConfig(config)
      } catch {
        // Not yet configured, use defaults
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const saveSettings = async () => {
    setSaving(true)
    setUpdateCount(null)
    try {
      // Save app settings to backend (SQLite)
      await invoke('set_app_settings', { settings }).catch(() => {
        // Fallback: save to localStorage if backend unavailable
        localStorage.setItem('rugplay_settings', JSON.stringify(settings))
      })

      // Batch-update all existing sentinels in the database with new defaults
      const d = settings.sentinelDefaults
      const count = await invoke<number>('update_all_sentinels', {
        stopLossPct: d.stopLossPct,
        takeProfitPct: d.takeProfitPct,
        trailingStopPct: d.trailingStopPct,
        sellPercentage: d.sellPercentage,
      })

      // Save risk limits to backend
      await invoke('set_risk_limits', { limits: riskLimits })

      // Save notification config to backend
      await invoke('set_notification_config', { config: notifConfig })

      setUpdateCount(count)
      setTimeout(() => setUpdateCount(null), 5000)
      setHasChanges(false)
    } catch (e) {
      console.error('Failed to save settings:', e)
    } finally {
      setSaving(false)
    }
  }

  const resetToDefaults = async () => {
    if (!confirm('Reset all sentinel settings to research-backed defaults? This will update all existing sentinels and clear the blacklist.')) return
    setResetting(true)
    setResetMessage(null)
    try {
      const defaults = await invoke<AppSettings>('reset_app_settings')
      setSettings(defaults)
      setHasChanges(false)
      setResetMessage('Settings reset to research defaults — all sentinels updated')
      setTimeout(() => setResetMessage(null), 5000)
    } catch (e) {
      console.error('Failed to reset settings:', e)
    } finally {
      setResetting(false)
    }
  }

  const updateSentinelDefault = (key: keyof SentinelDefaults, value: number | boolean | null) => {
    setSettings((prev) => ({
      ...prev,
      sentinelDefaults: {
        ...prev.sentinelDefaults,
        [key]: value,
      },
    }))
    setHasChanges(true)
  }

  const addBlacklistCoin = () => {
    const coin = newBlacklistCoin.toUpperCase().trim()
    if (coin && !settings.blacklistedCoins.includes(coin)) {
      setSettings((prev) => ({
        ...prev,
        blacklistedCoins: [...prev.blacklistedCoins, coin],
      }))
      setNewBlacklistCoin('')
      setHasChanges(true)
    }
  }

  const removeBlacklistCoin = (coin: string) => {
    setSettings((prev) => ({
      ...prev,
      blacklistedCoins: prev.blacklistedCoins.filter((c) => c !== coin),
    }))
    setHasChanges(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-foreground-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-zinc-500/20">
            <SettingsIcon className="w-5 h-5 text-zinc-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-sm text-foreground-muted">Configure bot behavior and defaults</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetToDefaults}
            disabled={resetting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
          >
            <RefreshCw className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
            {resetting ? 'Resetting...' : 'Reset to Defaults'}
          </button>
          <button
            onClick={saveSettings}
            disabled={!hasChanges || saving}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              hasChanges
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
            }`}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Update confirmation */}
      {updateCount !== null && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm">
          <Save className="w-4 h-4" />
          Settings saved — updated {updateCount} existing sentinel{updateCount !== 1 ? 's' : ''} with new defaults
        </div>
      )}
      {resetMessage && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/20 text-blue-400 text-sm">
          <RefreshCw className="w-4 h-4" />
          {resetMessage}
        </div>
      )}

      {/* Sentinel Defaults */}
      <div className="card">
        <div className="flex items-center gap-2 mb-6">
          <Shield className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold">Sentinel Defaults</h2>
        </div>

        <div className="space-y-6">
          {/* Auto-manage toggle */}
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
                setHasChanges(true)
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
                  onChange={(e) => updateSentinelDefault('stopLossPct', parseFloat(e.target.value) || 0)}
                  className="input flex-1"
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
                  onChange={(e) => updateSentinelDefault('takeProfitPct', parseFloat(e.target.value) || 0)}
                  className="input flex-1"
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
                  onChange={(e) =>
                    updateSentinelDefault(
                      'trailingStopPct',
                      e.target.value ? parseFloat(e.target.value) : null
                    )
                  }
                  placeholder="Disabled"
                  className="input flex-1"
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
                  onChange={(e) => updateSentinelDefault('sellPercentage', parseFloat(e.target.value) || 100)}
                  className="input flex-1"
                />
                <Percent className="w-4 h-4 text-foreground-muted" />
              </div>
              <p className="text-xs text-foreground-muted mt-1">
                Percentage of holding to sell when triggered
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Blacklist */}
      <div className="card">
        <div className="flex items-center gap-2 mb-6">
          <X className="w-5 h-5 text-rose-400" />
          <h2 className="text-lg font-semibold">Blacklisted Coins</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          Coins in this list will be excluded from auto-sentinel management
        </p>

        {/* Add coin */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newBlacklistCoin}
            onChange={(e) => setNewBlacklistCoin(e.target.value.toUpperCase())}
            placeholder="Enter coin symbol (e.g., PEPE)"
            className="input flex-1"
            onKeyDown={(e) => {
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

        {/* Blacklist tags */}
        <div className="flex flex-wrap gap-2">
          {settings.blacklistedCoins.length === 0 ? (
            <span className="text-sm text-foreground-muted">No coins blacklisted</span>
          ) : (
            settings.blacklistedCoins.map((coin) => (
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

      {/* Risk Limits */}
      <div className="card">
        <div className="flex items-center gap-2 mb-6">
          <ShieldAlert className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-semibold">Risk Limits</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          Set guardrails on automated and manual buying. Set to 0 to disable a limit.
        </p>

        <div className="grid grid-cols-2 gap-4">
          {/* Max Position Size */}
          <div className="p-4 rounded-lg bg-background">
            <label className="flex items-center gap-2 text-sm text-foreground-muted mb-2">
              <DollarSign className="w-4 h-4 text-blue-400" />
              Max Position Size
            </label>
            <div className="flex items-center gap-2">
              <span className="text-foreground-muted">$</span>
              <input
                type="number"
                min="0"
                step="100"
                value={riskLimits.maxPositionUsd}
                onChange={(e) => {
                  setRiskLimits(prev => ({ ...prev, maxPositionUsd: parseFloat(e.target.value) || 0 }))
                  setHasChanges(true)
                }}
                className="input flex-1"
              />
            </div>
            <p className="text-xs text-foreground-muted mt-1">
              Max USD for a single buy order
            </p>
          </div>

          {/* Max Daily Trades */}
          <div className="p-4 rounded-lg bg-background">
            <label className="flex items-center gap-2 text-sm text-foreground-muted mb-2">
              <Hash className="w-4 h-4 text-purple-400" />
              Max Daily Trades
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="1"
                value={riskLimits.maxDailyTradesCount}
                onChange={(e) => {
                  setRiskLimits(prev => ({ ...prev, maxDailyTradesCount: parseInt(e.target.value) || 0 }))
                  setHasChanges(true)
                }}
                className="input flex-1"
              />
            </div>
            <p className="text-xs text-foreground-muted mt-1">
              Max trades per 24-hour rolling window
            </p>
          </div>

          {/* Max Daily Volume */}
          <div className="p-4 rounded-lg bg-background">
            <label className="flex items-center gap-2 text-sm text-foreground-muted mb-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              Max Daily Volume
            </label>
            <div className="flex items-center gap-2">
              <span className="text-foreground-muted">$</span>
              <input
                type="number"
                min="0"
                step="1000"
                value={riskLimits.maxDailyVolumeUsd}
                onChange={(e) => {
                  setRiskLimits(prev => ({ ...prev, maxDailyVolumeUsd: parseFloat(e.target.value) || 0 }))
                  setHasChanges(true)
                }}
                className="input flex-1"
              />
            </div>
            <p className="text-xs text-foreground-muted mt-1">
              Max total USD volume per 24h
            </p>
          </div>

          {/* Loss Cooldown */}
          <div className="p-4 rounded-lg bg-background">
            <label className="flex items-center gap-2 text-sm text-foreground-muted mb-2">
              <Timer className="w-4 h-4 text-rose-400" />
              Loss Cooldown
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="30"
                value={riskLimits.cooldownAfterLossSecs}
                onChange={(e) => {
                  setRiskLimits(prev => ({ ...prev, cooldownAfterLossSecs: parseInt(e.target.value) || 0 }))
                  setHasChanges(true)
                }}
                className="input flex-1"
              />
              <span className="text-foreground-muted text-sm">sec</span>
            </div>
            <p className="text-xs text-foreground-muted mt-1">
              Pause buys for N seconds after a loss
            </p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="card">
        <div className="flex items-center gap-2 mb-6">
          <Bell className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold">Notifications</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          Control native Windows toast notifications for automated events
        </p>

        <div className="space-y-3">
          {/* Master toggle */}
          {([
            { key: 'enabled' as const, label: 'Enable Notifications', desc: 'Master switch for all notifications' },
            { key: 'sentinelTriggers' as const, label: 'Sentinel Triggers', desc: 'SL/TP/trailing stop sell alerts' },
            { key: 'sniperBuys' as const, label: 'Sniper Buys', desc: 'New coin auto-buy alerts' },
            { key: 'harvesterClaims' as const, label: 'Harvester Claims', desc: 'Daily reward claim alerts' },
            { key: 'riskAlerts' as const, label: 'Risk Alerts', desc: 'Trade rejected by risk limits' },
            { key: 'sessionAlerts' as const, label: 'Session Alerts', desc: 'Token expiry warnings' },
            { key: 'tradeConfirmations' as const, label: 'Trade Confirmations', desc: 'Manual trade execution alerts' },
          ]).map(({ key, label, desc }) => (
            <div key={key} className={`flex items-center justify-between p-3 rounded-lg bg-background ${key !== 'enabled' && !notifConfig.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
              <div>
                <div className="font-medium text-sm">{label}</div>
                <p className="text-xs text-foreground-muted">{desc}</p>
              </div>
              <button
                onClick={() => {
                  setNotifConfig(prev => ({ ...prev, [key]: !prev[key] }))
                  setHasChanges(true)
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  notifConfig[key] ? 'bg-emerald-600' : 'bg-zinc-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    notifConfig[key] ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="card bg-blue-500/10 border-blue-500/30">
        <h3 className="font-semibold text-blue-400 mb-2">How Auto-Sentinel Works</h3>
        <ul className="text-sm text-foreground-muted space-y-1 list-disc list-inside">
          <li>When enabled, monitors the live feed for trades on coins you hold</li>
          <li>Creates sentinels automatically using your default settings</li>
          <li>Blacklisted coins are excluded from auto-management</li>
          <li>You can still manually adjust individual sentinel settings</li>
        </ul>
      </div>
    </div>
  )
}
