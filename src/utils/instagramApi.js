const BASE = 'https://graph.instagram.com'

async function apiFetch(url) {
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function fetchInstagramUser(accessToken) {
  return apiFetch(`${BASE}/me?fields=id,username,account_type&access_token=${accessToken}`)
}

export async function fetchAllReels(accessToken) {
  const fields = 'id,caption,media_type,timestamp,like_count,comments_count,thumbnail_url,media_url'
  const mediaRes = await apiFetch(`${BASE}/me/media?fields=${fields}&limit=100&access_token=${accessToken}`)
  const items = (mediaRes.data ?? []).filter(m => m.media_type === 'VIDEO' || m.media_type === 'REELS')

  const reels = await Promise.all(items.map(async item => {
    let insightMap = {}
    try {
      const metrics = 'plays,reach,impressions,shares,saved'
      const ins = await apiFetch(`${BASE}/${item.id}/insights?metric=${metrics}&access_token=${accessToken}`)
      ;(ins.data ?? []).forEach(i => {
        insightMap[i.name] = i.values?.[0]?.value ?? i.value ?? 0
      })
    } catch { /* insights may not be available on all account types */ }

    return {
      id: item.id,
      caption: item.caption ?? '',
      hashtags: extractHashtags(item.caption),
      views: insightMap.plays ?? 0,
      likes: item.like_count ?? 0,
      comments: item.comments_count ?? 0,
      shares: insightMap.shares ?? 0,
      saves: insightMap.saved ?? 0,
      reach: insightMap.reach ?? 0,
      impressions: insightMap.impressions ?? 0,
      length_seconds: null,
      posted_at: item.timestamp,
      thumbnail_url: item.thumbnail_url ?? item.media_url ?? null,
    }
  }))

  return reels.sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at))
}

export function extractHashtags(caption = '') {
  return (caption.match(/#[\wÀ-ɏ]+/g) ?? []).map(h => h.slice(1))
}

export function buildExportJson(customerName, reels) {
  return {
    customer: customerName,
    exported_at: new Date().toISOString(),
    instagram: { reels },
  }
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
