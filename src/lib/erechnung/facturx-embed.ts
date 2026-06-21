import { PDFDocument, AFRelationship, PDFName, PDFNumber, PDFString } from 'pdf-lib'

const FX_FILENAME = 'factur-x.xml'

function buildXmp(): string {
  // PDF/A-3B + Factur-X-Extension-Schema (Profil EN 16931).
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentFileName</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>name of the embedded XML invoice file</pdfaProperty:description></rdf:li>
                <rdf:li rdf:parseType="Resource"><pdfaProperty:name>DocumentType</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>INVOICE</pdfaProperty:description></rdf:li>
                <rdf:li rdf:parseType="Resource"><pdfaProperty:name>Version</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>version of the Factur-X standard</pdfaProperty:description></rdf:li>
                <rdf:li rdf:parseType="Resource"><pdfaProperty:name>ConformanceLevel</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>conformance level</pdfaProperty:description></rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

/**
 * Bettet das CII-XML als Factur-X-Anhang in ein vorhandenes PDF ein und setzt
 * die PDF/A-3-/Factur-X-XMP-Metadaten. Liefert die neuen PDF-Bytes.
 *
 * @param iccBytes Optionales sRGB-ICC-Profil. Wenn vorhanden, wird ein gültiger
 *   PDF/A-OutputIntent mit eingebettetem Zielprofil ergänzt (für strikte
 *   PDF/A-3-Konformität). Fehlt es, verhält sich die Funktion wie zuvor.
 */
export async function embedFacturX(
  pdfBytes: Uint8Array,
  ciiXml: string,
  iccBytes?: Uint8Array,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes)
  // `Uint8Array.from` normalisiert die TextEncoder-Ausgabe auf den hier sichtbaren
  // Uint8Array-Realm — sonst schlägt pdf-libs instanceof-Prüfung unter jsdom fehl.
  const xmlBytes = Uint8Array.from(new TextEncoder().encode(ciiXml))

  await doc.attach(xmlBytes, FX_FILENAME, {
    mimeType: 'text/xml',
    description: 'Factur-X / ZUGFeRD invoice data',
    afRelationship: AFRelationship.Alternative,
    creationDate: new Date(),
    modificationDate: new Date(),
  })

  // XMP-Metadaten in den Catalog schreiben.
  const xmp = buildXmp()
  const metaStream = doc.context.stream(xmp, {
    Type: 'Metadata',
    Subtype: 'XML',
  })
  const metaRef = doc.context.register(metaStream)
  doc.catalog.set(PDFName.of('Metadata'), metaRef)

  // PDF/A-OutputIntent mit eingebettetem sRGB-ICC-Profil (best-effort).
  if (iccBytes && iccBytes.length > 0) {
    // ICC als Flate-komprimierter Stream; /N 3 = drei Farbkomponenten (RGB).
    const iccNorm = Uint8Array.from(iccBytes)
    const iccStream = doc.context.flateStream(iccNorm, {
      N: PDFNumber.of(3),
    })
    const iccRef = doc.context.register(iccStream)

    const outputIntent = doc.context.obj({
      Type: PDFName.of('OutputIntent'),
      S: PDFName.of('GTS_PDFA1'),
      OutputConditionIdentifier: PDFString.of('sRGB'),
      Info: PDFString.of('sRGB IEC61966-2.1'),
      DestOutputProfile: iccRef,
    })
    const outputIntentRef = doc.context.register(outputIntent)
    doc.catalog.set(PDFName.of('OutputIntents'), doc.context.obj([outputIntentRef]))
  }

  return doc.save()
}
