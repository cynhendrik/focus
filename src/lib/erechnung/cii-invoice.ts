import type { InvoiceWithItems } from '@/types/finance.types'
import type { CompanyProfile } from '@/types/company.types'
import type { Account } from '@/types/account.types'
import { computeTaxRateGroups } from '@/lib/invoice-tax'
import { vatCategory } from './vat-category'
import { unitCode } from './unit-codes'
import { countryCode } from './country-codes'

const esc = (s: string): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const n2 = (n: number): string => (Math.round(n * 100) / 100).toFixed(2)
const n4 = (n: number): string => (Math.round(n * 10000) / 10000).toFixed(4)
const ymd = (iso: string): string => (iso || '').slice(0, 10).replace(/-/g, '')

/** Adresse "Straße, PLZ Ort" grob in Bestandteile; nur Fallback für das Profil. */
function profileAddress(profile: CompanyProfile): { line: string } {
  return { line: profile.address ?? '' }
}

function sellerTaxRegistration(profile: CompanyProfile): string {
  if (profile.taxId) return `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(profile.taxId)}</ram:ID></ram:SpecifiedTaxRegistration>`
  if (profile.steuernummer) return `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(profile.steuernummer)}</ram:ID></ram:SpecifiedTaxRegistration>`
  return ''
}

/** EN16931 CrossIndustryInvoice (Factur-X) als String. */
export function buildCiiXml(data: InvoiceWithItems, profile: CompanyProfile, account: Account): string {
  const { invoice, items } = data
  let bank: Record<string, string> = {}
  try { bank = JSON.parse(invoice.bankInfo || '{}') } catch { /* ignore */ }
  const iban = bank.iban || profile.iban || ''

  // USt-Aufschlüsselung
  const isExemptMode = invoice.taxMode === 'reverse_charge' || invoice.taxMode === 'kleinunternehmer'
  const tradeTaxBlocks: string[] = []
  if (isExemptMode) {
    const cat = vatCategory(invoice.taxMode, 0)
    tradeTaxBlocks.push(`
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>0.00</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        ${cat.exemptionReason ? `<ram:ExemptionReason>${esc(cat.exemptionReason)}</ram:ExemptionReason>` : ''}
        <ram:BasisAmount>${n2(invoice.subtotal)}</ram:BasisAmount>
        <ram:CategoryCode>${cat.code}</ram:CategoryCode>
        <ram:RateApplicablePercent>0.00</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`)
  } else {
    for (const g of computeTaxRateGroups(items)) {
      const groupCat = vatCategory(invoice.taxMode, g.rate)
      tradeTaxBlocks.push(`
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${n2(g.tax)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${n2(g.net)}</ram:BasisAmount>
        <ram:CategoryCode>${groupCat.code}</ram:CategoryCode>
        <ram:RateApplicablePercent>${n2(g.rate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`)
    }
  }

  // Positionen
  const lineItems = items.map((it, i) => {
    const cat = vatCategory(invoice.taxMode, it.taxRate)
    const lineNet = it.quantity * it.unitPrice
    return `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${esc(it.title)}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>${n4(it.unitPrice)}</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${unitCode(it.unit)}">${n4(it.quantity)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${cat.code}</ram:CategoryCode>
          <ram:RateApplicablePercent>${n2(cat.rate)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${n2(lineNet)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`
  }).join('')

  const sellerAddr = profileAddress(profile)

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(invoice.number ?? '')}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${ymd(invoice.date)}</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lineItems}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${esc(profile.name ?? '')}</ram:Name>
        <ram:PostalTradeAddress><ram:CountryID>DE</ram:CountryID><ram:LineOne>${esc(sellerAddr.line)}</ram:LineOne></ram:PostalTradeAddress>
        ${sellerTaxRegistration(profile)}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(account.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(account.zip ?? '')}</ram:PostcodeCode>
          <ram:LineOne>${esc(account.street ?? '')}</ram:LineOne>
          <ram:CityName>${esc(account.city ?? '')}</ram:CityName>
          <ram:CountryID>${countryCode(account.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${account.vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(account.vatId)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      ${iban ? `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(iban)}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>` : ''}${tradeTaxBlocks.join('')}
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime><udt:DateTimeString format="102">${ymd(invoice.dueDate)}</udt:DateTimeString></ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${n2(invoice.subtotal)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${n2(invoice.subtotal)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${n2(invoice.taxAmount)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${n2(invoice.total)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${n2(invoice.total)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`
}
