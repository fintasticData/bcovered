import { useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { JobAction } from '@/server/api'
import { api, session } from './client'

/** The current demo identity. Every query key includes it, so switching identity never shows another user's data. */
export const useSessionToken = () => useSyncExternalStore(session.subscribe, session.get, () => null)

function useKey(...parts: unknown[]) {
  return [useSessionToken() ?? 'visitor', ...parts]
}

function useInvalidatingMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries() })
}

export const useMe = () => useQuery({ queryKey: useKey('me'), queryFn: api.me })
export const useIdentities = () => useQuery({ queryKey: useKey('identities'), queryFn: api.identities })
export const usePlatform = () => useQuery({ queryKey: useKey('platform'), queryFn: api.platform })
export const useResetDemo = () => useInvalidatingMutation(() => api.resetDemo())

export const useConversation = (id: string | null) =>
  useQuery({ queryKey: useKey('conversation', id), queryFn: () => api.conversation(id!), enabled: Boolean(id) })
export const useConversationProgress = (id: string | null) =>
  useQuery({ queryKey: useKey('conversation-progress', id), queryFn: () => api.conversationProgress(id!), enabled: Boolean(id) })
export const useSendMessage = (id: string | null) => useInvalidatingMutation((text: string) => api.sendMessage(id!, text))

export const useJobs = (includeArchived = false) =>
  useQuery({ queryKey: useKey('jobs', includeArchived), queryFn: () => api.jobs(includeArchived) })
export const useJob = (id: string | null | undefined) =>
  useQuery({ queryKey: useKey('job', id), queryFn: () => api.job(id!), enabled: Boolean(id) })
export const useControlJob = () =>
  useInvalidatingMutation(({ jobId, action }: { jobId: string; action: JobAction }) => api.controlJob(jobId, action))

export const useLeads = () => useQuery({ queryKey: useKey('leads'), queryFn: api.leads })
export const useLead = (id: string | undefined) =>
  useQuery({ queryKey: useKey('lead', id), queryFn: () => api.lead(id!), enabled: Boolean(id) })

export const useQuote = (id: string | undefined) =>
  useQuery({ queryKey: useKey('quote', id), queryFn: () => api.quote(id!), enabled: Boolean(id) })
export const useAskQuote = (id: string) => useMutation({ mutationFn: (q: string) => api.askQuote(id, q) })

export const useApprovals = (status?: Parameters<typeof api.approvals>[0]) =>
  useQuery({ queryKey: useKey('approvals', status), queryFn: () => api.approvals(status) })
export const useDecideApproval = () => useInvalidatingMutation((body: Parameters<typeof api.decideApproval>[0]) => api.decideApproval(body))

export const usePortal = () => useQuery({ queryKey: useKey('portal'), queryFn: api.portal })
export const usePortalProposal = (quoteId: string | undefined) =>
  useQuery({ queryKey: useKey('portal-proposal', quoteId), queryFn: () => api.portalProposal(quoteId!), enabled: Boolean(quoteId) })
export const useOverview = () => useQuery({ queryKey: useKey('overview'), queryFn: api.overview })

const c = api.commercial
export const useIndustries = () => useQuery({ queryKey: useKey('industries'), queryFn: c.industries })
export const useCommercialClients = () => useQuery({ queryKey: useKey('commercial-clients'), queryFn: c.clients })
export const useCommercialClient = (id: string | null | undefined) =>
  useQuery({ queryKey: useKey('commercial-client', id), queryFn: () => c.client(id!), enabled: Boolean(id) })
export const useUpdateCommercialClient = () => useInvalidatingMutation(c.updateClient)
export const useRiskTwins = () => useQuery({ queryKey: useKey('risk-twins'), queryFn: c.riskTwins })
export const useSubmissions = () => useQuery({ queryKey: useKey('submissions'), queryFn: c.submissions })
export const useSubmission = (id: string | null | undefined) =>
  useQuery({ queryKey: useKey('submission', id), queryFn: () => c.submission(id!), enabled: Boolean(id) })
export const useUpdateSection = () => useInvalidatingMutation(c.updateSection)
export const useRequestSubmissionApproval = () => useInvalidatingMutation(c.requestApproval)
export const useUpdateTask = () => useInvalidatingMutation(c.updateTask)
export const usePortalBusiness = () => useQuery({ queryKey: useKey('portal-business'), queryFn: c.portal })
