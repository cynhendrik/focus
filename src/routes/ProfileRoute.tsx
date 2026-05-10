export function ProfileRoute() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-6 pb-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-semibold text-[var(--text)]">Profil</h1>
        <p className="text-xs text-[var(--text2)] mt-1">Dein Privatbereich</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <span className="text-3xl font-bold text-primary">P</span>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-[var(--text)]">Cynera User</p>
          <p className="text-sm text-[var(--text2)] mt-0.5">Privatbereich — demnächst verfügbar</p>
        </div>
      </div>
    </div>
  )
}
