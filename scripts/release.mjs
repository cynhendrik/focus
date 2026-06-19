// Release-Helfer für Cultera Focus.
//
// Setzt die Version synchron in allen Manifesten, committet, taggt und pusht —
// danach musst du auf GitHub nur noch das Entwurfs-Release "Publish"-en.
//
// Benutzung (im Projektordner):
//   npm run release 1.0.1            → Version setzen, committen, taggen, pushen
//   npm run release 1.0.1 -- --no-push   → alles außer pushen (zum Vorab-Prüfen)
//   npm run release 0.9.0 -- --force     → Downgrade erzwingen (normalerweise blockiert)
//
// Hinweis: Flags brauchen das "--" davor (so reicht npm sie an das Skript durch).

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const next = args.find((a) => !a.startsWith('--'))

const die = (msg) => { console.error(`\n✖ ${msg}\n`); process.exit(1) }
const ok = (msg) => console.log(`✓ ${msg}`)
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim()

// 1. Version validieren ------------------------------------------------------
if (!next) die('Keine Version angegeben. Beispiel: npm run release 1.0.1')
if (!/^\d+\.\d+\.\d+$/.test(next)) die(`Ungültige Version "${next}". Erwartet: X.Y.Z (z. B. 1.0.1)`)

// 2. Aktuelle Version lesen + vergleichen ------------------------------------
const current = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
const cmp = (a, b) => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}
if (next === current) die(`Version ist bereits ${current}.`)
if (cmp(next, current) < 0 && !flags.has('--force')) {
  die(`Downgrade ${current} → ${next}: Der Auto-Updater bietet NIE eine niedrigere Version an.\n` +
      `  Wenn du das wirklich willst:  npm run release ${next} -- --force`)
}

// 3. Tag-Kollision prüfen ----------------------------------------------------
const tag = `v${next}`
if (git('tag', '--list', tag)) die(`Tag ${tag} existiert bereits. Wähle eine andere Version.`)

// 4. Version in allen Manifesten ersetzen ------------------------------------
const manifests = ['package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock']

const replaceIn = (rel, pattern, repl) => {
  const p = join(ROOT, rel)
  const before = readFileSync(p, 'utf8')
  const after = before.replace(pattern, repl)
  if (after === before) die(`Konnte die Version in ${rel} nicht finden/ersetzen.`)
  writeFileSync(p, after)
}

// JSON: die erste "version": "…" (das ist die Top-Level-Version)
replaceIn('package.json', /"version":\s*"[^"]*"/, `"version": "${next}"`)
replaceIn('src-tauri/tauri.conf.json', /"version":\s*"[^"]*"/, `"version": "${next}"`)
// TOML/Lock: genau den focus-Paketeintrag (name = "focus"  +  version = "…")
const cargoPat = /(name = "focus"\r?\nversion = ")[^"]*"/
replaceIn('src-tauri/Cargo.toml', cargoPat, `$1${next}"`)
replaceIn('src-tauri/Cargo.lock', cargoPat, `$1${next}"`)
ok(`Version ${current} → ${next} in allen Manifesten gesetzt`)

// 5. NUR die Manifeste committen (deine sonstigen WIP-Änderungen bleiben unberührt)
git('add', ...manifests)
git('commit', '-m', `release ${tag}`)
ok(`Commit "release ${tag}" erstellt`)

// 6. Tag setzen --------------------------------------------------------------
git('tag', tag)
ok(`Tag ${tag} gesetzt`)

// 7. Pushen (außer --no-push) ------------------------------------------------
if (flags.has('--no-push')) {
  console.log(`\n⏸  --no-push: Commit + Tag liegen nur lokal. Zum Ausliefern später:\n` +
              `   git push && git push origin ${tag}\n`)
  process.exit(0)
}
const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
git('push', 'origin', branch)
git('push', 'origin', tag)
ok(`Gepusht (Branch ${branch} + Tag ${tag}) — die CI baut jetzt`)

console.log(`\n🚀  Fast fertig! Es fehlt nur noch der manuelle Klick:\n` +
            `   1. GitHub → Actions: warten bis der Build grün ist (~10 Min)\n` +
            `   2. GitHub → Releases: Entwurf "Cultera Focus ${tag}" öffnen → "Publish release"\n` +
            `   → Danach sehen die Kunden den Update-Banner.\n`)
