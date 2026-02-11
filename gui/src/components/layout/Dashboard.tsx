import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Header } from './Header'
import { Sidebar, type NavItemId } from './Sidebar'
import { PortfolioView } from '@/components/portfolio'
import { MarketBrowser } from '@/components/market/MarketBrowser'
import { SentinelManager } from '@/components/sentinel'
import { SniperPage } from '@/components/sniper'
import { LiveTrades } from '@/components/feed'
import { TransactionHistory } from '@/components/history'
import { CoinDetailPage } from '@/components/coin'
import { SettingsLayout } from '@/components/settings'
import { MirrorPage } from '@/components/mirror'
import { DipBuyerPage } from '@/components/dipbuyer'
import { AutomationLogPage } from '@/components/automation'
import { MobileAccessPage } from '@/components/mobile/MobileAccessPage'
import { DashboardHome } from '@/components/dashboard/DashboardHome'
import { UserProfilePage } from '@/components/user'
import { LeaderboardPage } from '@/components/leaderboard'
import type { UserProfile, PortfolioResponse } from '@/lib/types'

const AboutPage = lazy(() => import('@/components/about/AboutPage').then(m => ({ default: m.AboutPage })))

interface DashboardProps {
  user: UserProfile
  onLogout: () => void
}

export function Dashboard({ user, onLogout }: DashboardProps) {
  const [activeNav, setActiveNav] = useState<NavItemId>('dashboard')
  const [holdings, setHoldings] = useState<PortfolioResponse['coinHoldings']>([])
  const [selectedCoinSymbol, setSelectedCoinSymbol] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [sentinelSearchQuery, setSentinelSearchQuery] = useState<string>('')
  const navGuardRef = useRef<(() => boolean) | null>(null)

  const handleSentinelClick = useCallback((symbol: string) => {
    if (navGuardRef.current && !navGuardRef.current()) return
    setSentinelSearchQuery(symbol)
    setActiveNav('sentinel')
  }, [])
  const guardedNavigate = useCallback((id: NavItemId) => {
    if (navGuardRef.current && !navGuardRef.current()) return
    setActiveNav(id)
  }, [])

  const setNavGuard = useCallback((guard: (() => boolean) | null) => {
    navGuardRef.current = guard
  }, [])

  const handleCoinClick = (symbol: string) => {
    if (navGuardRef.current && !navGuardRef.current()) return
    setSelectedUserId(null)
    setSelectedCoinSymbol(symbol)
  }

  const handleCoinDetailBack = () => {
    setSelectedCoinSymbol(null)
  }

  const handleUserClick = (userId: string) => {
    if (navGuardRef.current && !navGuardRef.current()) return
    setSelectedCoinSymbol(null)
    setSelectedUserId(userId)
  }

  const handleUserBack = () => {
    setSelectedUserId(null)
  }

  // Fetch holdings for Sentinel (so it can select coins)
  const fetchHoldings = useCallback(async () => {
    try {
      const data = await invoke<PortfolioResponse>('get_portfolio')
      setHoldings(data.coinHoldings)
    } catch (e) {
      console.error('Failed to fetch holdings:', e)
    }
  }, [])

  useEffect(() => {
    fetchHoldings()
  }, [fetchHoldings])

  // Refresh holdings when sentinel sells a coin
  useEffect(() => {
    const unlistenTrade = listen('trade-executed', () => {
      fetchHoldings()
    })
    const unlistenTrigger = listen('sentinel-triggered', () => {
      fetchHoldings()
    })
    return () => {
      unlistenTrade.then(u => u())
      unlistenTrigger.then(u => u())
    }
  }, [fetchHoldings])

  // Clear selected coin/user when switching nav
  useEffect(() => {
    setSelectedCoinSymbol(null)
    setSelectedUserId(null)
    if (activeNav !== 'sentinel') setSentinelSearchQuery('')
  }, [activeNav])
  
  return (
    <div className="min-h-screen flex flex-col">
      <Header user={user} onLogout={onLogout} />
      
      <div className="flex flex-1">
        <Sidebar activeItem={activeNav} onNavigate={guardedNavigate} />
        
        <main className="flex-1 p-3 lg:p-6 overflow-auto min-w-0">
          {/* User Profile Page - highest priority overlay */}
          {selectedUserId ? (
            <div key={`user-${selectedUserId}`} className="page-enter">
              <UserProfilePage
                userId={selectedUserId}
                onBack={handleUserBack}
                onCoinClick={handleCoinClick}
              />
            </div>
          ) : selectedCoinSymbol ? (
            <div key={`coin-${selectedCoinSymbol}`} className="page-enter">
              <CoinDetailPage
                symbol={selectedCoinSymbol}
                onBack={handleCoinDetailBack}
                onTradeComplete={fetchHoldings}
                holdings={holdings}
                onUserClick={handleUserClick}
              />
            </div>
          ) : (
            <div key={activeNav} className="page-enter">
              {activeNav === 'dashboard' && (
                <DashboardHome 
                  user={user} 
                  onViewPortfolio={() => setActiveNav('portfolio')} 
                  onViewMarket={() => setActiveNav('market')}
                  onViewSentinel={() => setActiveNav('sentinel')}
                  onViewSniper={() => setActiveNav('sniper')}
                  onViewMirror={() => setActiveNav('mirror')}
                  onViewDipBuyer={() => setActiveNav('dipbuyer')}
                  onCoinClick={handleCoinClick}
                />
              )}
              
              {activeNav === 'portfolio' && (
                <PortfolioView onCoinClick={handleCoinClick} onSentinelClick={handleSentinelClick} />
              )}

              {activeNav === 'market' && (
                <MarketBrowser onCoinClick={handleCoinClick} />
              )}

              {activeNav === 'sentinel' && (
                <SentinelManager holdings={holdings} onCoinClick={handleCoinClick} initialSearch={sentinelSearchQuery} />
              )}

              {activeNav === 'sniper' && (
                <SniperPage setNavGuard={setNavGuard} />
              )}

              {activeNav === 'mirror' && (
                <MirrorPage />
              )}

              {activeNav === 'dipbuyer' && (
                <DipBuyerPage setNavGuard={setNavGuard} />
              )}

              {activeNav === 'automation' && (
                <AutomationLogPage />
              )}

              {activeNav === 'mobile' && (
                <MobileAccessPage />
              )}

              {activeNav === 'feed' && (
                <LiveTrades onCoinClick={handleCoinClick} onUserClick={handleUserClick} />
              )}

              {activeNav === 'leaderboard' && (
                <LeaderboardPage onUserClick={handleUserClick} />
              )}

              {activeNav === 'history' && (
                <TransactionHistory />
              )}
              
              {activeNav === 'settings' && (
                <SettingsLayout setNavGuard={setNavGuard} />
              )}

              {activeNav === 'about' && (
                <Suspense fallback={
                  <div className="flex items-center justify-center h-48">
                    <div className="text-foreground-muted">Loading...</div>
                  </div>
                }>
                  <AboutPage />
                </Suspense>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
