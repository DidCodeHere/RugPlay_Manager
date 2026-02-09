import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Cog,
  Database,
  HardDrive,
  RotateCcw,
  CheckCircle,
} from 'lucide-react'
import type { AppSettings } from '@/lib/types'

interface GeneralTabProps {
  settings: AppSettings
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>
  onChanged: () => void
}

export function GeneralTab({ settings, setSettings, onChanged }: GeneralTabProps) {
  const [clearingCache, setClearingCache] = useState(false)
  const [cacheClearedMsg, setCacheClearedMsg] = useState<string | null>(null)

  const handleClearCache = async () => {
    setClearingCache(true)
    try {
      await invoke('clear_coin_cache')
      setCacheClearedMsg('Cache cleared successfully')
      setTimeout(() => setCacheClearedMsg(null), 3000)
    } catch (e) {
      console.error('Failed to clear cache:', e)
      setCacheClearedMsg('Failed to clear cache')
      setTimeout(() => setCacheClearedMsg(null), 3000)
    } finally {
      setClearingCache(false)
    }
  }

  const handleClearSnipedSymbols = async () => {
    try {
      await invoke('clear_sniped_symbols_cmd')
      setCacheClearedMsg('Sniped symbols cleared')
      setTimeout(() => setCacheClearedMsg(null), 3000)
    } catch (e) {
      console.error('Failed to clear sniped symbols:', e)
      setCacheClearedMsg('Failed to clear sniped symbols')
      setTimeout(() => setCacheClearedMsg(null), 3000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Startup Behavior */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Cog className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold">Startup Behavior</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          Control which modules auto-start when the application launches
        </p>

        <div className="space-y-3">
          {([
            { key: 'autoManageSentinels' as const, label: 'Auto-Manage Sentinels', desc: 'Automatically create sentinels for holdings when activity is detected in live feed' },
          ]).map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-background">
              <div>
                <div className="font-medium text-sm">{label}</div>
                <p className="text-xs text-foreground-muted">{desc}</p>
              </div>
              <button
                onClick={() => {
                  setSettings(prev => ({ ...prev, [key]: !prev[key] }))
                  onChanged()
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings[key] ? 'bg-emerald-600' : 'bg-zinc-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings[key] ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Data Management */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold">Data Management</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          Manage cached data and stored records
        </p>

        {cacheClearedMsg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm mb-4 ${
            cacheClearedMsg.includes('Failed')
              ? 'bg-rose-500/20 text-rose-400'
              : 'bg-emerald-500/20 text-emerald-400'
          }`}>
            <CheckCircle className="w-4 h-4" />
            {cacheClearedMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={handleClearCache}
            disabled={clearingCache}
            className="flex items-center gap-3 p-4 rounded-lg bg-background hover:bg-zinc-700/50 transition-colors text-left group"
          >
            <div className="p-2 rounded-lg bg-amber-500/20 group-hover:bg-amber-500/30 transition-colors">
              <HardDrive className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="font-medium text-sm">Clear Coin Cache</div>
              <p className="text-xs text-foreground-muted">Force refresh market data on next load</p>
            </div>
          </button>

          <button
            onClick={handleClearSnipedSymbols}
            className="flex items-center gap-3 p-4 rounded-lg bg-background hover:bg-zinc-700/50 transition-colors text-left group"
          >
            <div className="p-2 rounded-lg bg-rose-500/20 group-hover:bg-rose-500/30 transition-colors">
              <RotateCcw className="w-4 h-4 text-rose-400" />
            </div>
            <div>
              <div className="font-medium text-sm">Clear Sniped Symbols</div>
              <p className="text-xs text-foreground-muted">Reset sniper history to allow re-sniping</p>
            </div>
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="card bg-blue-500/10 border-blue-500/30">
        <h3 className="font-semibold text-blue-400 mb-2">About Settings</h3>
        <ul className="text-sm text-foreground-muted space-y-1 list-disc list-inside">
          <li>Settings are saved per profile and persist across sessions</li>
          <li>Changes across all tabs are saved together with the Save button</li>
          <li>Module-specific settings (intervals, thresholds) are in their respective tabs</li>
          <li>Risk limits apply globally to all automated trading</li>
        </ul>
      </div>
    </div>
  )
}
