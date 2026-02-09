// Type definitions for RugPlay Manager

export interface ProfileSummary {
  id: number
  username: string
  last_verified: string | null
}

export interface UserProfile {
  id: string
  username: string
  name?: string
  email?: string
  image?: string
  balance: number
  isAdmin?: boolean
  isBanned?: boolean
  sessionExpiresAt?: string
}

export type LoginResult = 
  | { status: 'success'; profile: UserProfile }
  | { status: 'expired'; profile_id: number }
  | { status: 'error'; message: string }

export interface Holding {
  symbol: string
  quantity: number
  avg_entry_price: number
}

export interface TradeRequest {
  type: 'BUY' | 'SELL'
  amount: number
}

export interface TradeResponse {
  success: boolean
  type: string
  coins_bought?: number
  coins_sold?: number
  total_cost?: number
  total_received?: number
  new_price: number
  price_impact: number
  new_balance: number
}

export interface TradeResult {
  success: boolean
  tradeType: string
  coinsAmount: number
  usdAmount: number
  newPrice: number
  priceImpact: number
  newBalance: number
  message: string
}

// ============================================================================
// Portfolio Types
// ============================================================================

export interface PortfolioResponse {
  baseCurrencyBalance: number
  totalCoinValue: number
  totalValue: number
  coinHoldings: CoinHolding[]
}

export interface CoinHolding {
  symbol: string
  icon?: string
  quantity: number
  currentPrice: number
  value: number
  change24h: number
  avgPurchasePrice: number
  percentageChange: number
  costBasis: number
}

export interface PortfolioSummary {
  balance: number
  portfolioValue: number
  totalValue: number
  totalProfitLoss: number
  totalProfitLossPct: number
  holdingsCount: number
}

// ============================================================================
// Market Types
// ============================================================================

export interface MarketCoin {
  id: string
  symbol: string
  name: string
  icon?: string
  currentPrice: number
  marketCap: number
  volume24h: number
  change24h: number
  createdAt: string
  creatorUsername?: string
  holdersCount?: number
}

export interface MarketResponse {
  coins: MarketCoin[]
  total?: number
  page?: number
  limit?: number
  totalPages?: number
}

// ============================================================================
// Coin Details Types
// ============================================================================

export interface CoinDetails {
  id: string
  symbol: string
  name: string
  icon?: string
  currentPrice: number
  marketCap: number
  poolCoinAmount: number
  poolBaseCurrencyAmount: number
  circulatingSupply: number
  creatorId?: string
  isLocked: boolean
  volume24h: number
  change24h: number
}

export interface CandlestickPoint {
  time: number
  open: number
  high: number
  low: number
  close: number
}

export interface VolumePoint {
  time: number
  volume: number
}

export interface CoinWithChartResponse {
  coin: CoinDetails
  candlestickData: CandlestickPoint[]
  volumeData: VolumePoint[]
  timeframe?: string
}

// Legacy alias for backward compatibility
export type CoinDetailsResponse = CoinDetails

export interface CoinHoldersResponse {
  coinSymbol: string
  totalHolders: number
  circulatingSupply: number
  poolInfo: PoolInfo
  holders: Holder[]
}

export interface PoolInfo {
  coinAmount: number
  baseCurrencyAmount: number
  currentPrice: number
}

export interface Holder {
  rank: number
  userId: number
  username: string
  name: string
  image?: string
  quantity: number
  percentage: number
  liquidationValue: number
}

// ============================================================================
// Sentinel Types
// ============================================================================

export interface SentinelConfig {
  id: number
  symbol: string
  stopLossPct: number | null
  takeProfitPct: number | null
  trailingStopPct: number | null
  sellPercentage: number
  entryPrice: number
  highestPriceSeen: number
  isActive: boolean
  createdAt: string | null
  triggeredAt: string | null
}

export interface CreateSentinelRequest {
  symbol: string
  stopLossPct: number | null
  takeProfitPct: number | null
  trailingStopPct: number | null
  sellPercentage: number
  entryPrice: number
}

// ============================================================================
// Live Feed Types
// ============================================================================

