import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { 
  X, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Users, 
  BarChart3,
  Coins,
  DollarSign,
  ExternalLink
} from 'lucide-react'
import { TradeModal, type TradeDirection } from '@/components/trade'
import type { CoinDetailsResponse, CoinHoldersResponse, CoinHolding } from '@/lib/types'

interface CoinDetailsModalProps {
  symbol: string
  holding?: CoinHolding  // Optional: if opened from portfolio
  isOpen: boolean
  onClose: () => void
  onTradeComplete?: () => void
}

export function CoinDetailsModal({ 
  symbol, 
  holding, 
  isOpen, 
  onClose, 
  onTradeComplete 
}: CoinDetailsModalProps) {
  const [coinDetails, setCoinDetails] = useState<CoinDetailsResponse | null>(null)
  const [holdersData, setHoldersData] = useState<CoinHoldersResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'holders'>('overview')
  const [tradeDirection, setTradeDirection] = useState<TradeDirection | null>(null)

  useEffect(() => {
    if (isOpen && symbol) {
      fetchCoinData()
    }
  }, [isOpen, symbol])

  async function fetchCoinData() {
    setLoading(true)
    setError(null)
    
    try {
      // Fetch coin details and holders in parallel
      const [details, holders] = await Promise.all([
        invoke<CoinDetailsResponse>('get_coin_details', { symbol }),
        invoke<CoinHoldersResponse>('get_coin_holders', { symbol, limit: 10 }),
      ])
      
      setCoinDetails(details)
      setHoldersData(holders)
    } catch (e) {
      setError(`Failed to load coin data: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const formatNumber = (num: number, decimals = 2) => 
    num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

  const formatPrice = (num: number) => {
    if (num < 0.0001) return num.toExponential(4)
    if (num < 0.01) return num.toFixed(6)
    if (num < 1) return num.toFixed(4)
    return formatNumber(num, 2)
  }

  const formatLargeNumber = (num: number) => {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
    return formatNumber(num)
  }

  const isPositiveChange = (coinDetails?.change24h ?? 0) > 0
  const isNegativeChange = (coinDetails?.change24h ?? 0) < 0

  const iconUrl = coinDetails?.icon 
    ? (coinDetails.icon.startsWith('http') ? coinDetails.icon : `https://rugplay.com/${coinDetails.icon}`)
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-background-secondary border border-background-tertiary rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-background-tertiary">
          <div className="flex items-center gap-3">
            {iconUrl ? (
              <img 
                src={iconUrl} 
                alt={symbol} 
                className="w-10 h-10 rounded-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-background-tertiary flex items-center justify-center">
                <span className="font-bold text-foreground-muted">{symbol.charAt(0)}</span>
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold">${symbol}</h2>
              {coinDetails && (
                <p className="text-sm text-foreground-muted">{coinDetails.name}</p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={fetchCoinData}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-background-tertiary transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <a
              href={`https://rugplay.com/coin/${symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-background-tertiary transition-colors"
              title="Open in browser"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-background-tertiary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-180px)]">
          {loading && !coinDetails ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-foreground-muted" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-sell mb-4">{error}</p>
              <button onClick={fetchCoinData} className="btn-primary">
                Retry
              </button>
            </div>
          ) : coinDetails && (
            <>
              {/* Price & Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="p-3 rounded-lg bg-background">
                  <div className="flex items-center gap-2 text-xs text-foreground-muted mb-1">
                    <DollarSign className="w-3 h-3" />
                    Price
                  </div>
                  <div className="text-lg font-bold">${formatPrice(coinDetails.currentPrice)}</div>
                  <div className={`flex items-center gap-1 text-xs ${
                    isPositiveChange ? 'text-buy' : isNegativeChange ? 'text-sell' : 'text-foreground-muted'
                  }`}>
                    {isPositiveChange ? <TrendingUp className="w-3 h-3" /> : isNegativeChange ? <TrendingDown className="w-3 h-3" /> : null}
                    {isPositiveChange ? '+' : ''}{formatNumber(coinDetails.change24h)}% (24h)
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-background">
                  <div className="flex items-center gap-2 text-xs text-foreground-muted mb-1">
                    <BarChart3 className="w-3 h-3" />
                    Market Cap
                  </div>
                  <div className="text-lg font-bold">${formatLargeNumber(coinDetails.marketCap)}</div>
                </div>

                <div className="p-3 rounded-lg bg-background">
                  <div className="flex items-center gap-2 text-xs text-foreground-muted mb-1">
                    <Coins className="w-3 h-3" />
                    Volume (24h)
                  </div>
                  <div className="text-lg font-bold">${formatLargeNumber(coinDetails.volume24h)}</div>
                </div>

                <div className="p-3 rounded-lg bg-background">
                  <div className="flex items-center gap-2 text-xs text-foreground-muted mb-1">
                    <Users className="w-3 h-3" />
                    Holders
                  </div>
                  <div className="text-lg font-bold">{holdersData?.totalHolders ?? 0}</div>
                </div>
              </div>

              {/* Your Position (if holding) */}
              {holding && (
                <div className="mb-6 p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <h3 className="text-sm font-medium text-blue-400 mb-3">Your Position</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs text-foreground-muted">Quantity</div>
                      <div className="font-bold">{formatNumber(holding.quantity, 4)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-foreground-muted">Value</div>
                      <div className="font-bold">${formatNumber(holding.value)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-foreground-muted">P&L</div>
                      <div className={`font-bold ${
                        holding.value > holding.costBasis ? 'text-buy' : 
                        holding.value < holding.costBasis ? 'text-sell' : ''
                      }`}>
                        {holding.value > holding.costBasis ? '+' : ''}
                        ${formatNumber(holding.value - holding.costBasis)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="flex gap-2 mb-4 border-b border-background-tertiary">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
                    activeTab === 'overview' 
                      ? 'border-blue-500 text-blue-400' 
                      : 'border-transparent text-foreground-muted hover:text-foreground'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab('holders')}
                  className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
                    activeTab === 'holders' 
                      ? 'border-blue-500 text-blue-400' 
                      : 'border-transparent text-foreground-muted hover:text-foreground'
                  }`}
                >
                  Top Holders
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-background">
                      <div className="text-xs text-foreground-muted mb-1">Pool (Coins)</div>
                      <div className="font-medium">{formatLargeNumber(coinDetails.poolCoinAmount)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-background">
                      <div className="text-xs text-foreground-muted mb-1">Pool (USD)</div>
                      <div className="font-medium">${formatLargeNumber(coinDetails.poolBaseCurrencyAmount)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-background">
                      <div className="text-xs text-foreground-muted mb-1">Circulating Supply</div>
                      <div className="font-medium">{formatLargeNumber(coinDetails.circulatingSupply)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-background">
                      <div className="text-xs text-foreground-muted mb-1">Locked</div>
                      <div className="font-medium">{coinDetails.isLocked ? 'Yes 🔒' : 'No'}</div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'holders' && holdersData && (
                <div className="space-y-2">
                  {holdersData.holders.length === 0 ? (
                    <div className="text-center py-8 text-foreground-muted">
                      No holders data available
                    </div>
                  ) : (
                    holdersData.holders.map((holder) => {
                      const holderImage = holder.image 
                        ? (holder.image.startsWith('http') ? holder.image : `https://rugplay.com/${holder.image}`)
                        : null
                      
                      return (
                        <div 
                          key={holder.userId}
                          className="flex items-center gap-3 p-3 rounded-lg bg-background"
                        >
                          <div className="w-8 h-8 rounded-full bg-background-tertiary flex items-center justify-center text-sm font-bold">
                            #{holder.rank}
                          </div>
                          {holderImage ? (
                            <img 
                              src={holderImage} 
                              alt={holder.username} 
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-background-tertiary flex items-center justify-center">
                              <span className="text-xs font-bold">{holder.username.charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{holder.username}</div>
                            <div className="text-xs text-foreground-muted">
                              {formatNumber(holder.quantity, 4)} ({formatNumber(holder.percentage)}%)
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">${formatLargeNumber(holder.liquidationValue)}</div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with trade buttons */}
        <div className="flex gap-3 p-4 border-t border-background-tertiary bg-background-secondary">
          <button
            onClick={() => setTradeDirection('BUY')}
            className="flex-1 py-3 px-4 rounded-lg bg-buy hover:bg-buy/80 text-white font-bold transition-colors"
          >
            Buy
          </button>
          <button
            onClick={() => setTradeDirection('SELL')}
            disabled={!holding || holding.quantity <= 0}
            className="flex-1 py-3 px-4 rounded-lg bg-sell hover:bg-sell/80 text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sell
          </button>
        </div>
      </div>

      {/* Trade Modal */}
      <TradeModal
        symbol={symbol}
        holding={holding}
        direction={tradeDirection ?? 'BUY'}
        isOpen={tradeDirection !== null}
        onClose={() => setTradeDirection(null)}
        onTradeComplete={() => {
          setTradeDirection(null)
          fetchCoinData()
          onTradeComplete?.()
        }}
      />
    </div>
  )
}
