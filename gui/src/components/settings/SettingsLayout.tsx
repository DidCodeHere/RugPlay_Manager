import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Settings as SettingsIcon,
  Shield,
  Crosshair,
  Users,
  ShieldAlert,
  Bell,
  Cog,
  Save,
  RefreshCw,
} from 'lucide-react'
import type { AppSettings, RiskLimits, NotificationConfig, SniperConfig } from '@/lib/types'
import { GeneralTab } from './GeneralTab'
import { SentinelTab } from './SentinelTab'
import { SniperTab } from './SniperTab'
import { MirrorTab } from './MirrorTab'
import { RiskTab } from './RiskTab'
import { NotificationsTab } from './NotificationsTab'

// Re-export types for convenience
export type { AppSettings, SentinelDefaults } from '@/lib/types'

export type SettingsTab = 'general' | 'sentinel' | 'sniper' | 'mirror' | 'risk' | 'notifications'

const TAB_ITEMS: { id: SettingsTab; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'general', label: 'General', icon: Cog, desc: 'App behavior & data' },
  { id: 'sentinel', label: 'Sentinel', icon: Shield, desc: 'Stop-loss & take-profit' },
  { id: 'sniper', label: 'Sniper', icon: Crosshair, desc: 'Auto-buy new coins' },
  { id: 'mirror', label: 'Mirror', icon: Users, desc: 'Copy whale trades' },
  { id: 'risk', label: 'Risk', icon: ShieldAlert, desc: 'Trade guardrails' },
  { id: 'notifications', label: 'Notifications', icon: Bell, desc: 'Alert preferences' },
]

