import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { RefreshCw } from 'lucide-react'

interface DocViewerProps {
  slug: string
}

export function DocViewer({ slug }: DocViewerProps) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    invoke<string>('get_doc_content', { slug })
      .then(setContent)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="w-6 h-6 animate-spin text-foreground-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center text-foreground-muted">
        Failed to load documentation: {error}
      </div>
    )
  }

  return (
    <div className="doc-viewer prose prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content ?? ''}</ReactMarkdown>
    </div>
  )
}
