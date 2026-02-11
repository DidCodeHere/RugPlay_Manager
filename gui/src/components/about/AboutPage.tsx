import { useState } from 'react'
import {
  Info,
  BarChart3,
  BookOpen,
  Layers,
  SlidersHorizontal,
  Shield,
  TrendingDown,
  Crosshair,
  Users,
  Zap,
  Database,
} from 'lucide-react'
import { useResearchManifest, useResearchAboutStats } from '@/hooks/useResearch'
import { DocViewer } from './DocViewer'
import { OverviewTab } from './tabs/OverviewTab'
import { ResearchInsightsTab } from './tabs/ResearchInsightsTab'
import { BestSettingsTab } from './tabs/BestSettingsTab'

type TabId = 'overview' | 'research' | 'settings' | 'features' | 'strategies' | 'installation' | 'architecture' | 'security'

const TABS: { id: TabId; label: string; icon: typeof Info; group?: string }[] = [
  { id: 'overview', label: 'Overview', icon: Info, group: 'About' },
  { id: 'research', label: 'Research Data', icon: BarChart3, group: 'About' },
  { id: 'settings', label: 'Best Settings', icon: SlidersHorizontal, group: 'About' },
  { id: 'features', label: 'Feature Guide', icon: BookOpen, group: 'Guides' },
  { id: 'strategies', label: 'Strategy Guide', icon: Layers, group: 'Guides' },
  { id: 'installation', label: 'Installation', icon: Zap, group: 'Guides' },
  { id: 'architecture', label: 'Architecture', icon: Database, group: 'Guides' },
  { id: 'security', label: 'Security', icon: Shield, group: 'Guides' },
]

export function AboutPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const { manifest, loading: manifestLoading } = useResearchManifest()
  const { stats, loading: statsLoading } = useResearchAboutStats()

  const groups = ['About', 'Guides']

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-header-icon bg-violet-500/20">
            <Info className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">About &amp; Guides</h1>
            <p className="text-sm text-foreground-muted">
              Project info, research insights, recommended settings, and documentation
            </p>
          </div>
        </div>
        {stats && (
          <div className="text-xs text-foreground-muted text-right">
            <div>Research v{stats.version}</div>
            <div>Generated {stats.generated}</div>
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-white/[0.03] border border-white/[0.06]">
        {groups.map((group) => (
          <div key={group} className="flex items-center gap-1">
            {TABS.filter((t) => t.group === group).map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-violet-500/15 text-violet-400 border border-violet-500/30'
                      : 'text-foreground-muted hover:text-foreground hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              )
            })}
            {group !== groups[groups.length - 1] && (
              <div className="w-px h-5 bg-white/10 mx-1" />
            )}
          </div>
        ))}
      </div>

      {/* Tab Content */}
      <div className="page-enter">
        {activeTab === 'overview' && (
          <OverviewTab stats={stats} loading={statsLoading} />
        )}
        {activeTab === 'research' && (
          <ResearchInsightsTab manifest={manifest} stats={stats} loading={manifestLoading || statsLoading} />
        )}
        {activeTab === 'settings' && (
          <BestSettingsTab manifest={manifest} loading={manifestLoading} />
        )}
        {activeTab === 'features' && (
          <div className="card p-6">
            <DocViewer slug="features" />
          </div>
        )}
        {activeTab === 'strategies' && (
          <StrategiesTab />
        )}
        {activeTab === 'installation' && (
          <div className="card p-6">
            <DocViewer slug="installation" />
          </div>
        )}
        {activeTab === 'architecture' && (
          <div className="card p-6">
            <DocViewer slug="architecture" />
          </div>
        )}
        {activeTab === 'security' && (
          <div className="card p-6">
            <DocViewer slug="security" />
          </div>
        )}
      </div>
    </div>
  )
}

function StrategiesTab() {
  const [selected, setSelected] = useState<string>('sentinel')

  const strategies = [
    { id: 'sentinel', label: 'Sentinel (SL/TP)', icon: Shield, color: 'emerald' },
    { id: 'sniper', label: 'Sniper Bot', icon: Crosshair, color: 'amber' },
    { id: 'mirror', label: 'Mirror Trading', icon: Users, color: 'blue' },
    { id: 'dipbuyer', label: 'Dip Buyer', icon: TrendingDown, color: 'rose' },
  ]

  const descriptions: Record<string, string> = {
    sentinel: 'Automated stop-loss, take-profit, and trailing stop protection for your holdings. Creates watchdogs that monitor prices and execute sells when thresholds are hit.',
    sniper: 'Monitors the Rugplay market for newly created coins and auto-buys them within seconds of launch. Configurable buy amounts, filters, and auto-sentinel creation.',
    mirror: 'Copy-trades from whale wallets in real-time. Scales positions to your bankroll, applies latency filters, and creates sentinels for each mirrored trade.',
    dipbuyer: 'Confidence-scored dip detection that analyzes holder sell patterns, momentum, and volume quality. Uses tiered buy amounts based on market cap ranges.',
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {strategies.map((s) => {
          const Icon = s.icon
          const isActive = selected === s.id
          return (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl transition-all border ${
                isActive
                  ? `bg-${s.color}-500/10 border-${s.color}-500/30 text-${s.color}-400`
                  : 'bg-white/[0.02] border-white/[0.06] text-foreground-muted hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-xs font-medium">{s.label}</span>
            </button>
          )
        })}
      </div>

      <div className="card p-4">
        <p className="text-sm text-foreground-muted mb-4">{descriptions[selected]}</p>
      </div>

      <div className="card p-6">
        <DocViewer slug="features" />
      </div>
    </div>
  )
}
