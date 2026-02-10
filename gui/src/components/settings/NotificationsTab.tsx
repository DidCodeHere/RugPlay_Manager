import { Bell } from 'lucide-react'
import type { NotificationConfig } from '@/lib/types'
import { ToggleSwitch } from '@/components/ui/FormattedInput'

interface NotificationsTabProps {
  config: NotificationConfig
  setConfig: React.Dispatch<React.SetStateAction<NotificationConfig>>
  onChanged: () => void
}

const NOTIFICATION_ITEMS: { key: keyof NotificationConfig; label: string; desc: string }[] = [
  { key: 'enabled', label: 'Enable Notifications', desc: 'Master switch for all notifications' },
  { key: 'sentinelTriggers', label: 'Sentinel Triggers', desc: 'SL/TP/trailing stop sell alerts' },
  { key: 'sniperBuys', label: 'Sniper Buys', desc: 'New coin auto-buy alerts' },
  { key: 'harvesterClaims', label: 'Harvester Claims', desc: 'Daily reward claim alerts' },
  { key: 'riskAlerts', label: 'Risk Alerts', desc: 'Trade rejected by risk limits' },
  { key: 'sessionAlerts', label: 'Session Alerts', desc: 'Token expiry warnings' },
  { key: 'tradeConfirmations', label: 'Trade Confirmations', desc: 'Manual trade execution alerts' },
]

export function NotificationsTab({ config, setConfig, onChanged }: NotificationsTabProps) {
  const toggle = (key: keyof NotificationConfig) => {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }))
    onChanged()
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold">Notification Preferences</h2>
        </div>
        <p className="text-sm text-foreground-muted mb-4">
          Control native Windows toast notifications for automated events
        </p>

        <div className="space-y-3">
          {NOTIFICATION_ITEMS.map(({ key, label, desc }) => (
            <div
              key={key}
              className={`flex items-center justify-between form-field ${
                key !== 'enabled' && !config.enabled ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              <div>
                <div className="font-medium text-sm">{label}</div>
                <p className="text-xs text-foreground-muted">{desc}</p>
              </div>
              <ToggleSwitch enabled={config[key]} onChange={() => toggle(key)} />
            </div>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="card bg-blue-500/10 border-blue-500/30">
        <h3 className="font-semibold text-blue-400 mb-2">About Notifications</h3>
        <ul className="text-sm text-foreground-muted space-y-1 list-disc list-inside">
          <li>Notifications use native Windows toast notifications</li>
          <li>Disable the master toggle to silence everything</li>
          <li>Individual toggles only work when the master switch is enabled</li>
          <li>Trade confirmations are off by default to reduce noise</li>
        </ul>
      </div>
    </div>
  )
}
