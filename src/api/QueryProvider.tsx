import { useEffect, useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError, session, subscribeToChanges } from './client'

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  useEffect(() => {
    let timer: number | undefined
    const refresh = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void client.invalidateQueries(), 60)
    }
    const offData = subscribeToChanges(refresh)
    const offSession = session.subscribe(refresh)
    return () => {
      offData()
      offSession()
      window.clearTimeout(timer)
    }
  }, [client])

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
