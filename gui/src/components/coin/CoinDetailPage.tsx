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
} from 'lucide-react'
import { buildImageUrl } from '@/lib/utils'
import type { CoinWithChartResponse, CoinHoldersResponse, TradeResult, Holder, CoinHolding } from '@/lib/types'

interface CoinDetailPageProps {
  symbol: string
  onBack: () => void
  onTradeComplete?: () => void
  holdings?: CoinHolding[]
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

export function CoinDetailPage({ symbol, onBack, onTradeComplete, holdings = [] }: CoinDetailPageProps) {
  const [data, setData] = useState<CoinWithChartResponse | null>(null)
  const [holders, setHolders] = useState<CoinHoldersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState<Timeframe>('1m')

  const fetchCoinData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await invoke<CoinWithChartResponse>('get_coin_with_chart', {
        symbol,
        timeframe,
      })
      setData(result)
    } catch (e) {
      console.error('Failed to fetch coin data:', e)
      setError(String(e))
    } finally {
      setLoading(false)
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
          <button onClick={fetchCoinData} className="btn-primary">
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

  // Find user's holding for this coin
  const userHolding = holdings.find(h => h.symbol.toLowerCase() === coin.symbol.toLowerCase())

  return (
    <div className="space-y-6">
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
            <div className="w-12 h-12 rounded-full bg-background-tertiary flex items-center justify-center overflow-hidden">
              {iconUrl ? (
                <img src={iconUrl} alt={coin.symbol} className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none' }} />
              ) : (
                <span className="text-lg font-bold">{coin.symbol.substring(0, 2)}</span>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold">${coin.symbol}</h1>
              <p className="text-sm text-foreground-muted">{coin.name}</p>
            </div>
          </div>

          {coin.isLocked && (
            <span className="flex items-center gap-1 px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 text-xs">
              <Lock className="w-3 h-3" /> Locked
            </span>
          )}
        </div>

        <button
          onClick={fetchCoinData}
          disabled={loading}
          className="p-2 rounded-lg hover:bg-background-tertiary transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Price & Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-sm text-foreground-muted mb-1">Price</div>
          <div className="text-2xl font-bold">{formatPrice(coin.currentPrice)}</div>
          <div
            className={`flex items-center gap-1 text-sm ${
              isUp ? 'text-buy' : isDown ? 'text-sell' : 'text-foreground-muted'
            }`}
          >
            {isUp && <TrendingUp className="w-3 h-3" />}
            {isDown && <TrendingDown className="w-3 h-3" />}
            {isUp ? '+' : ''}
            {coin.change24h.toFixed(2)}%
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-1 text-sm text-foreground-muted mb-1">
            <DollarSign className="w-3 h-3" /> Market Cap
          </div>
          <div className="text-xl font-bold">${formatNumber(coin.marketCap)}</div>
        </div>

        <div className="card">
          <div className="flex items-center gap-1 text-sm text-foreground-muted mb-1">
            <BarChart3 className="w-3 h-3" /> Volume 24h
          </div>
          <div className="text-xl font-bold">${formatNumber(coin.volume24h)}</div>
        </div>

        <div className="card">
          <div className="flex items-center gap-1 text-sm text-foreground-muted mb-1">
            <Users className="w-3 h-3" /> Holders
          </div>
          <div className="text-xl font-bold">{holders?.totalHolders ?? '...'}</div>
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
                      ? 'bg-blue-600 text-white'
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
            currentPrice={coin.currentPrice}
            formatPrice={formatPrice}
          />
        </div>

        {/* Trade Panel */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Trade</h2>
          
          {/* Show user holdings if they own this coin */}
          {userHolding && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-emerald-400 font-medium">Your Holdings</span>
              </div>
              <div className="text-lg font-bold font-mono">{userHolding.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })} coins</div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-foreground-muted">Value</span>
                <span className="font-mono">${userHolding.value.toFixed(2)}</span>
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
            currentPrice={coin.currentPrice}
            userQuantity={userHolding?.quantity}
            onTradeComplete={() => {
              fetchCoinData()
              onTradeComplete?.()
            }}
          />
        </div>
      </div>

      {/* Pool Info & Holders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pool Info */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Pool Information</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-foreground-muted">Pool Coins</span>
              <span className="font-mono">{formatNumber(coin.poolCoinAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground-muted">Pool USD</span>
              <span className="font-mono">${formatNumber(coin.poolBaseCurrencyAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-foreground-muted">Circulating Supply</span>
              <span className="font-mono">{formatNumber(coin.circulatingSupply)}</span>
            </div>
          </div>
        </div>

        {/* Top Holders - shown by default */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Top Holders</h2>

          {holders ? (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {holders.holders.slice(0, 10).map((holder) => (
                <HolderRow key={holder.userId} holder={holder} />
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-foreground-muted">Loading holders...</div>
          )}
        </div>
      </div>
    </div>
  )
}

function HolderRow({ holder }: { holder: Holder }) {
  const imageUrl = buildImageUrl(holder.image)

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-background-tertiary/50 transition-colors">
      <span className="w-6 text-center text-sm text-foreground-muted">#{holder.rank}</span>
      <div className="w-8 h-8 rounded-full bg-background-tertiary flex items-center justify-center overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={holder.username} className="w-full h-full object-cover" />
        ) : (
          <Users className="w-4 h-4 text-foreground-muted" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{holder.username}</div>
        <div className="text-xs text-foreground-muted">{holder.percentage.toFixed(2)}%</div>
      </div>
      <div className="text-right text-sm">
        <div className="font-mono">${holder.liquidationValue.toFixed(2)}</div>
      </div>
    </div>
  )
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
          className="w-full px-3 py-2 rounded-lg bg-background border border-zinc-700 focus:outline-none focus:border-emerald-500"
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
