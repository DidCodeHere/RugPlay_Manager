import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { 
  Activity, 
  RefreshCw,
  TrendingUp,
  TrendingDown,
  User,
  Filter,
  UserPlus,
  Search,
  X,
} from 'lucide-react'
import { buildImageUrl } from '@/lib/utils'
import type { RecentTrade } from '@/lib/types'

interface LiveTradesProps {
  /** Show as compact sidebar widget */
  compact?: boolean
  /** Auto-refresh interval in ms (default: 10000) */
  refreshInterval?: number
  /** Callback when a coin symbol is clicked */
  onCoinClick?: (symbol: string) => void
  /** Callback when a username is clicked */
  onUserClick?: (userId: string) => void
}

// Whale threshold constants
const WHALE_TRADE_THRESHOLD = 10_000    // $10K = whale trade (gold border)
const MEGA_WHALE_THRESHOLD = 50_000     // $50K = mega whale (pulsing glow)

export function LiveTrades({ compact = false, refreshInterval = 10000, onCoinClick, onUserClick }: LiveTradesProps) {
  const [trades, setTrades] = useState<RecentTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchingRef = useRef(false)

  // Filter state
  const [showFilters, setShowFilters] = useState(false)
  const [filterType, setFilterType] = useState<'ALL' | 'BUY' | 'SELL'>('ALL')
  const [filterMinValue, setFilterMinValue] = useState(0)
  const [filterCoin, setFilterCoin] = useState('')
  const [filterUser, setFilterUser] = useState('')

  // Track which whales are being tracked (for "Add to Mirror" button)
  const [trackedWhaleIds, setTrackedWhaleIds] = useState<Set<string>>(new Set())

  const fetchTrades = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    
    try {
      setError(null)
      const data = await invoke<RecentTrade[]>('get_recent_trades', { limit: 50 })
      if (Array.isArray(data)) {
        setTrades(data)
      } else {
        setError('Invalid data format received')
      }
    } catch (e) {
      setError(`Failed to load trades: ${e}`)
    } finally {
      setLoading(false)
      fetchingRef.current = false
    }
  }, [])

  // Load tracked whales for "Add to Mirror" button
  useEffect(() => {
    loadTrackedWhales()
  }, [])

  const loadTrackedWhales = async () => {
    try {
      const whales = await invoke<{ userId: string }[]>('list_tracked_whales')
      setTrackedWhaleIds(new Set(whales.map((w) => w.userId)))
    } catch {
      // Mirror not available
    }
  }

  // Add user to mirror tracking
  const addToMirror = async (userId: string, username: string) => {
    try {
      await invoke('add_tracked_whale', { userId, username })
      setTrackedWhaleIds((prev) => new Set([...prev, userId]))
    } catch (e) {
      console.error('Failed to add to mirror:', e)
    }
  }

  // Filtered trades
  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      // Always exclude transfers
      const tt = (trade.tradeType || '').toUpperCase()
      if (tt === 'TRANSFER_IN' || tt === 'TRANSFER_OUT') return false
      if (filterType !== 'ALL' && tt !== filterType) return false
      if (filterMinValue > 0 && trade.totalValue < filterMinValue) return false
      if (filterCoin && !trade.coinSymbol.toLowerCase().includes(filterCoin.toLowerCase())) return false
      if (filterUser && !trade.username.toLowerCase().includes(filterUser.toLowerCase())) return false
      return true
    })
  }, [trades, filterType, filterMinValue, filterCoin, filterUser])

  const hasActiveFilters = filterType !== 'ALL' || filterMinValue > 0 || filterCoin || filterUser

  const clearFilters = () => {
    setFilterType('ALL')
    setFilterMinValue(0)
    setFilterCoin('')
    setFilterUser('')
  }

  // Initial fetch
  useEffect(() => {
    fetchTrades()
  }, [fetchTrades])

  // Auto-refresh
  useEffect(() => {
    const interval = setInterval(fetchTrades, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchTrades, refreshInterval])

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground-muted">
            <Activity className="w-3.5 h-3.5" />
            Live Trades
          </div>
          {loading && <RefreshCw className="w-3 h-3 animate-spin text-foreground-muted" />}
        </div>
        
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {trades.slice(0, 10).map((trade, i) => (
            <CompactTradeItem key={`${trade.timestamp}-${i}`} trade={trade} onCoinClick={onCoinClick} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20">
            <Activity className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Live Trades</h1>
            <p className="text-sm text-foreground-muted">
              Real-time trading activity · {filteredTrades.length} trades
              {hasActiveFilters && ` (filtered from ${trades.length})`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg transition-colors ${
              showFilters || hasActiveFilters
                ? 'bg-blue-500/20 text-blue-400'
                : 'hover:bg-background-tertiary text-foreground-muted'
            }`}
            title="Filters"
          >
            <Filter className="w-4 h-4" />
          </button>
          <button
            onClick={fetchTrades}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-background-tertiary transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Filter className="w-4 h-4 text-foreground-muted" />
              Filters
            </h3>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Trade Type */}
            <div>
              <label className="block text-xs text-foreground-muted mb-1">Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as 'ALL' | 'BUY' | 'SELL')}
                className="w-full bg-background border border-background-tertiary rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="ALL">All</option>
                <option value="BUY">Buys Only</option>
                <option value="SELL">Sells Only</option>
              </select>
            </div>
            {/* Min Value */}
            <div>
              <label className="block text-xs text-foreground-muted mb-1">Min Value ($)</label>
              <input
                type="number"
                value={filterMinValue || ''}
                onChange={(e) => setFilterMinValue(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full bg-background border border-background-tertiary rounded-lg px-3 py-1.5 text-sm"
                min={0}
                step={100}
              />
            </div>
            {/* Coin Filter */}
            <div>
              <label className="block text-xs text-foreground-muted mb-1">Coin Symbol</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-foreground-muted" />
                <input
                  type="text"
                  value={filterCoin}
                  onChange={(e) => setFilterCoin(e.target.value)}
                  placeholder="e.g. BTC"
                  className="w-full bg-background border border-background-tertiary rounded-lg pl-7 pr-3 py-1.5 text-sm"
                />
              </div>
            </div>
            {/* User Filter */}
            <div>
              <label className="block text-xs text-foreground-muted mb-1">Username</label>
              <div className="relative">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-foreground-muted" />
                <input
                  type="text"
                  value={filterUser}
                  onChange={(e) => setFilterUser(e.target.value)}
                  placeholder="Filter by user"
                  className="w-full bg-background border border-background-tertiary rounded-lg pl-7 pr-3 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-sell/20 text-sell">
          {error}
        </div>
      )}

      {/* Trades List */}
      <div className="card">
        <div className="space-y-2">
          {loading && trades.length === 0 ? (
            <div className="text-center py-12 text-foreground-muted">
              <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin opacity-50" />
              <p>Loading trades...</p>
            </div>
          ) : filteredTrades.length === 0 ? (
            <div className="text-center py-12 text-foreground-muted">
              <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{hasActiveFilters ? 'No trades match your filters' : 'No recent trades'}</p>
            </div>
          ) : (
            filteredTrades.map((trade, i) => (
              <TradeItem
                key={`${trade.timestamp}-${i}`}
                trade={trade}
                onCoinClick={onCoinClick}
                onUserClick={onUserClick}
                isTracked={trackedWhaleIds.has(trade.userId)}
                onAddToMirror={addToMirror}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function TradeItem({
  trade,
  onCoinClick,
  onUserClick,
  isTracked,
  onAddToMirror,
}: {
  trade: RecentTrade
  onCoinClick?: (symbol: string) => void
  onUserClick?: (userId: string) => void
  isTracked?: boolean
  onAddToMirror?: (userId: string, username: string) => void
}) {
  const isBuy = (trade.tradeType || '').toUpperCase() === 'BUY'
  const iconUrl = buildImageUrl(trade.coinIcon)
  const userImageUrl = buildImageUrl(trade.userImage)

  // Skip transfers entirely
  const tradeTypeUpper = (trade.tradeType || '').toUpperCase()
  if (tradeTypeUpper === 'TRANSFER_IN' || tradeTypeUpper === 'TRANSFER_OUT') return null

  // Whale detection
  const isWhale = trade.totalValue >= WHALE_TRADE_THRESHOLD
  const isMegaWhale = trade.totalValue >= MEGA_WHALE_THRESHOLD

  const formatTime = (timestamp: number) => {
    // API returns timestamp in milliseconds
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    
    if (diffSecs < 60) return `${diffSecs}s ago`
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`
    return date.toLocaleDateString()
  }

  const formatValue = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
    return `$${value.toFixed(2)}`
  }

  const formatAmount = (amount: number) => {
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`
    return amount.toFixed(2)
  }

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg transition-colors group ${
        isMegaWhale
          ? 'bg-amber-500/10 border border-amber-500/30 animate-pulse-slow'
          : isWhale
          ? 'bg-amber-500/5 border border-amber-500/20'
          : 'bg-background hover:bg-background-tertiary/50'
      } ${isTracked ? 'ring-1 ring-cyan-500/30' : ''}`}
    >
      {/* User Avatar */}
      <div
        onClick={() => onUserClick?.(trade.userId)}
        className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 ${
          isWhale ? 'ring-2 ring-amber-400/50' : 'bg-background-tertiary'
        } ${onUserClick ? 'cursor-pointer' : ''}`}
      >
        {userImageUrl ? (
          <img 
            src={userImageUrl} 
            alt={trade.username}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <User className="w-5 h-5 text-foreground-muted" />
        )}
      </div>

      {/* Trade Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            onClick={() => onUserClick?.(trade.userId)}
            className={`font-medium truncate ${isWhale ? 'text-amber-300' : ''} ${onUserClick ? 'cursor-pointer hover:underline' : ''}`}
          >
            {trade.username}
          </span>
          {isWhale && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold">
              🐋 WHALE
            </span>
          )}
          {isTracked && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold">
              TRACKED
            </span>
          )}
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            isBuy ? 'bg-buy/20 text-buy' : 'bg-sell/20 text-sell'
          }`}>
            {isBuy ? 'BUY' : 'SELL'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <span>{formatAmount(trade.amount)}</span>
          <span
            className={`flex items-center gap-1 ${onCoinClick ? 'cursor-pointer hover:text-foreground transition-colors' : ''}`}
            onClick={() => onCoinClick?.(trade.coinSymbol)}
          >
            {iconUrl && (
              <img src={iconUrl} alt={trade.coinSymbol} className="w-4 h-4 rounded-full" />
            )}
            ${trade.coinSymbol}
          </span>
        </div>
      </div>

      {/* Value & Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="text-right">
          <div className={`font-medium ${isBuy ? 'text-buy' : 'text-sell'}`}>
            {formatValue(trade.totalValue)}
          </div>
          <div className="text-xs text-foreground-muted">
            {formatTime(trade.timestamp)}
          </div>
        </div>
        {/* Add to Mirror button — shows on hover for non-tracked users */}
        {!isTracked && onAddToMirror && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAddToMirror(trade.userId, trade.username)
            }}
            className="p-1.5 rounded-md text-foreground-muted opacity-0 group-hover:opacity-100 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all"
            title={`Track ${trade.username} in Mirror`}
          >
            <UserPlus className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}

function CompactTradeItem({ trade, onCoinClick }: { trade: RecentTrade; onCoinClick?: (symbol: string) => void }) {
  const isBuy = (trade.tradeType || '').toUpperCase() === 'BUY'

  const formatTime = (timestamp: number) => {
    // API returns timestamp in milliseconds
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    
    if (diffSecs < 60) return `${diffSecs}s`
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m`
    return `${Math.floor(diffSecs / 3600)}h`
  }

  const formatValue = (value: number) => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
    return `$${value.toFixed(0)}`
  }

  return (
    <div
      onClick={() => onCoinClick?.(trade.coinSymbol)}
      className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-background-tertiary/50 transition-colors ${onCoinClick ? 'cursor-pointer' : ''}`}
    >
      {isBuy ? (
        <TrendingUp className="w-3 h-3 text-buy flex-shrink-0" />
      ) : (
        <TrendingDown className="w-3 h-3 text-sell flex-shrink-0" />
      )}
      <span className="truncate flex-1">{trade.username}</span>
      <span className={`font-medium ${isBuy ? 'text-buy' : 'text-sell'}`}>
        {formatValue(trade.totalValue)}
      </span>
      <span className="text-foreground-muted">{formatTime(trade.timestamp)}</span>
    </div>
  )
}
