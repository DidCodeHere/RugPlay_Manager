import { invoke } from '@tauri-apps/api/core'
import { useState, useEffect } from 'react'
import type {
  ResearchManifest,
  ResearchSentinelConfig,
  ResearchAboutStats,
} from '../lib/types'

export function useResearchManifest() {
  const [manifest, setManifest] = useState<ResearchManifest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    invoke<ResearchManifest>('get_research_manifest')
      .then(setManifest)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return { manifest, loading, error }
}

export function useResearchSentinelDefaults() {
  const [defaults, setDefaults] = useState<ResearchSentinelConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    invoke<ResearchSentinelConfig>('get_research_sentinel_defaults')
      .then(setDefaults)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return { defaults, loading }
}

export function useResearchDipBuyerDefaults() {
  const [presets, setPresets] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    invoke<Record<string, unknown>>('get_research_dipbuyer_defaults')
      .then(setPresets)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return { presets, loading }
}

export function useResearchAboutStats() {
  const [stats, setStats] = useState<{
    version: string
    generated: string
    about: ResearchAboutStats
    topCoins: unknown[]
    tierSummary: Record<string, unknown>
    mcapTiers: Record<string, unknown>
    holdAnalysis: Record<string, unknown>
    gridAggregate: Record<string, unknown>
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    invoke<typeof stats>('get_research_about_stats')
      .then(setStats)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return { stats, loading, error }
}
