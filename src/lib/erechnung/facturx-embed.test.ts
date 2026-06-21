import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { embedFacturX } from './facturx-embed'

async function minimalPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.addPage([200, 200])
  return doc.save()
}

describe('embedFacturX', () => {
  it('hängt factur-x.xml an und setzt XMP/Factur-X-Metadaten', async () => {
    const xml = '<?xml version="1.0"?><rsm:CrossIndustryInvoice/>'
    const out = await embedFacturX(await minimalPdf(), xml)
    const text = Buffer.from(out).toString('latin1')
    expect(text).toContain('factur-x.xml')          // Dateiname im EmbeddedFiles-Namebaum
    expect(text).toContain('pdfaid')                 // PDF/A XMP-Namespace
    expect(text).toContain('CrossIndustryDocument')  // Factur-X-Extension
    // Reload bestätigt valides PDF
    const reloaded = await PDFDocument.load(out)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('produziert größeres PDF als das Original (Anhang vorhanden)', async () => {
    const base = await minimalPdf()
    const out = await embedFacturX(base, '<x>data here padding padding</x>')
    expect(out.length).toBeGreaterThan(base.length)
  })
})
