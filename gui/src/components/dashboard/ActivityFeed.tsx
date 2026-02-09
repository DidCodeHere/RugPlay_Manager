import { Activity, Shield, Crosshair, Sprout, ArrowUpDown } from 'lucide-react'

export interface ActivityItem {
  id: number
  type: 'sentinel' | 'sniper' | 'harvester' | 'trade' | 'mirror'
  title: string
  description: string
  timestamp: number
}

const typeIcons: Record<ActivityItem['type'], React.ReactNode> = {
  sentinel: <Shield className="w-4 h-4 text-amber-400" />,
  sniper: <Crosshair className="w-4 h-4 text-emerald-400" />,
  harvester: <Sprout className="w-4 h-4 text-green-400" />,
  trade: <ArrowUpDown className="w-4 h-4 text-blue-400" />,
  mirror: <Activity className="w-4 h-4 text-cyan-400" />,
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

interface ActivityFeedProps {
  activities: ActivityItem[]
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-cyan-400" />
        <h2 className="text-lg font-bold">Recent Activity</h2>
      </div>
      {activities.length === 0 ? (
        <div className="text-center py-8 text-foreground-muted">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No activity yet this session</p>
          <p className="text-xs mt-1">Automated actions will appear here</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {activities.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 p-2.5 rounded-lg bg-background"
            >
              <div className="mt-0.5">{typeIcons[item.type]}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.title}</div>
                <div className="text-xs text-foreground-muted truncate">{item.description}</div>
              </div>
              <div className="text-xs text-foreground-muted whitespace-nowrap">{timeAgo(item.timestamp)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
