import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  Wallet,
  Store,
  Crosshair,
  Shield,
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  Banknote,
  RefreshCw,
} from 'lucide-react'
import { HarvesterWidget } from './HarvesterWidget'
import { ModuleStatusCard } from './ModuleStatusCard'
import { ActivityFeed } from './ActivityFeed'
import { activityStore } from '@/lib/activityStore'
import type {
  UserProfile,
  PortfolioResponse,
  PortfolioSummary,
  SentinelTickEvent,
  DipBuyerTickEvent,
  DipBuyerStatusResponse,
  CoinHolding,
} from '@/lib/types'

interface DashboardHomeProps {
  user: UserProfile
  onViewPortfolio: () => void
  onViewMarket: () => void
  onViewSentinel: () => void
  onViewSniper: () => void
  onViewMirror: () => void
  onViewDipBuyer: () => void
  onCoinClick: (symbol: string) => void
}

export function DashboardHome({
  user,
  onViewPortfolio,
  onViewMarket,
  onViewSentinel,
  onViewSniper,
  onViewMirror,
  onViewDipBuyer,
  onCoinClick,
}: DashboardHomeProps) {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [topHoldings, setTopHoldings] = useState<CoinHolding[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Module status from events
  const [sentinelStatus, setSentinelStatus] = useState<{ status: string; activeCount: number; checked: number }>({
    status: 'Stopped',
    activeCount: 0,
    checked: 0,
  })
  const [sniperEnabled, setSniperEnabled] = useState(false)
  const [sniperTotal, setSniperTotal] = useState(0)
  const [mirrorEnabled, setMirrorEnabled] = useState(false)
  const [mirrorWhaleCount, setMirrorWhaleCount] = useState(0)
  const [mirrorTotal, setMirrorTotal] = useState(0)
  const [dipbuyerEnabled, setDipbuyerEnabled] = useState(false)
  const [dipbuyerTotal, setDipbuyerTotal] = useState(0)

  // Read persistent activity feed from the store (survives unmount)
  const activities = useSyncExternalStore(
    activityStore.subscribeActivities,
    activityStore.getActivities,
  )

  // Fetch portfolio data
  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true)
    try {
      const portfolio = await invoke<PortfolioResponse>('get_portfolio')
      const summaryData = await invoke<PortfolioSummary>('get_portfolio_summary')
      setSummary(summaryData)
      // Top 5 holdings by value
      const sorted = [...portfolio.coinHoldings].sort((a, b) => b.value - a.value)
      setTopHoldings(sorted.slice(0, 5))
    } catch (e) {
      console.error('Dashboard data fetch failed:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(() => fetchData(), 30_000) // Auto-refresh 30s
    return () => clearInterval(interval)
  }, [fetchData])

  // Fetch module statuses immediately on mount (don't wait for events)
  useEffect(() => {
    const fetchModuleStatuses = async () => {
      try {
        const sentinelRes = await invoke<{ status: string; intervalSecs: number; isPaused: boolean }>('get_sentinel_monitor_status')
        // Also fetch sentinel count
        const sentinels = await invoke<Array<{ id: number; isActive: boolean }>>('list_sentinels')
        const activeCount = sentinels.filter(s => s.isActive).length
        setSentinelStatus({
          status: sentinelRes.status,
          activeCount,
          checked: 0,
        })
      } catch { /* monitor may not be ready */ }

      try {
        const sniperRes = await invoke<{ enabled: boolean; totalSniped: number }>('get_sniper_status')
        setSniperEnabled(sniperRes.enabled)
        setSniperTotal(sniperRes.totalSniped)
      } catch { /* sniper may not be ready */ }

      try {
        const mirrorRes = await invoke<{ enabled: boolean; trackedWhaleCount: number; totalMirrored: number }>('get_mirror_status')
        setMirrorEnabled(mirrorRes.enabled)
        setMirrorWhaleCount(mirrorRes.trackedWhaleCount)
        setMirrorTotal(mirrorRes.totalMirrored)
      } catch { /* mirror may not be ready */ }

      try {
        const dipbuyerRes = await invoke<DipBuyerStatusResponse>('get_dipbuyer_status')
        setDipbuyerEnabled(dipbuyerRes.enabled)
        setDipbuyerTotal(dipbuyerRes.totalBought)
      } catch { /* dipbuyer may not be ready */ }
    }

    fetchModuleStatuses()
  }, [])

  // Listen to module status events (tick events for cards)
  useEffect(() => {
    const unlisteners: (() => void)[] = []

    listen<SentinelTickEvent>('sentinel-tick', (event) => {
      setSentinelStatus({
        status: event.payload.status,
        activeCount: event.payload.activeCount,
        checked: event.payload.checked,
      })
    }).then((u) => unlisteners.push(u))

    listen<{ enabled: boolean; totalSniped: number }>('sniper-tick', (event) => {
      setSniperEnabled(event.payload.enabled)
      setSniperTotal(event.payload.totalSniped)
    }).then((u) => unlisteners.push(u))

    listen<{ enabled: boolean; trackedWhaleCount: number; totalMirrored: number; tradesChecked: number }>(
      'mirror-tick',
      (event) => {
        setMirrorEnabled(event.payload.enabled)
        setMirrorWhaleCount(event.payload.trackedWhaleCount)
        setMirrorTotal(event.payload.totalMirrored)
      }
    ).then((u) => unlisteners.push(u))

    listen<DipBuyerTickEvent>('dipbuyer-tick', (event) => {
      setDipbuyerEnabled(event.payload.enabled)
      setDipbuyerTotal(event.payload.totalBought)
    }).then((u) => unlisteners.push(u))

    return () => {
      unlisteners.forEach((u) => u())
    }
  }, [])

  const pnl = summary?.totalProfitLoss ?? 0
  const pnlPct = summary?.totalProfitLossPct ?? 0
  const pnlPositive = pnl >= 0

  return (
    <div className="space-y-6">
      {/* Financial Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Banknote className="w-5 h-5 text-blue-400" />}
          label="Cash Balance"
          value={`$${(summary?.balance ?? user.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          loading={loading}
        />
        <StatCard
          icon={<PieChart className="w-5 h-5 text-purple-400" />}
          label="Portfolio Value"
          value={`$${(summary?.portfolioValue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          loading={loading}
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
          label="Net Worth"
          value={`$${(summary?.totalValue ?? user.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle={`${summary?.holdingsCount ?? 0} positions`}
          loading={loading}
        />
        <StatCard
          icon={pnlPositive ? <TrendingUp className="w-5 h-5 text-emerald-400" /> : <TrendingDown className="w-5 h-5 text-rose-400" />}
          label="Unrealized P&L"
          value={`${pnlPositive ? '+' : ''}$${pnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle={`${pnlPositive ? '+' : ''}${pnlPct.toFixed(2)}%`}
          valueClass={pnlPositive ? 'text-emerald-400' : 'text-rose-400'}
          loading={loading}
        />
      </div>

      {/* Module Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ModuleStatusCard
          title="Sentinel"
          icon={<Shield className="w-5 h-5" />}
          status={sentinelStatus.status === 'Running' ? 'active' : sentinelStatus.status === 'Paused' ? 'paused' : 'off'}
          statusText={sentinelStatus.status}
          stats={[
            { label: 'Active', value: sentinelStatus.activeCount.toString() },
            { label: 'Last Check', value: sentinelStatus.checked > 0 ? `${sentinelStatus.checked} checked` : '—' },
          ]}
          onClick={onViewSentinel}
        />
        <ModuleStatusCard
          title="Sniper"
          icon={<Crosshair className="w-5 h-5" />}
          status={sniperEnabled ? 'active' : 'off'}
          statusText={sniperEnabled ? 'Scanning' : 'Off'}
          stats={[
            { label: 'Sniped', value: sniperTotal.toString() },
          ]}
          onClick={onViewSniper}
        />
        <ModuleStatusCard
          title="Mirror"
          icon={<Users className="w-5 h-5" />}
          status={mirrorEnabled ? 'active' : mirrorWhaleCount > 0 ? 'paused' : 'off'}
          statusText={mirrorEnabled ? 'Tracking' : mirrorWhaleCount > 0 ? 'Paused' : 'Not Configured'}
          stats={[
            { label: 'Whales', value: mirrorWhaleCount.toString() },
            { label: 'Mirrored', value: mirrorTotal.toString() },
          ]}
          onClick={onViewMirror}
        />
        <ModuleStatusCard
          title="Dip Buyer"
          icon={<TrendingDown className="w-5 h-5" />}
          status={dipbuyerEnabled ? 'active' : 'off'}
          statusText={dipbuyerEnabled ? 'Hunting' : 'Off'}
          stats={[
            { label: 'Bought', value: dipbuyerTotal.toString() },
          ]}
          onClick={onViewDipBuyer}
        />
      </div>

      {/* Two Column Layout: Top Holdings + Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Holdings */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Wallet className="w-5 h-5 text-blue-400" />
              Top Holdings
            </h2>
            <button
              onClick={() => fetchData(true)}
              className="p-1.5 rounded-md hover:bg-background-tertiary transition-colors text-foreground-muted"
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-background rounded-lg animate-pulse" />
              ))}
            </div>
          ) : topHoldings.length === 0 ? (
            <p className="text-foreground-muted text-sm text-center py-6">No holdings yet</p>
          ) : (
            <div className="space-y-2">
              {topHoldings.map((h) => (
                <button
                  key={h.symbol}
                  onClick={() => onCoinClick(h.symbol)}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-background hover:bg-background-tertiary transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {h.icon ? (
                      <img
                        src={h.icon.startsWith('http') ? h.icon : `https://rugplay.com/${h.icon}`}
                        alt={h.symbol}
                        className="w-8 h-8 rounded-full"
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-background-tertiary flex items-center justify-center text-xs font-bold text-foreground-muted">
                        {h.symbol.slice(0, 2)}
                      </div>
                    )}
                    <div className="text-left">
                      <div className="font-medium text-sm">{h.symbol}</div>
                      <div className="text-xs text-foreground-muted">
                        {h.quantity.toFixed(h.quantity < 1 ? 6 : 2)} coins
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-sm">
                      ${h.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className={`text-xs ${h.percentageChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {h.percentageChange >= 0 ? '+' : ''}{h.percentageChange.toFixed(2)}%
                    </div>
                  </div>
                </button>
              ))}
              {(summary?.holdingsCount ?? 0) > 5 && (
                <button
                  onClick={onViewPortfolio}
                  className="w-full text-center text-sm text-blue-400 hover:text-blue-300 py-2 transition-colors"
                >
                  View all {summary?.holdingsCount} holdings →
                </button>
              )}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <ActivityFeed activities={activities} />
      </div>

      {/* Harvester Widget */}
      <HarvesterWidget />

      {/* Quick Actions */}
      <div className="card">
        <h2 className="text-lg font-bold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <QuickAction onClick={onViewPortfolio} icon={<Wallet className="w-5 h-5 text-blue-400" />} title="Portfolio" />
          <QuickAction onClick={onViewMarket} icon={<Store className="w-5 h-5 text-purple-400" />} title="Market" />
          <QuickAction onClick={onViewSniper} icon={<Crosshair className="w-5 h-5 text-amber-400" />} title="Sniper" />
          <QuickAction onClick={onViewSentinel} icon={<Shield className="w-5 h-5 text-emerald-400" />} title="Sentinel" />
          <QuickAction onClick={onViewMirror} icon={<Users className="w-5 h-5 text-cyan-400" />} title="Mirror" />
          <QuickAction onClick={onViewDipBuyer} icon={<TrendingDown className="w-5 h-5 text-purple-400" />} title="Dip Buyer" />
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  subtitle,
  valueClass,
  loading,
}: {
  icon: React.ReactNode
  label: string
  value: string
  subtitle?: string
  valueClass?: string
  loading: boolean
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2 text-foreground-muted">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      {loading ? (
        <div className="h-8 w-32 bg-background rounded animate-pulse" />
      ) : (
        <>
          <div className={`text-2xl font-bold ${valueClass ?? 'text-foreground'}`}>{value}</div>
          {subtitle && <div className={`text-sm mt-0.5 ${valueClass ?? 'text-foreground-muted'}`}>{subtitle}</div>}
        </>
      )}
    </div>
  )
}

function QuickAction({ onClick, icon, title }: { onClick: () => void; icon: React.ReactNode; title: string }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4 rounded-lg bg-background hover:bg-background-tertiary transition-colors"
    >
      {icon}
      <span className="text-sm font-medium">{title}</span>
    </button>
  )
}
