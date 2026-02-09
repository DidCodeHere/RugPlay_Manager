import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function formatNumber(value: number, decimals: number = 8): string {
  return value.toFixed(decimals)
}

export function truncateTo8Decimals(value: number): number {
  return Math.floor(value * 1e8) / 1e8
}

/**
 * Build a full URL for Rugplay images (coin icons, user avatars).
 * The API returns relative paths like "coins/r0bux.webp" or "avatars/20357.webp".
 * The actual images are served via an S3 proxy at /api/proxy/s3/.
 */
export function buildImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `https://rugplay.com/api/proxy/s3/${path}`
}
