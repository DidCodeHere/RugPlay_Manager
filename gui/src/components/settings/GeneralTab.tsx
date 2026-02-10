import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Cog,
  Database,
  HardDrive,
  RotateCcw,
  CheckCircle,
  FolderOpen,
  Trash2,
  FileText,
  Shield,
  ScrollText,
  Shrink,
  AlertTriangle,
} from 'lucide-react'
import type { AppSettings } from '@/lib/types'
import { ToggleSwitch } from '@/components/ui/FormattedInput'

interface StorageInfo {
  dataDir: string
  dbSizeBytes: number
  profileCount: number
  transactionCount: number
  sentinelCount: number
  automationLogCount: number
}

interface GeneralTabProps {
  settings: AppSettings
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>
  onChanged: () => void
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function GeneralTab({ settings, setSettings, onChanged }: GeneralTabProps) {
  const [clearingCache, setClearingCache] = useState(false)
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [confirmAction, setConfirmAction] = useState<string | null>(null)

  const showMessage = (text: string, ok: boolean) => {
    setActionMsg({ text, ok })
    setTimeout(() => setActionMsg(null), 4000)
  }

  useEffect(() => {
    loadStorageInfo()
  }, [])

  const loadStorageInfo = async () => {
    try {
      const info = await invoke<StorageInfo>('get_storage_info')
      setStorageInfo(info)
    } catch (e) {
      console.error('Failed to load storage info:', e)
    }
  }

  const handleClearCache = async () => {
    setClearingCache(true)
    try {
      await invoke('clear_coin_cache')
      showMessage('Coin cache cleared', true)
    } catch {
      showMessage('Failed to clear cache', false)
    } finally {
      setClearingCache(false)
    }
  }

  const handleClearSnipedSymbols = async () => {
    try {
      await invoke('clear_sniped_symbols_cmd')
      showMessage('Sniped symbols cleared', true)
    } catch {
      showMessage('Failed to clear sniped symbols', false)
    }
  }

  const handleClearAutomationLogs = async () => {
    setConfirmAction(null)
    try {
      const deleted = await invoke<number>('clear_automation_logs', { keepLast: 0 })
      showMessage(`Cleared ${deleted} automation log entries`, true)
      loadStorageInfo()
    } catch {
      showMessage('Failed to clear logs', false)
    }
  }

  const handleClearTriggeredSentinels = async () => {
    setConfirmAction(null)
    try {
      const deleted = await invoke<number>('clear_triggered_sentinels')
      showMessage(`Cleared ${deleted} triggered sentinel records`, true)
      loadStorageInfo()
    } catch {
      showMessage('Failed to clear sentinel history', false)
    }
  }

  const handleClearTransactions = async () => {
    setConfirmAction(null)
    try {
      const deleted = await invoke<number>('clear_transaction_history')
      showMessage(`Cleared ${deleted} transaction records`, true)
      loadStorageInfo()
    } catch {
      showMessage('Failed to clear transactions', false)
    }
  }

  const handleVacuum = async () => {
    try {
      await invoke('vacuum_database')
      showMessage('Database compacted', true)
      loadStorageInfo()
    } catch {
      showMessage('Failed to compact database', false)
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
            <div key={key} className="flex items-center justify-between form-field">
              <div>
                <div className="font-medium text-sm">{label}</div>
                <p className="text-xs text-foreground-muted">{desc}</p>
              </div>
              <ToggleSwitch enabled={settings[key]} onChange={() => {
                  setSettings(prev => ({ ...prev, [key]: !prev[key] }))
                  onChanged()
                }} />
            </div>
          ))}
        </div>
      </div>

