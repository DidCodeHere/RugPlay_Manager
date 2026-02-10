import { useEffect, useCallback, useRef } from 'react'

/**
 * Hook that warns users when they try to close the window with unsaved changes.
 * Returns a `confirmDiscard` function for programmatic navigation guards.
 */
export function useUnsavedChanges(hasChanges: boolean) {
  const hasChangesRef = useRef(hasChanges)
  hasChangesRef.current = hasChanges

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasChangesRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const confirmDiscard = useCallback((): boolean => {
    if (!hasChangesRef.current) return true
    return window.confirm('You have unsaved changes. Discard them?')
  }, [])

  return { confirmDiscard }
}
