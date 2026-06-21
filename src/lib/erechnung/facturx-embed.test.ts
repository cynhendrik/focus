import { describe, it, expect } from 'vitest'
import { PDFDocument, PDFName } from 'pdf-lib'
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

  it('mit ICC-Bytes: setzt ein /OutputIntents-Array + eingebetteten ICC-Stream', async () => {
    const xml = '<?xml version="1.0"?><rsm:CrossIndustryInvoice/>'
    // Plausible ICC-Bytes (Inhalt egal für den Embedding-Test).
    const icc = new Uint8Array(512).fill(1)
    const out = await embedFacturX(await minimalPdf(), xml, icc)
    // pdf-lib komprimiert den Catalog in einen Object-Stream — daher über das
    // geladene Dokument prüfen statt per reiner Byte-Suche.
    const reloaded = await PDFDocument.load(out)
    expect(reloaded.getPageCount()).toBe(1)
    expect(reloaded.catalog.lookup(PDFName.of('OutputIntents'))).toBeDefined()
    // Der eingebettete ICC-Stream mit /N 3 ist unkomprimiert im Byte-Strom sichtbar.
    const text = Buffer.from(out).toString('latin1')
    expect(text).toMatch(/\/N 3/)
  })

  it('mit ICC-Bytes: OutputIntent-Dict trägt S=GTS_PDFA1 und sRGB-Profil', async () => {
    const xml = '<?xml version="1.0"?><rsm:CrossIndustryInvoice/>'
    const icc = new Uint8Array(512).fill(1)
    const out = await embedFacturX(await minimalPdf(), xml, icc)
    const reloaded = await PDFDocument.load(out)
    const arr = reloaded.catalog.lookup(PDFName.of('OutputIntents')) as { get(i: number): unknown }
    // Erstes (einziges) OutputIntent-Dict auflösen.
    const oiDict = reloaded.context.lookup(arr.get(0)) as {
      get(name: PDFName): unknown
    }
    expect(String(oiDict.get(PDFName.of('S')))).toBe('/GTS_PDFA1')
    expect(String(oiDict.get(PDFName.of('OutputConditionIdentifier')))).toContain('sRGB')
    // DestOutputProfile referenziert einen eingebetteten Stream.
    expect(oiDict.get(PDFName.of('DestOutputProfile'))).toBeDefined()
  })

  it('ohne ICC-Bytes: kein OutputIntent, kein Fehler', async () => {
    const xml = '<?xml version="1.0"?><rsm:CrossIndustryInvoice/>'
    const out = await embedFacturX(await minimalPdf(), xml)
    const reloaded = await PDFDocument.load(out)
    expect(reloaded.catalog.lookup(PDFName.of('OutputIntents'))).toBeUndefined()
  })
})
