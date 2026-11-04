import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { ConfirmationDialog } from './ConfirmDialog'

type ConfirmOptions = {
  title: string
  message: string
  confirmLabel?: string
  variant?: 'default' | 'danger'
}

export function useConfirmDialog() {
  const [options, setOptions] =
    useState<ConfirmOptions | null>(null)

  const resolverRef =
    useRef<((accepted: boolean) => void) | null>(null)

  const confirm = useCallback(
    (nextOptions: ConfirmOptions): Promise<boolean> => {
      if (resolverRef.current) {
        return Promise.resolve(false)
      }

      return new Promise<boolean>(resolve => {
        resolverRef.current = resolve
        setOptions(nextOptions)
      })
    },
    []
  )

  const finish = useCallback((accepted: boolean) => {
    const resolve = resolverRef.current
    resolverRef.current = null

    setOptions(null)
    resolve?.(accepted)
  }, [])

  useEffect(() => {
    return () => {
      resolverRef.current?.(false)
      resolverRef.current = null
    }
  }, [])

  const confirmationDialog = options ? (
    <ConfirmationDialog
      options={options}
      onAccept={() => finish(true)}
      onCancel={() => finish(false)}
    />
  ) : null

  return { confirm, confirmationDialog }
}
