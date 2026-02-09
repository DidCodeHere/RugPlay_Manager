import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { RefreshCw, TrendingUp, TrendingDown, Wallet, DollarSign, PieChart } from 'lucide-react'
import { HoldingsTable } from './HoldingsTable'
import { CoinDetailsModal } from './CoinDetailsModal'
import type { PortfolioResponse, PortfolioSummary, CoinHolding } from '@/lib/types'

interface PortfolioViewProps {
  onCoinClick?: (symbol: string) => void
}

export function PortfolioView({ onCoinClick }: PortfolioViewProps) {
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null)
  const [summary, setSummary] = useState<PortfolioSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedCoin, setSelectedCoin] = useState<CoinHolding | null>(null)

  const fetchPortfolio = useCallback(async () => {
    try {
      setError(null)
      const data = await invoke<PortfolioResponse>('get_portfolio')
      setPortfolio(data)
      
      // Calculate summary client-side for now
      const totalCost = data.coinHoldings.reduce((sum, h) => sum + h.costBasis, 0)
      const totalProfitLoss = data.totalCoinValue - totalCost
      const totalProfitLossPct = totalCost > 0 ? (totalProfitLoss / totalCost) * 100 : 0
      
      setSummary({
        balance: data.baseCurrencyBalance,
        portfolioValue: data.totalCoinValue,
        totalValue: data.totalValue,
        totalProfitLoss,
        totalProfitLossPct,
        holdingsCount: data.coinHoldings.length,
      })
      
      setLastUpdated(new Date())
    } catch (e) {
      setError(`Failed to load portfolio: ${e}`)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchPortfolio()
  }, [fetchPortfolio])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPortfolio()
    }, 30000)
    
    return () => clearInterval(interval)
  }, [fetchPortfolio])

  const formatNumber = (num: number, decimals = 2) => 
    num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

  if (loading && !portfolio) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-foreground-muted" />
      </div>
    )
  }

  if (error && !portfolio) {
    return (
      <div className="card">
        <div className="text-center py-8">
          <p className="text-sell mb-4">{error}</p>
          <button 
            onClick={fetchPortfolio}
            className="btn-primary"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const isProfit = (summary?.totalProfitLoss ?? 0) > 0
  const isLoss = (summary?.totalProfitLoss ?? 0) < 0

  return (
    <div className="space-y-6">
      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {/* Cash Balance */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 lg:gap-3">
            <div className="p-1.5 lg:p-2 rounded-lg bg-blue-500/20 shrink-0">
              <DollarSign className="w-4 h-4 lg:w-5 lg:h-5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs lg:text-sm text-foreground-muted">Cash Balance</p>
              <p className="text-base lg:text-xl font-bold truncate">${formatNumber(summary?.balance ?? 0)}</p>
            </div>
          </div>
        </div>

        {/* Portfolio Value */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 lg:gap-3">
            <div className="p-1.5 lg:p-2 rounded-lg bg-purple-500/20 shrink-0">
              <Wallet className="w-4 h-4 lg:w-5 lg:h-5 text-purple-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs lg:text-sm text-foreground-muted">Portfolio Value</p>
              <p className="text-base lg:text-xl font-bold truncate">${formatNumber(summary?.portfolioValue ?? 0)}</p>
            </div>
          </div>
        </div>

        {/* Total Net Worth */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 lg:gap-3">
            <div className="p-1.5 lg:p-2 rounded-lg bg-amber-500/20 shrink-0">
              <PieChart className="w-4 h-4 lg:w-5 lg:h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs lg:text-sm text-foreground-muted">Net Worth</p>
              <p className="text-base lg:text-xl font-bold text-buy truncate">${formatNumber(summary?.totalValue ?? 0)}</p>
            </div>
          </div>
        </div>

        {/* Profit/Loss */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 lg:gap-3">
            <div className={`p-1.5 lg:p-2 rounded-lg shrink-0 ${isProfit ? 'bg-emerald-500/20' : isLoss ? 'bg-rose-500/20' : 'bg-gray-500/20'}`}>
              {isProfit ? (
                <TrendingUp className="w-4 h-4 lg:w-5 lg:h-5 text-buy" />
              ) : isLoss ? (
                <TrendingDown className="w-4 h-4 lg:w-5 lg:h-5 text-sell" />
              ) : (
                <TrendingUp className="w-4 h-4 lg:w-5 lg:h-5 text-foreground-muted" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs lg:text-sm text-foreground-muted">Total P&L</p>
              <p className={`text-base lg:text-xl font-bold truncate ${isProfit ? 'text-buy' : isLoss ? 'text-sell' : ''}`}>
                {isProfit ? '+' : ''}${formatNumber(summary?.totalProfitLoss ?? 0)}
              </p>
              <p className={`text-xs ${isProfit ? 'text-buy' : isLoss ? 'text-sell' : 'text-foreground-muted'}`}>
                {isProfit ? '+' : ''}{formatNumber(summary?.totalProfitLossPct ?? 0)}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Holdings Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">
            Holdings
            <span className="text-sm font-normal text-foreground-muted ml-2">
              ({portfolio?.coinHoldings.length ?? 0} coins)
            </span>
          </h2>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-foreground-muted">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchPortfolio}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-background-tertiary transition-colors"
              title="Refresh portfolio"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {portfolio?.coinHoldings.length === 0 ? (
          <div className="text-center py-12 text-foreground-muted">
            <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No holdings yet</p>
            <p className="text-sm">Buy some coins to see them here!</p>
          </div>
        ) : (
          <HoldingsTable
            holdings={portfolio?.coinHoldings ?? []}
            totalPortfolioValue={summary?.portfolioValue ?? 0}
            onCoinClick={(holding) => {
              if (onCoinClick) {
                // Navigate to coin detail page
                onCoinClick(holding.symbol)
              } else {
                // Fallback: open modal
                setSelectedCoin(holding)
              }
            }}
          />
        )}
      </div>

      {/* Coin Details Modal - only shown when no external navigation handler */}
      {!onCoinClick && (
        <CoinDetailsModal
          symbol={selectedCoin?.symbol ?? ''}
          holding={selectedCoin ?? undefined}
          isOpen={selectedCoin !== null}
          onClose={() => setSelectedCoin(null)}
          onTradeComplete={() => {
            // Refresh portfolio after trade
            fetchPortfolio()
          }}
        />
      )}
    </div>
  )
}
