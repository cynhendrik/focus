import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Briefcase, Sparkles, Users, UserPlus, ArrowRight, Check } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useCustomersStore } from '@/store/customers.store'
import { useUiStore } from '@/store/ui.store'

// ─────────────────────────────────────────────────────────────────────────────
// Industry profiles — each preloads relevant sample data shape.

export interface IndustryProfile {
  id: string
  label: string
  description: string
  icon: string
  sampleCustomers: SampleCustomer[]
}

export interface SampleCustomer {
  name: string
  company?: string
  email?: string
  phone?: string
  city?: string
  status: 'aktiv' | 'lead' | 'inaktiv'
  priority: 'high' | 'normal' | 'low'
  industry?: string
  goals?: string[]
}

export const INDUSTRIES: IndustryProfile[] = [
  {
    id: 'consulting',
    label: 'Unternehmensberatung',
    description: 'Strategie · Transformation · Workshops',
    icon: '💼',
    sampleCustomers: [
      { name: 'Lukas Müller', company: 'Müller & Partner Holding AG', email: 'l.mueller@mueller-partner.de', phone: '+49 89 1234567', city: 'München', status: 'aktiv', priority: 'high', industry: 'Mittelstand', goals: ['Wachstum +25%', 'Digitale Transformation'] },
      { name: 'Sandra Bauer', company: 'Bauer Logistik GmbH', email: 's.bauer@bauer-logistik.de', city: 'Hamburg', status: 'aktiv', priority: 'high', industry: 'Logistik', goals: ['Prozess-Effizienz'] },
      { name: 'Dr. Hans Steiner', company: 'Steiner Pharma SE', email: 'h.steiner@steiner-pharma.de', city: 'Frankfurt', status: 'aktiv', priority: 'normal', industry: 'Pharma' },
      { name: 'Klara Hoffmann', company: 'Hoffmann Digital GmbH', email: 'klara@hoffmann-digital.com', city: 'Berlin', status: 'lead', priority: 'normal', industry: 'Digital Agency' },
    ],
  },
  {
    id: 'agency',
    label: 'Marketing-/Kreativagentur',
    description: 'Branding · Social Media · Content',
    icon: '🎨',
    sampleCustomers: [
      { name: 'Marc Becker', company: 'Becker Möbel GmbH', email: 'm.becker@becker-moebel.de', city: 'Stuttgart', status: 'aktiv', priority: 'high', industry: 'Einzelhandel', goals: ['Brand Refresh', 'Instagram Reichweite'] },
      { name: 'Julia Wagner', company: 'Wagner Fitness Studios', email: 'j.wagner@wagnerfit.de', city: 'Köln', status: 'aktiv', priority: 'normal', industry: 'Fitness', goals: ['10k Follower Q4'] },
      { name: 'Tobias Klein', company: 'Klein Architektur', email: 'tobias@klein-arch.de', city: 'Düsseldorf', status: 'lead', priority: 'normal', industry: 'Architektur' },
    ],
  },
  {
    id: 'freelance',
    label: 'Freelancer / Solo',
    description: 'Vielfältige Kundenmischung',
    icon: '🚀',
    sampleCustomers: [
      { name: 'Anna Schmidt', company: 'Schmidt & Co', email: 'a.schmidt@schmidt-co.de', city: 'Berlin', status: 'aktiv', priority: 'high' },
      { name: 'Peter Wagner', company: 'Wagner Solutions', email: 'p.wagner@wagner.de', city: 'Hamburg', status: 'aktiv', priority: 'normal' },
      { name: 'Sarah Krause', company: 'Krause GmbH', email: 'sarah@krause.de', city: 'München', status: 'lead', priority: 'normal' },
    ],
  },
  {
    id: 'it',
    label: 'IT-Dienstleister',
    description: 'Software · Retainer · Tech-Beratung',
    icon: '💻',
    sampleCustomers: [
      { name: 'Felix Schwarz', company: 'Schwarz Industries GmbH', email: 'f.schwarz@schwarz-ind.de', city: 'Stuttgart', status: 'aktiv', priority: 'high', industry: 'Maschinenbau', goals: ['ERP-Migration', 'Cloud-First'] },
      { name: 'Lara Hoffmann', company: 'Hoffmann Versicherung', email: 'l.hoffmann@hoffmann-ver.de', city: 'Frankfurt', status: 'aktiv', priority: 'normal', industry: 'Versicherung' },
      { name: 'Markus Lang', company: 'Lang Logistik', email: 'm.lang@lang-log.de', city: 'Hannover', status: 'lead', priority: 'normal' },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Storage flag — wizard runs once per machine.

const STORAGE_KEY = 'cynera:onboarding-completed-v1'

export function hasCompletedOnboarding(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}

export function markOnboardingComplete(): void {
  try { localStorage.setItem(STORAGE_KEY, '1') } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Step types

type Step = 'welcome' | 'industry' | 'data'

interface Props {
  onComplete: () => void
}

export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome')
  const [industry, setIndustry] = useState<IndustryProfile | null>(null)
  const [loading, setLoading] = useState(false)

  const upsertCustomer = useCustomersStore(s => s.upsert)
  const setSelected = useUiStore(s => s.setSelectedCustomer)

  const handleSampleLoad = async () => {
    if (!industry) return
    setLoading(true)
    try {
      for (const c of industry.sampleCustomers) {
        await upsertCustomer({
          name: c.name,
          company: c.company,
          email: c.email,
          phone: c.phone,
          city: c.city,
          status: c.status,
          priority: c.priority,
          industry: c.industry,
          goals: c.goals,
          tags: [],
        })
      }
      markOnboardingComplete()
      onComplete()
    } catch (e) {
      console.error('Failed to load sample data', e)
      setLoading(false)
    }
  }

  const handleSkip = () => {
    markOnboardingComplete()
    onComplete()
  }

  const handleFirstCustomer = () => {
    markOnboardingComplete()
    setSelected(null)
    onComplete()
    // After mounting, the Clients route shows the "Neuer Client" button.
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'oklch(0% 0 0 / 0.7)',
        backdropFilter: 'blur(20px) saturate(160%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.2, 0.7, 0.1, 1] }}
        style={{
          width: '100%', maxWidth: 620,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 22,
          boxShadow: 'var(--shadow-2)',
          overflow: 'hidden',
        }}
      >
        {/* Top brand strip */}
        <div style={{
          padding: '14px 22px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(180deg, oklch(100% 0 0 / 0.02), transparent)',
        }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--fg-dim)', fontWeight: 600,
          }}>
            Cynera Focus · Setup
          </span>
          <button
            onClick={handleSkip}
            style={{
              fontSize: 11.5, color: 'var(--fg-dim)', background: 'none',
              border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            Überspringen
          </button>
        </div>

        {/* Step indicator */}
        <StepBar step={step} />

        <AnimatePresence mode="wait">
          {step === 'welcome'  && (
            <WelcomeStep  key="welcome"  onNext={() => setStep('industry')} />
          )}
          {step === 'industry' && (
            <IndustryStep
              key="industry"
              selected={industry}
              onSelect={setIndustry}
              onNext={() => setStep('data')}
            />
          )}
          {step === 'data' && industry && (
            <DataStep
              key="data"
              industry={industry}
              loading={loading}
              onSample={handleSampleLoad}
              onManual={handleFirstCustomer}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step bar

const STEP_ORDER: Step[] = ['welcome', 'industry', 'data']
const STEP_LABELS: Record<Step, string> = {
  welcome:  'Willkommen',
  industry: 'Branche',
  data:     'Daten',
}

function StepBar({ step }: { step: Step }) {
  const currentIdx = STEP_ORDER.indexOf(step)
  return (
    <div style={{
      display: 'flex', gap: 8, padding: '14px 22px',
      borderBottom: '1px solid var(--border)',
    }}>
      {STEP_ORDER.map((s, i) => {
        const isActive = i === currentIdx
        const isDone   = i < currentIdx
        return (
          <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              height: 3, borderRadius: 99,
              background: isDone || isActive ? 'var(--accent)' : 'oklch(50% 0 0 / 0.1)',
              transition: 'background 220ms ease',
            }} />
            <span style={{
              fontSize: 10.5, fontFamily: 'var(--font-mono)',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              color: isActive ? 'var(--fg)' : 'var(--fg-dim)',
              fontWeight: isActive ? 700 : 500,
            }}>
              {STEP_LABELS[s]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Step components

const stepAnim = {
  initial: { opacity: 0, x: 8 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: -8 },
  transition: { duration: 0.22, ease: [0.2, 0.7, 0.1, 1] as const },
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <motion.div {...stepAnim} style={{ padding: '36px 32px' }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, marginBottom: 24,
        background: 'var(--accent-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Sparkles size={28} style={{ color: 'var(--accent)' }} />
      </div>

      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 32, fontWeight: 600,
        letterSpacing: '-0.03em', lineHeight: 1.15,
        margin: '0 0 14px',
        color: 'var(--fg)',
      }}>
        Willkommen bei Cynera.
      </h2>

      <p style={{ fontSize: 14.5, color: 'var(--fg-2)', lineHeight: 1.6, margin: '0 0 28px', maxWidth: 480 }}>
        In den nächsten 60 Sekunden machen wir die App passend für dich. Du wählst deine Branche, wir laden ein paar Beispiel-Daten oder du legst direkt los — wie du magst.
      </p>

      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32,
      }}>
        <Feature icon={Briefcase} text="Kunden, Pipeline, Rechnungen — alles an einem Ort" />
        <Feature icon={Sparkles}  text="KI-Briefings vor jedem Call — 30 Sekunden Vorbereitung" />
        <Feature icon={Users}     text="Lokal auf deinem Mac, nichts geht über Server" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onNext}
          className="btn-primary"
          style={{ padding: '11px 22px', fontSize: 13.5 }}
        >
          Los geht's <ArrowRight size={14} />
        </button>
      </div>
    </motion.div>
  )
}

function Feature({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: 'oklch(50% 0 0 / 0.06)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={13} style={{ color: 'var(--fg-muted)' }} />
      </div>
      <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>{text}</span>
    </div>
  )
}

function IndustryStep({ selected, onSelect, onNext }: {
  selected: IndustryProfile | null
  onSelect: (p: IndustryProfile) => void
  onNext: () => void
}) {
  return (
    <motion.div {...stepAnim} style={{ padding: '28px 32px' }}>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 22, fontWeight: 600,
        letterSpacing: '-0.02em', lineHeight: 1.2,
        margin: '0 0 8px',
      }}>
        Was machst du beruflich?
      </h2>
      <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 22px' }}>
        Wir laden passende Beispiel-Daten und Templates für deine Branche.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 10,
        marginBottom: 24,
      }}>
        {INDUSTRIES.map(ind => {
          const isSelected = selected?.id === ind.id
          return (
            <button
              key={ind.id}
              onClick={() => onSelect(ind)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '14px 16px',
                borderRadius: 14,
                background: isSelected ? 'var(--accent-soft)' : 'var(--surface-2)',
                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 180ms ease',
              }}
            >
              <span style={{ fontSize: 24, flexShrink: 0 }}>{ind.icon}</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>
                  {ind.label}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
                  {ind.description}
                </span>
              </div>
              {isSelected && (
                <Check size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              )}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={onNext}
          disabled={!selected}
          style={{
            padding: '11px 22px', borderRadius: 99,
            background: selected ? 'var(--accent)' : 'oklch(50% 0 0 / 0.1)',
            color: selected ? 'var(--accent-ink)' : 'var(--fg-dim)',
            fontSize: 13.5, fontWeight: 600,
            cursor: selected ? 'pointer' : 'not-allowed',
            border: 'none',
            boxShadow: selected ? '0 6px 20px -8px var(--accent-glow)' : 'none',
            transition: 'all 150ms',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          Weiter <ArrowRight size={14} />
        </button>
      </div>
    </motion.div>
  )
}

function DataStep({ industry, loading, onSample, onManual }: {
  industry: IndustryProfile
  loading: boolean
  onSample: () => void
  onManual: () => void
}) {
  return (
    <motion.div {...stepAnim} style={{ padding: '28px 32px' }}>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontSize: 22, fontWeight: 600,
        letterSpacing: '-0.02em', lineHeight: 1.2,
        margin: '0 0 8px',
      }}>
        Wie möchtest du starten?
      </h2>
      <p style={{ fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 22px' }}>
        Du kannst direkt loslegen — oder dir Beispiel-Daten laden um die App auszuprobieren.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        <StartOption
          icon={Sparkles}
          title="Mit Beispiel-Daten starten (empfohlen)"
          description={`${industry.sampleCustomers.length} Demo-Kunden aus „${industry.label}" werden angelegt. Du kannst sie jederzeit löschen.`}
          accent
          onClick={onSample}
          loading={loading}
        />
        <StartOption
          icon={UserPlus}
          title="Direkt mit eigenem Kunden starten"
          description="Leere App. Du legst deinen ersten echten Kunden manuell an."
          onClick={onManual}
          loading={loading}
        />
      </div>
    </motion.div>
  )
}

function StartOption({
  icon: Icon, title, description, accent, loading, onClick,
}: {
  icon: LucideIcon
  title: string
  description: string
  accent?: boolean
  loading?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14,
        padding: '16px 18px',
        borderRadius: 14,
        background: accent ? 'var(--accent-soft)' : 'var(--surface-2)',
        border: `1px solid ${accent ? 'var(--accent)' : 'var(--border)'}`,
        cursor: loading ? 'wait' : 'pointer',
        textAlign: 'left',
        boxShadow: accent ? '0 6px 20px -10px var(--accent-glow)' : 'none',
        transition: 'all 180ms ease',
        opacity: loading ? 0.6 : 1,
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: accent ? 'var(--accent)' : 'oklch(50% 0 0 / 0.08)',
        color: accent ? 'var(--accent-ink)' : 'var(--fg-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: 2,
      }}>
        <Icon size={17} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', letterSpacing: '-0.005em' }}>
          {title}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
          {description}
        </span>
      </div>
      <ArrowRight size={14} style={{ color: 'var(--fg-muted)', flexShrink: 0, marginTop: 12 }} />
    </button>
  )
}