const DEFAULT_SETTINGS: AppSettings = {
  sentinelDefaults: {
    stopLossPct: -15,
    takeProfitPct: 100,
    trailingStopPct: 10,
    sellPercentage: 100,
  },
  autoManageSentinels: false,
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

export interface MirrorConfigState {
  scaleFactor: number
  maxTradeUsd: number
  maxLatencySecs: number
  autoCreateSentinel: boolean
  stopLossPct: number
  takeProfitPct: number
  trailingStopPct: number | null
  skipIfAlreadyHeld: boolean
  pollIntervalSecs: number
}

const DEFAULT_MIRROR_CONFIG: MirrorConfigState = {
  scaleFactor: 0.10,
  maxTradeUsd: 5000,
  maxLatencySecs: 5,
  autoCreateSentinel: true,
  stopLossPct: -25,
  takeProfitPct: 100,
  trailingStopPct: 15,
  skipIfAlreadyHeld: true,
  pollIntervalSecs: 0,
}

export interface SentinelMonitorStatus {
  status: string
  intervalSecs: number
  isPaused: boolean
}

export function SettingsLayout() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // State for each settings domain
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [riskLimits, setRiskLimits] = useState<RiskLimits>(DEFAULT_RISK_LIMITS)
  const [notifConfig, setNotifConfig] = useState<NotificationConfig>(DEFAULT_NOTIFICATION_CONFIG)
  const [sniperConfig, setSniperConfig] = useState<SniperConfig | null>(null)
  const [mirrorConfig, setMirrorConfig] = useState<MirrorConfigState>(DEFAULT_MIRROR_CONFIG)
  const [sentinelMonitor, setSentinelMonitor] = useState<SentinelMonitorStatus>({
    status: 'Running',
    intervalSecs: 10,
    isPaused: false,
  })

  const markChanged = useCallback(() => setHasChanges(true), [])

  const loadAllSettings = useCallback(async () => {
    setLoading(true)
    try {
      // Load app settings
      try {
        const backendSettings = await invoke<AppSettings | null>('get_app_settings')
        if (backendSettings) setSettings(backendSettings)
        else {
          const stored = localStorage.getItem('rugplay_settings')
          if (stored) {
            const parsed = JSON.parse(stored) as AppSettings
            setSettings(parsed)
            await invoke('set_app_settings', { settings: parsed })
            localStorage.removeItem('rugplay_settings')
          }
        }
      } catch { /* use defaults */ }

      // Load risk limits
      try {
        const limits = await invoke<RiskLimits>('get_risk_limits')
        setRiskLimits(limits)
      } catch { /* use defaults */ }

      // Load notification config
      try {
        const config = await invoke<NotificationConfig>('get_notification_config')
        setNotifConfig(config)
      } catch { /* use defaults */ }

      // Load sniper config
      try {
        const status = await invoke<{ config: SniperConfig }>('get_sniper_status')
        setSniperConfig(status.config)
      } catch { /* use defaults */ }

      // Load mirror config
      try {
        const status = await invoke<{ config: MirrorConfigState }>('get_mirror_status')
        setMirrorConfig(status.config)
      } catch { /* use defaults */ }

      // Load sentinel monitor status
      try {
        const status = await invoke<SentinelMonitorStatus>('get_sentinel_monitor_status')
        setSentinelMonitor(status)
      } catch { /* use defaults */ }
    } catch (e) {
      console.error('Failed to load settings:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAllSettings()
  }, [loadAllSettings])

  const saveAllSettings = async () => {
    setSaving(true)
    setSaveMessage(null)
    try {
      // Save app settings
      await invoke('set_app_settings', { settings })

      // Batch-update sentinels with new defaults
      const d = settings.sentinelDefaults
      const count = await invoke<number>('update_all_sentinels', {
        stopLossPct: d.stopLossPct,
        takeProfitPct: d.takeProfitPct,
        trailingStopPct: d.trailingStopPct,
        sellPercentage: d.sellPercentage,
      })

      // Save risk limits
      await invoke('set_risk_limits', { limits: riskLimits })

      // Save notification config
      await invoke('set_notification_config', { config: notifConfig })

      // Save sniper config (if loaded)
      if (sniperConfig) {
        await invoke('update_sniper_config', { config: sniperConfig })
      }

      // Save mirror config
      await invoke('update_mirror_config', { config: mirrorConfig })

      // Save sentinel interval
      await invoke('set_sentinel_monitor_interval', { intervalSecs: sentinelMonitor.intervalSecs })

      setSaveMessage(`Saved — updated ${count} sentinel${count !== 1 ? 's' : ''} with new defaults (custom-configured sentinels preserved)`)
      setTimeout(() => setSaveMessage(null), 5000)
      setHasChanges(false)
    } catch (e) {
      console.error('Failed to save settings:', e)
      setSaveMessage('Failed to save settings')
      setTimeout(() => setSaveMessage(null), 5000)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-foreground-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-zinc-500/20">
            <SettingsIcon className="w-5 h-5 text-zinc-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-sm text-foreground-muted">Configure bot behavior, modules, and preferences</p>
          </div>
        </div>
        <button
          onClick={saveAllSettings}
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

      {/* Save confirmation */}
      {saveMessage && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
          saveMessage.startsWith('Failed')
            ? 'bg-rose-500/20 text-rose-400'
            : 'bg-emerald-500/20 text-emerald-400'
        }`}>
          <Save className="w-4 h-4" />
          {saveMessage}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-zinc-700">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {TAB_ITEMS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-foreground-muted hover:text-white hover:border-zinc-500'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'general' && (
          <GeneralTab
            settings={settings}
            setSettings={setSettings}
            onChanged={markChanged}
          />
        )}
        {activeTab === 'sentinel' && (
          <SentinelTab
            settings={settings}
            setSettings={setSettings}
            monitor={sentinelMonitor}
            setMonitor={setSentinelMonitor}
            onChanged={markChanged}
          />
        )}
        {activeTab === 'sniper' && (
          <SniperTab
            config={sniperConfig}
            setConfig={setSniperConfig}
            onChanged={markChanged}
          />
        )}
        {activeTab === 'mirror' && (
          <MirrorTab
            config={mirrorConfig}
            setConfig={setMirrorConfig}
            onChanged={markChanged}
          />
        )}
        {activeTab === 'risk' && (
          <RiskTab
            limits={riskLimits}
            setLimits={setRiskLimits}
            onChanged={markChanged}
          />
        )}
        {activeTab === 'notifications' && (
          <NotificationsTab
            config={notifConfig}
            setConfig={setNotifConfig}
            onChanged={markChanged}
          />
        )}
      </div>
    </div>
  )
}