export interface RecentTrade {
  tradeType: string
  username: string
  userImage?: string
  amount: number
  coinSymbol: string
  coinName: string
  coinIcon?: string
  totalValue: number
  price: number
  timestamp: number
  userId: string
}

// ============================================================================
// Transaction History Types (from Rugplay API)
// ============================================================================

export interface TransactionRecord {
  id: number
  tradeType: string
  symbol: string
  coinName: string
  coinIcon?: string
  coinAmount: number
  price: number
  usdValue: number
  timestamp: string
  isTransfer: boolean
  isIncoming: boolean
  sender?: string
  recipient?: string
}

export interface TransactionListResponse {
  transactions: TransactionRecord[]
  total: number
  page: number
  limit: number
}

// ============================================================================
// Settings Types
// ============================================================================

export interface SentinelDefaults {
  stopLossPct: number
  takeProfitPct: number
  trailingStopPct: number | null
  sellPercentage: number
}

export interface AppSettings {
  sentinelDefaults: SentinelDefaults
  autoManageSentinels: boolean
  blacklistedCoins: string[]
}

// ============================================================================
// Sentinel Monitor Types (background automation)
// ============================================================================

export type MonitorStatus = 'Running' | 'Paused' | 'Stopped'

export interface MonitorStatusResponse {
  status: MonitorStatus
  intervalSecs: number
  isPaused: boolean
}

export interface SentinelTriggeredEvent {
  sentinelId: number
  symbol: string
  reason: string
  triggerType: 'stop_loss' | 'take_profit' | 'trailing_stop'
  currentPrice: number
  entryPrice: number
  sellAmount: number
  sellPercentage: number
}

export interface SentinelTickEvent {
  status: MonitorStatus
  checked: number
  activeCount: number
  lastCheckAt: string
}

export interface TradeExecutedEvent {
  symbol: string
  tradeType: string
  amount: number
  newPrice: number
  priceImpact: number
  newBalance: number
  reason: string
  success: boolean
  error?: string
}

// ============================================================================
// Harvester Types (12h auto-claim)
// ============================================================================

export interface HarvesterStatusResponse {
  enabled: boolean
  lastClaimAt: string | null
  nextClaimAt: string | null
  secondsUntilNext: number
  totalClaims: number
}

export interface HarvesterTickEvent {
  enabled: boolean
  secondsUntilNext: number
  lastClaimAt: string | null
  totalClaims: number
  profilesCount: number
}

export interface HarvesterClaimedEvent {
  profileId: number
  username: string
  rewardAmount: number
  newBalance: number
  loginStreak: number
  nextClaimAt: string | null
  totalClaims: number
}

// ============================================================================
// Sniper Types (auto-buy new coins)
// ============================================================================

export interface SniperConfig {
  enabled: boolean
  buyAmountUsd: number
  maxMarketCapUsd: number
  maxCoinAgeSecs: number
  autoCreateSentinel: boolean
  stopLossPct: number
  takeProfitPct: number
  trailingStopPct: number | null
  blacklistedCreators: string[]
  minLiquidityUsd: number
  maxDailySpendUsd: number
  pollIntervalSecs: number
}

export interface SniperStatusResponse {
  enabled: boolean
  totalSniped: number
  lastSnipedAt: string | null
  config: SniperConfig
}

export interface SniperTriggeredEvent {
  symbol: string
  coinName: string
  buyAmountUsd: number
  marketCap: number
  price: number
  coinAgeSecs: number
}

// ============================================================================
// Risk Limits Types
// ============================================================================

export interface RiskLimits {
  maxPositionUsd: number
  maxDailyTradesCount: number
  maxDailyVolumeUsd: number
  cooldownAfterLossSecs: number
  retryCount: number
  retryDelayMs: number
  rateLimitMs: number
}

// ============================================================================
// Notification Types
// ============================================================================

export interface NotificationConfig {
  enabled: boolean
  sentinelTriggers: boolean
  sniperBuys: boolean
  harvesterClaims: boolean
  riskAlerts: boolean
  sessionAlerts: boolean
  tradeConfirmations: boolean
}
