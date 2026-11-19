/** Live organisation media fields on Supabase (logo / brand / video / profile doc URLs). */
import { supabase } from './client'

export interface OrganisationMediaFields {
  logo_url: string | null
  brand_image_url: string | null
  intro_video_url: string | null
  profile_doc_url: string | null
}

export async function fetchOrganisationMedia(organisationId: string): Promise<OrganisationMediaFields | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('organisations')
    .select('logo_url, brand_image_url, intro_video_url, profile_doc_url')
    .eq('id', organisationId)
    .maybeSingle()
  if (error || !data) return null
  return {
    logo_url: data.logo_url ?? null,
    brand_image_url: data.brand_image_url ?? null,
    intro_video_url: data.intro_video_url ?? null,
    profile_doc_url: data.profile_doc_url ?? null,
  }
}

export async function patchOrganisationMedia(organisationId: string, patch: Partial<OrganisationMediaFields>) {
  if (!supabase) throw new Error('Supabase is not configured in this build.')
  const { error } = await supabase.from('organisations').update(patch).eq('id', organisationId)
  if (error) throw new Error(error.message)
}
