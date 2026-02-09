import { ChevronRight } from 'lucide-react'

interface ModuleStatusCardProps {
  title: string
  icon: React.ReactNode
  status: 'active' | 'paused' | 'off'
  statusText: string
  stats: { label: string; value: string }[]
  onClick?: () => void
}

const statusColors = {
  active: 'bg-emerald-500',
  paused: 'bg-amber-500',
  off: 'bg-zinc-600',
}

const statusTextColors = {
  active: 'text-emerald-400',
  paused: 'text-amber-400',
  off: 'text-zinc-400',
}

export function ModuleStatusCard({ title, icon, status, statusText, stats, onClick }: ModuleStatusCardProps) {
  return (
    <button
      onClick={onClick}
      className="card text-left hover:border-blue-500/30 transition-colors group"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-foreground-muted">{icon}</span>
          <span className="font-bold">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${statusColors[status]} ${status === 'active' ? 'animate-pulse' : ''}`} />
            <span className={`text-xs font-medium ${statusTextColors[status]}`}>{statusText}</span>
          </div>
          <ChevronRight className="w-4 h-4 text-foreground-muted opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
      <div className="flex gap-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <div className="text-xs text-foreground-muted">{stat.label}</div>
            <div className="text-sm font-medium">{stat.value}</div>
          </div>
        ))}
      </div>
    </button>
  )
}
