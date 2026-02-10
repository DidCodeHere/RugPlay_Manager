import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  ArrowLeft,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Lock,
  Users,
  DollarSign,
  BarChart3,
  Wallet,
  ZoomIn,
  ZoomOut,
  Maximize2,
  MessageCircle,
  Send,
  Shield,
  AlertTriangle,
  Activity,
  Droplets,
  Eye,
  Heart,
} from 'lucide-react'
import { buildImageUrl } from '@/lib/utils'
import type { CoinWithChartResponse, CoinHoldersResponse, TradeResult, Holder, CoinHolding, CoinComment } from '@/lib/types'

interface CoinDetailPageProps {
  symbol: string
  onBack: () => void
  onTradeComplete?: () => void
  holdings?: CoinHolding[]
  onUserClick?: (userId: string) => void
}

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
]

export function CoinDetailPage({ symbol, onBack, onTradeComplete, holdings = [], onUserClick }: CoinDetailPageProps) {
  const [data, setData] = useState<CoinWithChartResponse | null>(null)
  const [holders, setHolders] = useState<CoinHoldersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState<Timeframe>('1m')
  const [comments, setComments] = useState<CoinComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [postingComment, setPostingComment] = useState(false)
  const [activeTab, setActiveTab] = useState<'analysis' | 'holders' | 'pool'>('analysis')
  const [livePrice, setLivePrice] = useState<number | null>(null)

  const fetchCoinData = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }

    try {
      const result = await invoke<CoinWithChartResponse>('get_coin_with_chart', {
        symbol,
        timeframe,
      })
      setData(result)
      setLivePrice(result.coin.currentPrice)
    } catch (e) {
      console.error('Failed to fetch coin data:', e)
      if (!silent) setError(String(e))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [symbol, timeframe])

  const fetchHolders = useCallback(async () => {
    try {
      const result = await invoke<CoinHoldersResponse>('get_coin_holders', {
        symbol,
        limit: 20,
      })
      setHolders(result)
    } catch (e) {
      console.error('Failed to fetch holders:', e)
    }
  }, [symbol])

  useEffect(() => {
    fetchCoinData()
    fetchHolders()
  }, [fetchCoinData, fetchHolders])

  // Auto-refresh price every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchCoinData(true), 10_000)
    return () => clearInterval(interval)
  }, [fetchCoinData])

  const fetchComments = useCallback(async () => {
    try {
      const result = await invoke<CoinComment[]>('get_coin_comments', { symbol })
      setComments(result)
    } catch (e) {
      console.error('Failed to fetch comments:', e)
    }
  }, [symbol])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  const handlePostComment = async () => {
    const trimmed = commentText.trim()
    if (!trimmed || postingComment) return
    setPostingComment(true)
    try {
      const newComment = await invoke<CoinComment>('post_coin_comment', { symbol, content: trimmed })
      setComments(prev => [newComment, ...prev])
      setCommentText('')
    } catch (e) {
      console.error('Failed to post comment:', e)
    } finally {
      setPostingComment(false)
    }
  }

  // Computed analysis from existing data
  const analysis = useMemo(() => {
    if (!data || !holders) return null
    const { coin } = data
    const mcap = coin.marketCap
    const vol = coin.volume24h
    const volRatio = mcap > 0 ? (vol / mcap) * 100 : 0

    // Market cap tier
    let mcapTier: string
    let mcapColor: string
    if (mcap >= 1_000_000) { mcapTier = 'Large Cap'; mcapColor = 'text-emerald-400' }
    else if (mcap >= 100_000) { mcapTier = 'Mid Cap'; mcapColor = 'text-blue-400' }
    else if (mcap >= 10_000) { mcapTier = 'Small Cap'; mcapColor = 'text-yellow-400' }
    else { mcapTier = 'Micro Cap'; mcapColor = 'text-orange-400' }

    // Volume health
    let volHealth: string
    let volColor: string
    if (volRatio > 20) { volHealth = 'Very Active'; volColor = 'text-emerald-400' }
    else if (volRatio > 5) { volHealth = 'Healthy'; volColor = 'text-blue-400' }
    else if (volRatio > 1) { volHealth = 'Low'; volColor = 'text-yellow-400' }
    else { volHealth = 'Dead'; volColor = 'text-red-400' }

    // Holder concentration
    const top3Pct = holders.holders.slice(0, 3).reduce((sum, h) => sum + h.percentage, 0)
    const top10Pct = holders.holders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0)
    let concRisk: string
    let concColor: string
    if (top3Pct > 60) { concRisk = 'Very High'; concColor = 'text-red-400' }
    else if (top3Pct > 40) { concRisk = 'High'; concColor = 'text-orange-400' }
    else if (top3Pct > 20) { concRisk = 'Moderate'; concColor = 'text-yellow-400' }
    else { concRisk = 'Distributed'; concColor = 'text-emerald-400' }

    // Liquidity depth
    const poolUsd = coin.poolBaseCurrencyAmount
    let liqLabel: string
    let liqColor: string
    if (poolUsd >= 100_000) { liqLabel = 'Deep'; liqColor = 'text-emerald-400' }
    else if (poolUsd >= 10_000) { liqLabel = 'Good'; liqColor = 'text-blue-400' }
    else if (poolUsd >= 1_000) { liqLabel = 'Thin'; liqColor = 'text-yellow-400' }
    else { liqLabel = 'Dangerous'; liqColor = 'text-red-400' }

    // Price momentum
    const change = coin.change24h
    let momentum: string
    let momColor: string
    if (change > 50) { momentum = 'Parabolic'; momColor = 'text-emerald-400' }
    else if (change > 10) { momentum = 'Bullish'; momColor = 'text-emerald-400' }
    else if (change > -10) { momentum = 'Neutral'; momColor = 'text-foreground-muted' }
    else if (change > -30) { momentum = 'Bearish'; momColor = 'text-orange-400' }
    else { momentum = 'Dumping'; momColor = 'text-red-400' }

    // Overall risk score (0-100, lower = safer)
    let riskScore = 0
    if (top3Pct > 50) riskScore += 30
    else if (top3Pct > 30) riskScore += 15
    if (poolUsd < 1_000) riskScore += 25
    else if (poolUsd < 10_000) riskScore += 10
    if (volRatio < 1) riskScore += 15
    if (change < -30) riskScore += 20
    else if (change < -10) riskScore += 10
    if (holders.totalHolders < 5) riskScore += 10

    let riskLabel: string
    let riskColor: string
    if (riskScore >= 60) { riskLabel = 'High Risk'; riskColor = 'text-red-400' }
    else if (riskScore >= 35) { riskLabel = 'Medium Risk'; riskColor = 'text-yellow-400' }
    else { riskLabel = 'Lower Risk'; riskColor = 'text-emerald-400' }

    return {
      mcapTier, mcapColor, volHealth, volColor, volRatio,
      top3Pct, top10Pct, concRisk, concColor,
      liqLabel, liqColor, poolUsd,
      momentum, momColor,
      riskScore, riskLabel, riskColor,
    }
  }, [data, holders])

  const formatPrice = (price: number) => {
    if (price < 0.0001) return `$${price.toExponential(2)}`
    if (price < 0.01) return `$${price.toFixed(6)}`
    if (price < 1) return `$${price.toFixed(4)}`
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const formatNumber = (num: number) => {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
    return num.toFixed(2)
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-foreground-muted" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-foreground-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Market
        </button>
        <div className="card text-center py-12">
          <p className="text-sell mb-4">{error || 'Failed to load coin data'}</p>
          <button onClick={() => fetchCoinData()} className="btn-primary">
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const { coin, candlestickData, volumeData } = data
  const iconUrl = buildImageUrl(coin.icon)
  const isUp = coin.change24h > 0
  const isDown = coin.change24h < 0
  const displayPrice = livePrice ?? coin.currentPrice

  // Find user's holding for this coin
  const userHolding = holdings.find(h => h.symbol.toLowerCase() === coin.symbol.toLowerCase())

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-background-tertiary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-background-tertiary flex items-center justify-center overflow-hidden ring-2 ring-background-tertiary">
              {iconUrl ? (
                <img src={iconUrl} alt={coin.symbol} className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none' }} />
              ) : (
                <span className="text-lg font-bold">{coin.symbol.substring(0, 2)}</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">${coin.symbol}</h1>
                {coin.isLocked && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-xs">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                )}
                {analysis && (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    analysis.riskScore >= 60 ? 'bg-red-500/20 text-red-400' :
                    analysis.riskScore >= 35 ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    {analysis.riskLabel}
                  </span>
                )}
              </div>
              <p className="text-sm text-foreground-muted">{coin.name}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right mr-2 hidden sm:block">
            <div className="text-2xl font-bold font-mono">{formatPrice(displayPrice)}</div>
            <div className={`flex items-center justify-end gap-1 text-sm ${
              isUp ? 'text-buy' : isDown ? 'text-sell' : 'text-foreground-muted'
            }`}>
              {isUp && <TrendingUp className="w-3 h-3" />}
              {isDown && <TrendingDown className="w-3 h-3" />}
              {isUp ? '+' : ''}{coin.change24h.toFixed(2)}%
            </div>
          </div>
          <button
            onClick={() => fetchCoinData()}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-background-tertiary transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="card p-3">
          <div className="text-xs text-foreground-muted mb-1">Price</div>
          <div className="text-lg font-bold font-mono">{formatPrice(displayPrice)}</div>
          <div className={`flex items-center gap-1 text-xs ${
            isUp ? 'text-buy' : isDown ? 'text-sell' : 'text-foreground-muted'
          }`}>
            {isUp && <TrendingUp className="w-3 h-3" />}
            {isDown && <TrendingDown className="w-3 h-3" />}
            {isUp ? '+' : ''}{coin.change24h.toFixed(2)}%
          </div>
        </div>

        <div className="card p-3">
          <div className="flex items-center gap-1 text-xs text-foreground-muted mb-1">
            <DollarSign className="w-3 h-3" /> Market Cap
          </div>
          <div className="text-lg font-bold">${formatNumber(coin.marketCap)}</div>
          {analysis && <div className={`text-xs ${analysis.mcapColor}`}>{analysis.mcapTier}</div>}
        </div>

        <div className="card p-3">
          <div className="flex items-center gap-1 text-xs text-foreground-muted mb-1">
            <BarChart3 className="w-3 h-3" /> Volume 24h
          </div>
          <div className="text-lg font-bold">${formatNumber(coin.volume24h)}</div>
          {analysis && <div className={`text-xs ${analysis.volColor}`}>{analysis.volHealth} ({analysis.volRatio.toFixed(1)}%)</div>}
        </div>

        <div className="card p-3">
          <div className="flex items-center gap-1 text-xs text-foreground-muted mb-1">
            <Droplets className="w-3 h-3" /> Liquidity
          </div>
          <div className="text-lg font-bold">${formatNumber(coin.poolBaseCurrencyAmount)}</div>
          {analysis && <div className={`text-xs ${analysis.liqColor}`}>{analysis.liqLabel}</div>}
        </div>

        <div className="card p-3">
          <div className="flex items-center gap-1 text-xs text-foreground-muted mb-1">
            <Users className="w-3 h-3" /> Holders
          </div>
          <div className="text-lg font-bold">{holders?.totalHolders ?? '...'}</div>
          {analysis && <div className={`text-xs ${analysis.concColor}`}>Top 3: {analysis.top3Pct.toFixed(1)}%</div>}
        </div>
      </div>

      {/* Chart & Trade Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Price Chart</h2>
            <div className="flex items-center gap-1 bg-background rounded-lg p-1">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.value}
                  onClick={() => setTimeframe(tf.value)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    timeframe === tf.value
                      ? 'bg-emerald-600 text-white'
                      : 'text-foreground-muted hover:text-foreground'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>
          <InteractiveChart
            candlestickData={candlestickData}
            volumeData={volumeData || []}
            currentPrice={displayPrice}
            formatPrice={formatPrice}
          />
        </div>

        {/* Trade Panel */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Trade</h2>
          
          {userHolding && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-emerald-400 font-medium">Your Holdings</span>
              </div>
              <div className="text-lg font-bold font-mono">{userHolding.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })} coins</div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-foreground-muted">Live Value</span>
                <span className="font-mono">${(userHolding.quantity * displayPrice).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground-muted">Avg Entry</span>
                <span className="font-mono">{formatPrice(userHolding.avgPurchasePrice)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground-muted">P/L</span>
                <span className={`font-mono ${userHolding.percentageChange >= 0 ? 'text-buy' : 'text-sell'}`}>
                  {userHolding.percentageChange >= 0 ? '+' : ''}{userHolding.percentageChange.toFixed(2)}%
                </span>
              </div>
            </div>
          )}
          
          <SimpleTrade
            symbol={coin.symbol}
            currentPrice={displayPrice}
            userQuantity={userHolding?.quantity}
            onTradeComplete={() => {
              fetchCoinData()
              onTradeComplete?.()
            }}
          />
        </div>
      </div>

      {/* Analysis / Holders / Pool — Tabbed */}
      <div className="card">
        <div className="flex items-center gap-1 border-b border-background-tertiary mb-4">
          {([
            { key: 'analysis' as const, label: 'Analysis', icon: <Activity className="w-3.5 h-3.5" /> },
            { key: 'holders' as const, label: `Holders (${holders?.totalHolders ?? '...'})`, icon: <Users className="w-3.5 h-3.5" /> },
            { key: 'pool' as const, label: 'Pool Info', icon: <Droplets className="w-3.5 h-3.5" /> },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
                activeTab === tab.key
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-foreground-muted hover:text-foreground'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Analysis Tab */}
        {activeTab === 'analysis' && analysis && (
          <div className="space-y-4">
            {/* Risk Overview */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-background-tertiary/50">
              <Shield className={`w-8 h-8 ${analysis.riskColor}`} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Risk Assessment</span>
                  <span className={`font-bold ${analysis.riskColor}`}>{analysis.riskLabel}</span>
                </div>
                <div className="w-full h-2 bg-background rounded-full mt-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      analysis.riskScore >= 60 ? 'bg-red-500' :
                      analysis.riskScore >= 35 ? 'bg-yellow-500' :
                      'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(analysis.riskScore, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Momentum */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground-muted flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> Momentum
                </h3>
                <div className="p-3 rounded-lg bg-background-tertiary/30 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground-muted">24h Trend</span>
                    <span className={`font-medium ${analysis.momColor}`}>{analysis.momentum}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground-muted">Volume / MCap</span>
                    <span className={`font-mono ${analysis.volColor}`}>{analysis.volRatio.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground-muted">Vol Health</span>
                    <span className={`font-medium ${analysis.volColor}`}>{analysis.volHealth}</span>
                  </div>
                </div>
              </div>

              {/* Holder Concentration */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground-muted flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> Concentration
                </h3>
                <div className="p-3 rounded-lg bg-background-tertiary/30 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground-muted">Top 3 Hold</span>
                    <span className={`font-mono ${analysis.concColor}`}>{analysis.top3Pct.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground-muted">Top 10 Hold</span>
                    <span className="font-mono">{analysis.top10Pct.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground-muted">Risk</span>
                    <span className={`font-medium ${analysis.concColor}`}>{analysis.concRisk}</span>
                  </div>
                </div>
              </div>

              {/* Liquidity */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground-muted flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5" /> Liquidity
                </h3>
                <div className="p-3 rounded-lg bg-background-tertiary/30 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground-muted">Pool USD</span>
                    <span className="font-mono">${formatNumber(coin.poolBaseCurrencyAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground-muted">Depth</span>
                    <span className={`font-medium ${analysis.liqColor}`}>{analysis.liqLabel}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground-muted">Pool Coins</span>
                    <span className="font-mono">{formatNumber(coin.poolCoinAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Market Info */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-foreground-muted flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" /> Market Info
                </h3>
                <div className="p-3 rounded-lg bg-background-tertiary/30 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground-muted">Market Cap</span>
                    <span className={`font-medium ${analysis.mcapColor}`}>{analysis.mcapTier}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground-muted">Circ. Supply</span>
                    <span className="font-mono">{formatNumber(coin.circulatingSupply)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground-muted">Holders</span>
                    <span className="font-mono">{holders?.totalHolders ?? '-'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Warnings */}
            {analysis.riskScore >= 35 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <div className="text-sm text-yellow-400/80">
                  {analysis.top3Pct > 50 && <p>Top 3 holders control over {analysis.top3Pct.toFixed(0)}% of supply — rug pull risk.</p>}
                  {analysis.poolUsd < 1_000 && <p>Very thin liquidity — large trades will cause extreme price impact.</p>}
                  {coin.change24h < -30 && <p>Price has dropped over 30% in 24h — potential dump in progress.</p>}
                  {analysis.volRatio < 1 && <p>Trading volume is extremely low relative to market cap.</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'analysis' && !analysis && (
          <div className="text-center py-8 text-foreground-muted">Loading analysis...</div>
        )}

        {/* Holders Tab */}
        {activeTab === 'holders' && (
          <div>
            {holders ? (
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {holders.holders.map((holder) => (
                  <HolderRow key={holder.userId} holder={holder} onUserClick={onUserClick} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-foreground-muted">Loading holders...</div>
            )}
          </div>
        )}

        {/* Pool Info Tab */}
        {activeTab === 'pool' && (
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-background-tertiary/50">
              <span className="text-foreground-muted">Pool Coins</span>
              <span className="font-mono">{formatNumber(coin.poolCoinAmount)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-background-tertiary/50">
              <span className="text-foreground-muted">Pool USD</span>
              <span className="font-mono">${formatNumber(coin.poolBaseCurrencyAmount)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-background-tertiary/50">
              <span className="text-foreground-muted">Circulating Supply</span>
              <span className="font-mono">{formatNumber(coin.circulatingSupply)}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-background-tertiary/50">
              <span className="text-foreground-muted">Current Price</span>
              <span className="font-mono">{formatPrice(displayPrice)}</span>
            </div>
            {holders?.poolInfo && (
              <>
                <div className="flex justify-between py-2 border-b border-background-tertiary/50">
                  <span className="text-foreground-muted">Pool Price (from holders API)</span>
                  <span className="font-mono">{formatPrice(holders.poolInfo.currentPrice)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Comments Section */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="w-5 h-5 text-foreground-muted" />
          <h2 className="text-lg font-semibold">Comments ({comments.length})</h2>
        </div>

        {/* Post Comment */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePostComment()}
            placeholder="Write a comment..."
            maxLength={500}
            className="input flex-1"
          />
          <button
            onClick={handlePostComment}
            disabled={postingComment || !commentText.trim()}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-emerald-800 disabled:cursor-not-allowed transition-colors"
          >
            {postingComment ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>

        {/* Comment List */}
        {comments.length === 0 ? (
          <div className="text-center py-6 text-foreground-muted text-sm">
            No comments yet. Be the first to comment!
          </div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {comments.map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                onUserClick={onUserClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function HolderRow({ holder, onUserClick }: { holder: Holder; onUserClick?: (userId: string) => void }) {
  const imageUrl = buildImageUrl(holder.image)

  return (
    <div
      onClick={() => onUserClick?.(String(holder.userId))}
      className={`flex items-center gap-3 p-2 rounded-lg hover:bg-background-tertiary/50 transition-colors ${onUserClick ? 'cursor-pointer' : ''}`}
    >
      <span className="w-6 text-center text-sm text-foreground-muted">#{holder.rank}</span>
      <div className="w-8 h-8 rounded-full bg-background-tertiary flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={holder.username} className="w-full h-full object-cover" />
        ) : (
          <Users className="w-4 h-4 text-foreground-muted" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate hover:underline">{holder.username}</div>
        <div className="text-xs text-foreground-muted">{holder.percentage.toFixed(2)}%</div>
      </div>
      <div className="text-right text-sm">
        <div className="font-mono">${holder.liquidationValue.toFixed(2)}</div>
      </div>
    </div>
  )
}

function CommentRow({ comment, onUserClick }: { comment: CoinComment; onUserClick?: (userId: string) => void }) {
  const imageUrl = buildImageUrl(comment.userImage)
  const timeAgo = getTimeAgo(comment.createdAt)

  return (
    <div className="flex gap-3 p-3 rounded-lg hover:bg-background-tertiary/30 transition-colors">
      <div
        onClick={() => onUserClick?.(String(comment.userId))}
        className={`w-8 h-8 rounded-full bg-background-tertiary flex items-center justify-center overflow-hidden shrink-0 ${onUserClick ? 'cursor-pointer' : ''}`}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={comment.userUsername} className="w-full h-full object-cover" />
        ) : (
          <Users className="w-4 h-4 text-foreground-muted" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            onClick={() => onUserClick?.(String(comment.userId))}
            className={`text-sm font-medium truncate ${onUserClick ? 'cursor-pointer hover:underline' : ''}`}
          >
            {comment.userName || comment.userUsername}
          </span>
          <span className="text-xs text-foreground-muted">@{comment.userUsername}</span>
          <span className="text-xs text-foreground-muted">{timeAgo}</span>
        </div>
        <p className="text-sm mt-0.5 break-words">{comment.content}</p>
        {comment.likesCount > 0 && (
          <div className="flex items-center gap-1 mt-1 text-xs text-foreground-muted">
            <Heart className={`w-3 h-3 ${comment.isLikedByUser ? 'fill-rose-400 text-rose-400' : ''}`} />
            {comment.likesCount}
          </div>
        )}
      </div>
    </div>
  )
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString()
}

// Interactive Chart with zoom, drag-pan, volume bars, current price line, and range measurement
function InteractiveChart({
  candlestickData,
  volumeData,
  currentPrice,
  formatPrice,
}: {
  candlestickData: Array<{ time: number; open: number; high: number; low: number; close: number }>
  volumeData: Array<{ time: number; volume: number }>
  currentPrice: number
  formatPrice: (p: number) => string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [panOffset, setPanOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState(0)
  const [dragPanStart, setDragPanStart] = useState(0)
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null)
  const [tooltipData, setTooltipData] = useState<{ candle: typeof candlestickData[0]; vol?: number; x: number; y: number } | null>(null)
  const hasInitialized = useRef(false)

  // Range measurement state (shift+click to start, shift+click to end)
  const [rangeStart, setRangeStart] = useState<{ idx: number; candle: typeof candlestickData[0] } | null>(null)
  const [rangeEnd, setRangeEnd] = useState<{ idx: number; candle: typeof candlestickData[0] } | null>(null)
  const [isRangeMode, setIsRangeMode] = useState(false)

  // Auto-zoom to recent candles on first load — show last 10 candles
  useEffect(() => {
    if (candlestickData.length > 0 && !hasInitialized.current) {
      hasInitialized.current = true
      const targetVisible = 10
      if (candlestickData.length > targetVisible) {
        const newZoom = candlestickData.length / targetVisible
        setZoomLevel(newZoom)
        const visibleCount = Math.max(5, Math.floor(candlestickData.length / newZoom))
        setPanOffset(Math.max(0, candlestickData.length - visibleCount))
      }
    }
  }, [candlestickData])

  // Reset initialization when data changes significantly (e.g. timeframe change)
  useEffect(() => {
    hasInitialized.current = false
    setRangeStart(null)
    setRangeEnd(null)
  }, [candlestickData.length])

  const chartHeight = 300
  const volumeHeight = 60
  const totalHeight = chartHeight + volumeHeight + 30
  const leftPadding = 70
  const rightPadding = 10
  const topPadding = 10

  // Build volume lookup map
  const volumeMap = useMemo(() => {
    const map = new Map<number, number>()
    for (const v of volumeData) {
      map.set(v.time, v.volume)
    }
    return map
  }, [volumeData])

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !candlestickData.length) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = container.clientWidth
    const h = totalHeight

    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.scale(dpr, dpr)

    // Clear
    ctx.fillStyle = 'transparent'
    ctx.clearRect(0, 0, w, h)

    const dataLen = candlestickData.length
    const visibleCount = Math.max(5, Math.floor(dataLen / zoomLevel))
    const maxPan = Math.max(0, dataLen - visibleCount)
    const clampedPan = Math.min(Math.max(0, panOffset), maxPan)

    const visibleData = candlestickData.slice(clampedPan, clampedPan + visibleCount)
    if (visibleData.length === 0) return

    const chartAreaW = w - leftPadding - rightPadding
    const candleW = Math.max(2, chartAreaW / visibleData.length * 0.7)
    const gap = chartAreaW / visibleData.length

    // Price range for visible data
    const allPrices = visibleData.flatMap(c => [c.high, c.low])
    const minP = Math.min(...allPrices)
    const maxP = Math.max(...allPrices)
    const priceRange = maxP - minP || minP * 0.01 || 1
    const paddedMin = minP - priceRange * 0.05
    const paddedMax = maxP + priceRange * 0.05
    const paddedRange = paddedMax - paddedMin

    // Volume range
    const visibleVolumes = visibleData.map(c => volumeMap.get(c.time) || 0)
    const maxVol = Math.max(...visibleVolumes, 1)

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
    ctx.lineWidth = 1
    const gridLevels = 5
    for (let i = 0; i <= gridLevels; i++) {
      const ratio = i / gridLevels
      const y = topPadding + ratio * chartHeight
      ctx.beginPath()
      ctx.moveTo(leftPadding, y)
      ctx.lineTo(w - rightPadding, y)
      ctx.stroke()

      // Price labels
      const price = paddedMax - ratio * paddedRange
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.font = '10px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(formatPrice(price), leftPadding - 5, y + 3)
    }

    // Draw candlesticks
    visibleData.forEach((candle, i) => {
      const x = leftPadding + i * gap + gap / 2
      const isGreen = candle.close >= candle.open

      const highY = topPadding + ((paddedMax - candle.high) / paddedRange) * chartHeight
      const lowY = topPadding + ((paddedMax - candle.low) / paddedRange) * chartHeight
      const openY = topPadding + ((paddedMax - candle.open) / paddedRange) * chartHeight
      const closeY = topPadding + ((paddedMax - candle.close) / paddedRange) * chartHeight

      const bodyTop = Math.min(openY, closeY)
      const bodyH = Math.max(1, Math.abs(closeY - openY))

      // Wick
      ctx.strokeStyle = isGreen ? '#10b981' : '#ef4444'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, highY)
      ctx.lineTo(x, lowY)
      ctx.stroke()

      // Body
      ctx.fillStyle = isGreen ? '#10b981' : '#ef4444'
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH)
    })

    // Current price line
    const currentPriceY = topPadding + ((paddedMax - currentPrice) / paddedRange) * chartHeight
    if (currentPriceY >= topPadding && currentPriceY <= topPadding + chartHeight) {
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(leftPadding, currentPriceY)
      ctx.lineTo(w - rightPadding, currentPriceY)
      ctx.stroke()
      ctx.setLineDash([])

      // Price label on right
      ctx.fillStyle = '#3b82f6'
      ctx.fillRect(w - rightPadding - 60, currentPriceY - 8, 60, 16)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(formatPrice(currentPrice), w - rightPadding - 30, currentPriceY + 3)
    }

    // Volume bars
    const volTop = topPadding + chartHeight + 10
    visibleData.forEach((candle, i) => {
      const x = leftPadding + i * gap + gap / 2
      const vol = volumeMap.get(candle.time) || 0
      if (vol <= 0) return

      const barH = (vol / maxVol) * volumeHeight
      const isGreen = candle.close >= candle.open

      ctx.fillStyle = isGreen ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'
      ctx.fillRect(x - candleW / 2, volTop + volumeHeight - barH, candleW, barH)
    })

    // Volume label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('Vol', leftPadding - 5, volTop + 10)

    // Crosshair
    if (crosshair) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
      ctx.lineWidth = 1
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.moveTo(crosshair.x, topPadding)
      ctx.lineTo(crosshair.x, topPadding + chartHeight + volumeHeight + 10)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(leftPadding, crosshair.y)
      ctx.lineTo(w - rightPadding, crosshair.y)
      ctx.stroke()
      ctx.setLineDash([])

      // Price at crosshair
      if (crosshair.y >= topPadding && crosshair.y <= topPadding + chartHeight) {
        const hoverPrice = paddedMax - ((crosshair.y - topPadding) / chartHeight) * paddedRange
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
        ctx.fillRect(0, crosshair.y - 8, leftPadding - 2, 16)
        ctx.fillStyle = '#000'
        ctx.font = '9px monospace'
        ctx.textAlign = 'right'
        ctx.fillText(formatPrice(hoverPrice), leftPadding - 5, crosshair.y + 3)
      }
    }

    // Range measurement highlight
    if (rangeStart && rangeEnd) {
      const startGlobalIdx = rangeStart.idx
      const endGlobalIdx = rangeEnd.idx
      const rStart = Math.min(startGlobalIdx, endGlobalIdx)
      const rEnd = Math.max(startGlobalIdx, endGlobalIdx)

      // Map global indices to visible indices
      const visStart = rStart - clampedPan
      const visEnd = rEnd - clampedPan

      if (visEnd >= 0 && visStart < visibleData.length) {
        const drawStart = Math.max(0, visStart)
        const drawEnd = Math.min(visibleData.length - 1, visEnd)

        const x1 = leftPadding + drawStart * gap
        const x2 = leftPadding + (drawEnd + 1) * gap

        // Shaded region
        ctx.fillStyle = 'rgba(59, 130, 246, 0.08)'
        ctx.fillRect(x1, topPadding, x2 - x1, chartHeight)

        // Vertical boundary lines
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.moveTo(x1, topPadding)
        ctx.lineTo(x1, topPadding + chartHeight)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x2, topPadding)
        ctx.lineTo(x2, topPadding + chartHeight)
        ctx.stroke()
        ctx.setLineDash([])

        // Range info label at top
        const startCandle = candlestickData[rStart]
        const endCandle = candlestickData[rEnd]
        const priceChange = endCandle.close - startCandle.open
        const pctChange = (priceChange / startCandle.open) * 100
        const isUp = priceChange >= 0
        const candleCount = rEnd - rStart + 1

        const labelText = `${candleCount} candles | ${isUp ? '+' : ''}${formatPrice(priceChange)} (${isUp ? '+' : ''}${pctChange.toFixed(2)}%)`

        ctx.font = 'bold 10px monospace'
        const textWidth = ctx.measureText(labelText).width
        const labelX = (x1 + x2) / 2
        const labelY = topPadding + 14

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
        ctx.fillRect(labelX - textWidth / 2 - 6, labelY - 10, textWidth + 12, 16)
        ctx.fillStyle = isUp ? '#10b981' : '#ef4444'
        ctx.textAlign = 'center'
        ctx.fillText(labelText, labelX, labelY)
      }
    }
  }, [candlestickData, volumeData, zoomLevel, panOffset, currentPrice, crosshair, formatPrice, volumeMap, totalHeight, rangeStart, rangeEnd])

  useEffect(() => {
    drawChart()
  }, [drawChart])

  // Resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const obs = new ResizeObserver(() => drawChart())
    obs.observe(container)
    return () => obs.disconnect()
  }, [drawChart])

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.deltaY < 0) {
      setZoomLevel(z => Math.min(z * 1.3, candlestickData.length / 3))
    } else {
      setZoomLevel(z => Math.max(z / 1.3, 1))
    }
  }, [candlestickData.length])

  // Attach wheel listener with passive: false to prevent page scroll
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const handleMouseDown = (e: React.MouseEvent) => {
    // Shift+click: range measurement
    if (e.shiftKey) {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const dataLen = candlestickData.length
      const visibleCount = Math.max(5, Math.floor(dataLen / zoomLevel))
      const maxPan = Math.max(0, dataLen - visibleCount)
      const clampedPan = Math.min(Math.max(0, panOffset), maxPan)
      const chartAreaW = rect.width - leftPadding - rightPadding
      const gap = chartAreaW / visibleCount
      const visIdx = Math.floor((x - leftPadding) / gap)
      const globalIdx = clampedPan + visIdx

      if (globalIdx >= 0 && globalIdx < dataLen) {
        if (!rangeStart || rangeEnd) {
          // Start new range
          setRangeStart({ idx: globalIdx, candle: candlestickData[globalIdx] })
          setRangeEnd(null)
          setIsRangeMode(true)
        } else {
          // Complete range
          setRangeEnd({ idx: globalIdx, candle: candlestickData[globalIdx] })
          setIsRangeMode(false)
        }
      }
      return
    }

    setIsDragging(true)
    setDragStart(e.clientX)
    setDragPanStart(panOffset)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setCrosshair({ x, y })

    // Find nearest candle for tooltip
    const dataLen = candlestickData.length
    const visibleCount = Math.max(5, Math.floor(dataLen / zoomLevel))
    const maxPan = Math.max(0, dataLen - visibleCount)
    const clampedPan = Math.min(Math.max(0, panOffset), maxPan)
    const visibleData = candlestickData.slice(clampedPan, clampedPan + visibleCount)
    const chartAreaW = rect.width - leftPadding - rightPadding
    const gap = chartAreaW / visibleData.length
    const idx = Math.floor((x - leftPadding) / gap)

    if (idx >= 0 && idx < visibleData.length) {
      const candle = visibleData[idx]
      const vol = volumeMap.get(candle.time)
      setTooltipData({ candle, vol, x, y })
    } else {
      setTooltipData(null)
    }

    if (isDragging) {
      const dx = e.clientX - dragStart
      const chartAreaW2 = rect.width - leftPadding - rightPadding
      const visibleCount2 = Math.max(5, Math.floor(dataLen / zoomLevel))
      const pixelsPerCandle = chartAreaW2 / visibleCount2
      const candleShift = Math.round(-dx / pixelsPerCandle)
      setPanOffset(Math.max(0, Math.min(dragPanStart + candleShift, Math.max(0, dataLen - visibleCount2))))
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleMouseLeave = () => {
    setIsDragging(false)
    setCrosshair(null)
    setTooltipData(null)
    if (isRangeMode) {
      setIsRangeMode(false)
      setRangeStart(null)
    }
  }

  if (!candlestickData || candlestickData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-foreground-muted">
        <BarChart3 className="w-8 h-8 mr-2 opacity-50" />
        No chart data available
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Controls */}
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button
          onClick={() => setZoomLevel(z => Math.min(z * 1.5, candlestickData.length / 3))}
          className="p-1.5 rounded bg-background-tertiary/80 hover:bg-background-tertiary text-foreground-muted hover:text-foreground transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setZoomLevel(z => Math.max(z / 1.5, 1))}
          className="p-1.5 rounded bg-background-tertiary/80 hover:bg-background-tertiary text-foreground-muted hover:text-foreground transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => {
            const target = 10
            if (candlestickData.length > target) {
              const newZoom = candlestickData.length / target
              setZoomLevel(newZoom)
              const vc = Math.max(5, Math.floor(candlestickData.length / newZoom))
              setPanOffset(Math.max(0, candlestickData.length - vc))
            } else {
              setZoomLevel(1)
              setPanOffset(0)
            }
          }}
          className="p-1.5 rounded bg-background-tertiary/80 hover:bg-background-tertiary text-foreground-muted hover:text-foreground transition-colors"
          title="Reset view"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        {(rangeStart || rangeEnd) && (
          <button
            onClick={() => { setRangeStart(null); setRangeEnd(null); setIsRangeMode(false) }}
            className="px-2 py-1 rounded bg-blue-600/80 hover:bg-blue-600 text-white text-[10px] font-medium transition-colors"
            title="Clear range"
          >
            ✕ Range
          </button>
        )}
      </div>

      {/* Range hint */}
      <div className="absolute top-2 left-2 z-10">
        <span className="text-[10px] text-foreground-muted bg-background-tertiary/70 px-2 py-1 rounded">
          {isRangeMode ? 'Shift+click end point' : 'Shift+click to measure range'}
        </span>
      </div>

      {/* Tooltip */}
      {tooltipData && (
        <div
          className="absolute z-20 pointer-events-none bg-background-secondary border border-background-tertiary rounded-lg p-2 text-xs shadow-lg"
          style={{
            left: Math.min(tooltipData.x + 10, (containerRef.current?.clientWidth || 500) - 160),
            top: Math.max(tooltipData.y - 80, 0),
          }}
        >
          <div className="space-y-0.5">
            <div className="text-foreground-muted">{new Date(tooltipData.candle.time * 1000).toLocaleString()}</div>
            <div><span className="text-foreground-muted">O:</span> <span className="font-mono">{formatPrice(tooltipData.candle.open)}</span></div>
            <div><span className="text-foreground-muted">H:</span> <span className="font-mono text-buy">{formatPrice(tooltipData.candle.high)}</span></div>
            <div><span className="text-foreground-muted">L:</span> <span className="font-mono text-sell">{formatPrice(tooltipData.candle.low)}</span></div>
            <div><span className="text-foreground-muted">C:</span> <span className="font-mono">{formatPrice(tooltipData.candle.close)}</span></div>
            {tooltipData.vol !== undefined && (
              <div><span className="text-foreground-muted">Vol:</span> <span className="font-mono">${tooltipData.vol.toLocaleString()}</span></div>
            )}
          </div>
        </div>
      )}

      {/* Range Summary Tooltip */}
      {rangeStart && rangeEnd && (
        <div className="absolute z-20 bottom-2 left-1/2 -translate-x-1/2 bg-background-secondary border border-blue-500/30 rounded-lg p-3 text-xs shadow-lg min-w-[280px]">
          {(() => {
            const rStart = Math.min(rangeStart.idx, rangeEnd.idx)
            const rEnd = Math.max(rangeStart.idx, rangeEnd.idx)
            const startC = candlestickData[rStart]
            const endC = candlestickData[rEnd]
            const change = endC.close - startC.open
            const changePct = (change / startC.open) * 100
            const high = Math.max(...candlestickData.slice(rStart, rEnd + 1).map(c => c.high))
            const low = Math.min(...candlestickData.slice(rStart, rEnd + 1).map(c => c.low))
            const up = change >= 0
            return (
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-foreground-muted">Period</span>
                  <span>{new Date(startC.time * 1000).toLocaleString()} → {new Date(endC.time * 1000).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-muted">Change</span>
                  <span className={up ? 'text-buy' : 'text-sell'}>
                    {up ? '+' : ''}{formatPrice(change)} ({up ? '+' : ''}{changePct.toFixed(2)}%)
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-foreground-muted">Open → Close</span>
                  <span className="font-mono">{formatPrice(startC.open)} → {formatPrice(endC.close)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-foreground-muted">High / Low</span>
                  <span className="font-mono">
                    <span className="text-buy">{formatPrice(high)}</span> / <span className="text-sell">{formatPrice(low)}</span>
                  </span>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      <div ref={containerRef} className="w-full" style={{ height: totalHeight }}>
        <canvas
          ref={canvasRef}
          className={isRangeMode ? 'cursor-cell' : isDragging ? 'cursor-grabbing' : 'cursor-crosshair'}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        />
      </div>
    </div>
  )
}

// Simple inline trade component
function SimpleTrade({
  symbol,
  currentPrice,
  userQuantity,
  onTradeComplete,
}: {
  symbol: string
  currentPrice: number
  userQuantity?: number
  onTradeComplete?: () => void
}) {
  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TradeResult | null>(null)

  const handleTrade = async () => {
    const amountNum = parseFloat(amount)
    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid amount')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const tradeResult = await invoke<TradeResult>('execute_trade', {
        symbol,
        direction: tradeType,
        amount: amountNum,
      })
      setResult(tradeResult)
      setAmount('')
      onTradeComplete?.()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const formatPrice = (price: number) => {
    if (price < 0.0001) return `$${price.toExponential(2)}`
    if (price < 0.01) return `$${price.toFixed(6)}`
    if (price < 1) return `$${price.toFixed(4)}`
    return `$${price.toFixed(2)}`
  }

  return (
    <div className="space-y-4">
      {/* Trade Type Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setTradeType('BUY')}
          className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
            tradeType === 'BUY'
              ? 'bg-emerald-600 text-white'
              : 'bg-background-tertiary text-foreground-muted hover:text-foreground'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setTradeType('SELL')}
          className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
            tradeType === 'SELL'
              ? 'bg-rose-600 text-white'
              : 'bg-background-tertiary text-foreground-muted hover:text-foreground'
          }`}
        >
          Sell
        </button>
      </div>

      {/* Current Price */}
      <div className="p-3 rounded-lg bg-background-tertiary text-center">
        <span className="text-sm text-foreground-muted">Current Price: </span>
        <span className="font-mono font-bold">{formatPrice(currentPrice)}</span>
      </div>

      {/* Amount Input */}
      <div>
        <label className="block text-sm text-foreground-muted mb-2">
          {tradeType === 'BUY' ? 'Amount (USD)' : 'Amount (Coins)'}
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={tradeType === 'BUY' ? 'Enter USD amount' : 'Enter coin amount'}
          className="input"
        />
        {/* Quick sell % buttons */}
        {tradeType === 'SELL' && userQuantity && userQuantity > 0 && (
          <div className="flex gap-1 mt-2">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => {
                  const qty = Math.floor((userQuantity * pct / 100) * 1e8) / 1e8
                  setAmount(String(qty))
                }}
                className="flex-1 py-1 text-xs rounded bg-background-tertiary hover:bg-background text-foreground-muted hover:text-foreground transition-colors"
              >
                {pct}%
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-rose-500/20 text-rose-400 text-sm">{error}</div>
      )}

      {/* Result */}
      {result && (
        <div className="p-3 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm">
          {result.message}
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={handleTrade}
        disabled={loading || !amount}
        className={`w-full py-3 rounded-lg font-medium transition-colors ${
          tradeType === 'BUY'
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-emerald-800'
            : 'bg-rose-600 hover:bg-rose-700 text-white disabled:bg-rose-800'
        } disabled:cursor-not-allowed`}
      >
        {loading ? (
          <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
        ) : (
          `${tradeType === 'BUY' ? 'Buy' : 'Sell'} ${symbol}`
        )}
      </button>
    </div>
  )
}
