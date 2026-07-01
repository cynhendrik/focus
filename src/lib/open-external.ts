/**
 * Öffnet eine URL im Standard-Browser des Systems (Tauri-Opener-Plugin).
 * Dynamischer Import, damit Tests / Nicht-Tauri-Umgebungen nicht brechen;
 * Fallback auf window.open.
 */
export async function openExternal(url: string): Promise<void> {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  } catch {
    try { window.open(url, '_blank', 'noopener,noreferrer') } catch { /* ignore */ }
  }
}
