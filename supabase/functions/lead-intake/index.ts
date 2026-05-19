// Supabase Edge Function: Lead Intake Webhook Relay
// Receives leads from Zoom, Wix, WordPress, Zapier and stores in pending_leads
//
// SQL to create the pending_leads table (run in Supabase Dashboard):
// CREATE TABLE IF NOT EXISTS pending_leads (
//   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   workspace_id TEXT NOT NULL,
//   email TEXT NOT NULL,
//   name TEXT,
//   source TEXT NOT NULL,
//   source_detail TEXT,
//   payload JSONB,
//   synced BOOLEAN DEFAULT false,
//   created_at TIMESTAMPTZ DEFAULT now()
// );
// CREATE INDEX IF NOT EXISTS idx_pending_leads_sync ON pending_leads(workspace_id, synced);

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

interface NormalizedLead {
  email: string
  name: string | null
  source: 'zoom' | 'generic'
  source_detail: string | null
}

function parseZoom(body: Record<string, unknown>): NormalizedLead | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = (body as any).payload?.object
    const reg = obj?.registrant
    if (!reg?.email) return null
    return {
      email: reg.email,
      name: [reg.first_name, reg.last_name].filter(Boolean).join(' ') || null,
      source: 'zoom',
      source_detail: obj?.topic ?? null,
    }
  } catch {
    return null
  }
}

function parseGeneric(body: Record<string, unknown>): NormalizedLead | null {
  const email = body.email as string | undefined
  if (!email) return null
  return {
    email,
    name: (body.name as string | null) ?? null,
    source: 'generic',
    source_detail: (body.source_detail as string | null) ?? null,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const url = new URL(req.url)
  const workspaceId = url.searchParams.get('workspace_id')
  const secret = url.searchParams.get('secret')
  const source = url.searchParams.get('source') ?? 'generic'

  if (!workspaceId || !secret) {
    return new Response('Missing workspace_id or secret', { status: 400 })
  }

  const expectedSecret = Deno.env.get('LEAD_WEBHOOK_SECRET')
  if (secret !== expectedSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const lead = source === 'zoom' ? parseZoom(body) : parseGeneric(body)
  if (!lead) {
    return new Response('Could not parse lead — missing email field', { status: 422 })
  }

  const { error } = await supabase.from('pending_leads').insert({
    workspace_id: workspaceId,
    email: lead.email,
    name: lead.name,
    source: lead.source,
    source_detail: lead.source_detail,
    payload: body,
    synced: false,
  })

  if (error) {
    console.error('Insert error:', error)
    return new Response('Database error', { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