      {/* Storage & Data Path */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold">Storage</h2>
        </div>

        {storageInfo ? (
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-background">
              <div className="text-xs text-foreground-muted mb-1">Local Data Path</div>
              <div className="text-sm font-mono text-foreground break-all select-all">
                {storageInfo.dataDir}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-background text-center">
                <div className="text-lg font-bold text-foreground">{formatBytes(storageInfo.dbSizeBytes)}</div>
                <div className="text-xs text-foreground-muted">Database Size</div>
              </div>
              <div className="p-3 rounded-lg bg-background text-center">
                <div className="text-lg font-bold text-foreground">{storageInfo.profileCount}</div>
                <div className="text-xs text-foreground-muted">Profiles</div>
              </div>
              <div className="p-3 rounded-lg bg-background text-center">
                <div className="text-lg font-bold text-foreground">{storageInfo.transactionCount.toLocaleString()}</div>
                <div className="text-xs text-foreground-muted">Transactions</div>
              </div>
              <div className="p-3 rounded-lg bg-background text-center">
                <div className="text-lg font-bold text-foreground">{storageInfo.automationLogCount.toLocaleString()}</div>
                <div className="text-xs text-foreground-muted">Log Entries</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-foreground-muted">Loading storage info...</div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold">Quick Actions</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          Clear cached data without affecting your active sentinels or settings
        </p>

        {actionMsg && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm mb-4 ${
            actionMsg.ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
          }`}>
            <CheckCircle className="w-4 h-4" />
            {actionMsg.text}
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
            <div className="p-2 rounded-lg bg-blue-500/20 group-hover:bg-blue-500/30 transition-colors">
              <RotateCcw className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <div className="font-medium text-sm">Clear Sniped Symbols</div>
              <p className="text-xs text-foreground-muted">Reset sniper history to allow re-sniping</p>
            </div>
          </button>

          <button
            onClick={handleVacuum}
            className="flex items-center gap-3 p-4 rounded-lg bg-background hover:bg-zinc-700/50 transition-colors text-left group"
          >
            <div className="p-2 rounded-lg bg-emerald-500/20 group-hover:bg-emerald-500/30 transition-colors">
              <Shrink className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="font-medium text-sm">Compact Database</div>
              <p className="text-xs text-foreground-muted">Reclaim disk space (VACUUM)</p>
            </div>
          </button>
        </div>
      </div>

      {/* Destructive Actions */}
      <div className="card border border-rose-500/20">
        <div className="flex items-center gap-2 mb-4">
          <Trash2 className="w-5 h-5 text-rose-400" />
          <h2 className="text-lg font-semibold text-rose-400">Data Cleanup</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          Permanently delete stored records. These actions cannot be undone.
        </p>

        {confirmAction && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 mb-4">
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-rose-400">
                {confirmAction === 'logs' && 'Delete all automation log entries?'}
                {confirmAction === 'sentinels' && 'Delete all triggered sentinel history?'}
                {confirmAction === 'transactions' && 'Delete all transaction history?'}
              </p>
              <p className="text-xs text-foreground-muted mt-0.5">This cannot be undone.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-3 py-1.5 rounded text-sm bg-zinc-700 hover:bg-zinc-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmAction === 'logs') handleClearAutomationLogs()
                  else if (confirmAction === 'sentinels') handleClearTriggeredSentinels()
                  else if (confirmAction === 'transactions') handleClearTransactions()
                }}
                className="px-3 py-1.5 rounded text-sm bg-rose-600 hover:bg-rose-700 text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => setConfirmAction('logs')}
            className="flex items-center gap-3 p-4 rounded-lg bg-background hover:bg-rose-500/10 transition-colors text-left group"
          >
            <div className="p-2 rounded-lg bg-rose-500/20">
              <ScrollText className="w-4 h-4 text-rose-400" />
            </div>
            <div>
              <div className="font-medium text-sm">Clear Automation Logs</div>
              <p className="text-xs text-foreground-muted">
                {storageInfo ? `${storageInfo.automationLogCount.toLocaleString()} entries` : '...'}
              </p>
            </div>
          </button>

          <button
            onClick={() => setConfirmAction('sentinels')}
            className="flex items-center gap-3 p-4 rounded-lg bg-background hover:bg-rose-500/10 transition-colors text-left group"
          >
            <div className="p-2 rounded-lg bg-rose-500/20">
              <Shield className="w-4 h-4 text-rose-400" />
            </div>
            <div>
              <div className="font-medium text-sm">Clear Sentinel History</div>
              <p className="text-xs text-foreground-muted">Remove triggered records only</p>
            </div>
          </button>

          <button
            onClick={() => setConfirmAction('transactions')}
            className="flex items-center gap-3 p-4 rounded-lg bg-background hover:bg-rose-500/10 transition-colors text-left group"
          >
            <div className="p-2 rounded-lg bg-rose-500/20">
              <FileText className="w-4 h-4 text-rose-400" />
            </div>
            <div>
              <div className="font-medium text-sm">Clear Transactions</div>
              <p className="text-xs text-foreground-muted">
                {storageInfo ? `${storageInfo.transactionCount.toLocaleString()} records` : '...'}
              </p>
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
          <li>Database is stored locally and encrypted session tokens are machine-bound</li>
        </ul>
      </div>
    </div>
  )
}
