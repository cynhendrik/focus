import { chromium } from 'playwright'

const URL = 'http://localhost:1420'
const OUT = 'C:/Users/hendr/Documents/focusdesktop/cyneradev/scripts'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)

try {
  const skip = page.getByText('Überspringen', { exact: false }).first()
  if (await skip.isVisible({ timeout: 1500 })) { await skip.click(); await page.waitForTimeout(1200) }
} catch {}

// Tab until focus rests on a LEFT-SIDEBAR item (x < 240) — dark background, so a
// blue focus ring contrasts clearly.
let info = null
for (let i = 0; i < 14; i++) {
  await page.keyboard.press('Tab')
  await page.waitForTimeout(120)
  const cur = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      tag: el.tagName.toLowerCase(),
      cls: String(el.className || ''),
      label: (el.textContent || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').trim().slice(0, 40),
      x: r.x, y: r.y, w: r.width, h: r.height,
      outline: cs.outlineWidth + ' ' + cs.outlineStyle + ' ' + cs.outlineColor,
    }
  })
  if (cur && cur.x < 240 && !cur.cls.includes('corra') && cur.h > 24 && cur.h < 56 && cur.y > 90 && cur.y < 420) { info = cur; break }
  if (cur && !info) info = cur
}

await page.screenshot({ path: `${OUT}/shot-full.png` })
if (info) {
  const pad = 16
  await page.screenshot({
    path: `${OUT}/shot-ring.png`,
    clip: {
      x: Math.max(0, info.x - pad), y: Math.max(0, info.y - pad),
      width: Math.min(1440 - Math.max(0, info.x - pad), info.w + pad * 2),
      height: Math.min(900 - Math.max(0, info.y - pad), info.h + pad * 2),
    },
  })
}
console.log('FOCUSED:', JSON.stringify(info))
await browser.close()
