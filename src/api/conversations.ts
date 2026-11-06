import { useCallback, useEffect, useState } from 'react'
import type { Channel } from '@/server/db/schema'
import { api, ApiError, type AssistantKind } from './client'
import { useSessionToken } from './hooks'

const KEY = 'insureflow_conversations'
const inFlight = new Map<string, Promise<string | null>>()

const readAll = (): Record<string, string> => JSON.parse(localStorage.getItem(KEY) ?? '{}')
const write = (scope: string, id: string | null) => {
  const all = readAll()
  if (id) all[scope] = id
  else delete all[scope]
  localStorage.setItem(KEY, JSON.stringify(all))
}

/** Keeps one conversation per channel and identity in this browser, starting a fresh one when needed. */
export function usePersistentConversation(channel: Channel, assistant?: AssistantKind) {
  const token = useSessionToken()
  const scope = assistant ? `${channel}/${assistant}:${token ?? 'visitor'}` : `${channel}:${token ?? 'visitor'}`
  const [conversationId, setConversationId] = useState<string | null>(() => readAll()[scope] ?? null)
  const [error, setError] = useState<string | null>(null)

  const start = useCallback(async () => {
    setError(null)
    try {
      const view = await api.startConversation(channel, undefined, assistant)
      write(scope, view.conversation.id)
      setConversationId(view.conversation.id)
      return view.conversation.id
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start a conversation')
      return null
    }
  }, [channel, scope, assistant])

  useEffect(() => {
    const existing = readAll()[scope] ?? null
    setConversationId(existing)
    if (inFlight.has(scope)) {
      void inFlight.get(scope)!.then((id) => id && setConversationId(id))
      return
    }
    const verify = async (): Promise<string | null> => {
      if (existing) {
        try {
          await api.conversation(existing)
          return existing
        } catch {
          write(scope, null)
        }
      }
      return start()
    }
    const p = verify().finally(() => inFlight.delete(scope))
    inFlight.set(scope, p)
  }, [scope, start])

  return { conversationId, restart: start, error }
}
