import { useUiStore } from '@/store/ui.store'
import { useWorkspaceStore } from '@/store/workspace.store'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const WEBHOOK_SECRET = import.meta.env.VITE_LEAD_WEBHOOK_SECRET as string | undefined

function WebhookUrlField({ label, url }: { label: string; url: string }) {
  function handleCopy() {
    navigator.clipboard.writeText(url)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-[var(--text2)]">{label}</p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg2)] border border-[var(--border)] text-xs text-[var(--text2)] font-mono truncate outline-none"
        />
        <button
          onClick={handleCopy}
          className="px-3 py-1.5 rounded-lg bg-[var(--bg2)] border border-[var(--border)] text-xs text-[var(--text)] hover:bg-[var(--bg3)] transition-colors whitespace-nowrap"
        >
          Kopieren
        </button>
      </div>
    </div>
  )
}

export function SettingsRoute() {
  const theme = useUiStore(s => s.theme)
  const toggleTheme = useUiStore(s => s.toggleTheme)
  const workspaceId = useWorkspaceStore(s => s.activeWorkspaceId)

  const secretMissing = !WEBHOOK_SECRET
  const base = SUPABASE_URL ?? ''
  const secret = WEBHOOK_SECRET ?? ''
  const wid = workspaceId ?? ''

  const zoomUrl = `${base}/functions/v1/lead-intake?workspace_id=${wid}&secret=${secret}&source=zoom`
  const genericUrl = `${base}/functions/v1/lead-intake?workspace_id=${wid}&secret=${secret}&source=generic`

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-semibold text-[var(--text)]">Settings</h1>
      </div>
      <div className="flex-1 overflow-auto p-6 max-w-lg">
        <div className="flex flex-col gap-4">
          <div className="p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)] flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text)]">Theme</p>
              <p className="text-xs text-[var(--text2)] mt-0.5">
                {theme === 'dark' ? 'Dunkel' : 'Hell'}
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className="px-4 py-1.5 rounded-lg bg-[var(--bg2)] border border-[var(--border)] text-sm text-[var(--text)] hover:bg-[var(--bg3)] transition-colors"
            >
              {theme === 'dark' ? '☀ Hell' : '🌙 Dunkel'}
            </button>
          </div>

          <div className="p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)]">
            <p className="text-sm font-medium text-[var(--text)]">Cynera Focus</p>
            <p className="text-xs text-[var(--text2)] mt-0.5">Version 2.0.0</p>
          </div>

          {/* Leads & Integrationen */}
          <div className="p-4 rounded-xl bg-[var(--bg1)] border border-[var(--border)] flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium text-[var(--text)]">Leads & Integrationen</p>
              <p className="text-xs text-[var(--text2)] mt-0.5">
                Kopiere die Webhook-URLs in dein externes Tool (Zoom, Wix, WordPress, Zapier), um automatisch Leads zu empfangen.
              </p>
            </div>

            {secretMissing ? (
              <p className="text-xs text-amber-500">
                VITE_LEAD_WEBHOOK_SECRET nicht konfiguriert
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <WebhookUrlField label="Zoom Webhook URL" url={zoomUrl} />
                <WebhookUrlField
                  label="Generic Webhook URL (Wix, WordPress, Zapier)"
                  url={genericUrl}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
