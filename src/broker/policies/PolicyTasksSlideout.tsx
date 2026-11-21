import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { RightSlideout } from '@/broker/shared/RightSlideout'
import { useStartRoute } from '@/api/hooks'
import { newKey } from '@/copilot/salesApi'
import { guidePath } from '@/broker/routes/launchRoute'
import { useDataCategory } from '@/lib/supabase/category'

const TASKS: Array<{ id: string; label: string; definition_id?: string; href?: (ctx: Ctx) => string }> = [
  { id: 'add_item', label: 'Add item to insure', href: (c) => `/broker/policies/${c.policyId}?task=add_item` },
  { id: 'confirm', label: 'Confirm issued policy', definition_id: 'policy_setup' },
  { id: 'change', label: 'Change cover', definition_id: 'policy_change' },
  { id: 'renew', label: 'Review renewal', definition_id: 'policy_renew' },
  { id: 'claim', label: 'Report a claim', definition_id: 'claim_register' },
  { id: 'evidence', label: 'Supply evidence', href: (c) => (c.claimId ? `/broker/claims/${c.claimId}` : `/broker/claims?personId=${c.personId}`) },
  { id: 'settle', label: 'Record settlement', definition_id: 'claim_resolve' },
  {
    id: 'review_commission',
    label: 'Review commission',
    href: (c) => `/broker/financials?tab=transactions${c.policyId ? `&policyId=${c.policyId}` : ''}`,
  },
  {
    id: 'reconcile_statement',
    label: 'Reconcile insurer statement',
    href: () => '/broker/financials?tab=statements',
  },
  {
    id: 'review_payouts',
    label: 'Review broker payouts',
    href: () => '/broker/financials?tab=payouts',
  },
]

type Ctx = { personId: string; policyId?: string | null; claimId?: string | null }

/** What-you-wanna-do task buttons in a right slideout, carrying client/policy/claim context. */
export function PolicyTasksSlideout({
  open,
  onClose,
  personId,
  policyId,
  claimId,
  title = 'What you wanna do!',
}: {
  open: boolean
  onClose: () => void
  personId: string
  policyId?: string | null
  claimId?: string | null
  title?: string
}) {
  const category = useDataCategory()
  const start = useStartRoute()
  const navigate = useNavigate()
  const ctx: Ctx = { personId, policyId, claimId }

  const run = (t: (typeof TASKS)[number]) => {
    if (t.href) {
      navigate(t.href(ctx))
      onClose()
      return
    }
    if (!t.definition_id) return
    start.mutate(
      {
        definition_id: t.definition_id,
        person_id: personId,
        policy_id: policyId ?? null,
        claim_id: claimId ?? null,
        key: newKey(),
      },
      {
        onSuccess: (s) => {
          navigate(guidePath(s.progress.run.id))
          onClose()
        },
      },
    )
  }

  return (
    <RightSlideout
      open={open}
      onClose={onClose}
      title={title}
      demo={category === 'sample'}
      subtitle="Opens the matching workflow with this record selected"
    >
      <div className="grid gap-2">
        {TASKS.map((t) => {
          const needsClaim = t.id === 'evidence' || t.id === 'settle'
          const disabled = needsClaim && !claimId && t.id === 'settle'
          return (
            <Button
              key={t.id}
              type="button"
              variant="outline"
              className="justify-start"
              disabled={start.isPending || disabled}
              onClick={() => run(t)}
            >
              {t.label}
            </Button>
          )
        })}
      </div>
    </RightSlideout>
  )
}
