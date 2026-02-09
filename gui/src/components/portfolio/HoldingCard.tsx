import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { CoinHolding } from '@/lib/types'

interface HoldingCardProps {
  holding: CoinHolding
  onClick?: () => void
}

export function HoldingCard({ holding, onClick }: HoldingCardProps) {
  const profitLoss = holding.value - holding.costBasis
  const profitLossPct = holding.costBasis > 0 
    ? ((holding.value - holding.costBasis) / holding.costBasis) * 100 
    : 0
  
  const isProfit = profitLoss > 0
  const isLoss = profitLoss < 0
  
  // Build icon URL
  const iconUrl = holding.icon 
    ? (holding.icon.startsWith('http') ? holding.icon : `https://rugplay.com/${holding.icon}`)
    : null

  const formatNumber = (num: number, decimals = 2) => 
    num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  
  const formatPrice = (num: number) => {
    if (num < 0.0001) return num.toExponential(4)
    if (num < 0.01) return num.toFixed(6)
    if (num < 1) return num.toFixed(4)
    return formatNumber(num, 2)
  }

  return (
    <button
      onClick={onClick}
      className="w-full p-4 rounded-lg bg-background hover:bg-background-tertiary transition-colors text-left group"
    >
      <div className="flex items-center gap-3">
        {/* Coin Icon */}
        <div className="w-10 h-10 rounded-full bg-background-tertiary flex items-center justify-center overflow-hidden flex-shrink-0">
          {iconUrl ? (
            <img 
              src={iconUrl} 
              alt={holding.symbol} 
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                e.currentTarget.parentElement!.textContent = holding.symbol.charAt(0).toUpperCase()
              }}
            />
          ) : (
            <span className="text-sm font-bold text-foreground-muted">
              {holding.symbol.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Coin Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-foreground truncate">${holding.symbol}</span>
            <span className="font-medium text-foreground">${formatNumber(holding.value)}</span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span className="text-sm text-foreground-muted">
              {formatNumber(holding.quantity, 4)} @ ${formatPrice(holding.currentPrice)}
            </span>
            <div className={`flex items-center gap-1 text-sm ${
              isProfit ? 'text-buy' : isLoss ? 'text-sell' : 'text-foreground-muted'
            }`}>
              {isProfit ? (
                <TrendingUp className="w-3 h-3" />
              ) : isLoss ? (
                <TrendingDown className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              <span>
                {isProfit ? '+' : ''}{formatNumber(profitLoss)} ({isProfit ? '+' : ''}{formatNumber(profitLossPct)}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 24h Change Indicator */}
      {holding.change24h !== 0 && (
        <div className="mt-2 pt-2 border-t border-background-tertiary flex items-center justify-between text-xs">
          <span className="text-foreground-muted">24h Change</span>
          <span className={holding.change24h > 0 ? 'text-buy' : 'text-sell'}>
            {holding.change24h > 0 ? '+' : ''}{formatNumber(holding.change24h)}%
          </span>
        </div>
      )}
    </button>
  )
}
