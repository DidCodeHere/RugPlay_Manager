import { useState } from 'react'
import { 
  LayoutDashboard, 
  Wallet, 
  Store,
  Activity,
  Crosshair, 
  Users, 
  Shield,
  FileText,
  Settings,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  ScrollText,
  Trophy,
  Info,
} from 'lucide-react'

export type NavItemId = 'dashboard' | 'portfolio' | 'market' | 'feed' | 'history' | 'leaderboard' | 'sentinel' | 'sniper' | 'mirror' | 'dipbuyer' | 'automation' | 'mobile' | 'settings' | 'about'

interface NavItem {
  id: NavItemId
  label: string
  icon: React.ReactNode
  disabled?: boolean
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
  { id: 'portfolio', label: 'Portfolio', icon: <Wallet className="w-5 h-5" /> },
  { id: 'market', label: 'Market', icon: <Store className="w-5 h-5" /> },
  { id: 'feed', label: 'Live Feed', icon: <Activity className="w-5 h-5" /> },
  { id: 'history', label: 'History', icon: <FileText className="w-5 h-5" /> },
  { id: 'leaderboard', label: 'Leaderboard', icon: <Trophy className="w-5 h-5" /> },
  { id: 'sentinel', label: 'Sentinel', icon: <Shield className="w-5 h-5" /> },
  { id: 'sniper', label: 'Sniper', icon: <Crosshair className="w-5 h-5" /> },
  { id: 'mirror', label: 'Mirror', icon: <Users className="w-5 h-5" /> },
  { id: 'dipbuyer', label: 'Dip Buyer', icon: <TrendingDown className="w-5 h-5" /> },
  { id: 'automation', label: 'Automation', icon: <ScrollText className="w-5 h-5" /> },
  { id: 'mobile', label: 'Mobile', icon: <Smartphone className="w-5 h-5" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  { id: 'about', label: 'About & Guides', icon: <Info className="w-5 h-5" /> },
]

interface SidebarProps {
  activeItem: NavItemId
  onNavigate: (id: NavItemId) => void
}

export function Sidebar({ activeItem, onNavigate }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside 
      className={`
        border-r border-background-tertiary bg-background-secondary
        transition-all duration-300 flex flex-col
        ${collapsed ? 'w-16' : 'w-56'}
      `}
    >
      <nav className="flex-1 p-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => !item.disabled && onNavigate(item.id)}
            disabled={item.disabled}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1
              transition-colors
              ${activeItem === item.id 
                ? 'bg-blue-600 text-white' 
                : 'text-foreground-muted hover:bg-background-tertiary hover:text-foreground'
              }
              ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            title={collapsed ? item.label : undefined}
          >
            {item.icon}
            {!collapsed && (
              <span className="text-sm font-medium">{item.label}</span>
            )}
            {!collapsed && item.disabled && (
              <span className="ml-auto text-xs bg-background-tertiary px-1.5 py-0.5 rounded">
                Soon
              </span>
            )}
          </button>
        ))}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="p-4 border-t border-background-tertiary text-foreground-muted hover:text-foreground transition-colors flex items-center justify-center"
      >
        {collapsed ? (
          <ChevronRight className="w-5 h-5" />
        ) : (
          <ChevronLeft className="w-5 h-5" />
        )}
      </button>
    </aside>
  )
}
