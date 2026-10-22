const { spawnSync } = require('node:child_process')
const { existsSync, mkdirSync, writeFileSync } = require('node:fs')
const { resolve, join } = require('node:path')

const electron = require('electron')
const runs = Number(process.argv.find((arg) => arg.startsWith('--runs='))?.slice(7) ?? 1)
if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error('--runs must be between 1 and 10')
const steps = [
  ['exercise', 'floating-split-smoke.cjs', '--phase=exercise'],
  ['restore', 'floating-split-smoke.cjs', '--phase=restore'],
  ['invalid', 'floating-split-smoke.cjs', '--phase=invalid'],
  ['material', 'material-app-smoke.cjs']
]
for (const [, bundle] of steps) {
  if (!existsSync(join('out/main', bundle))) throw new Error(`Missing ${bundle}; build the app, then bundle both smoke scripts as documented in v2-floating-split-walkthrough.md`)
}
const root = resolve('node_modules/.cache/deriva-window-acceptance')
mkdirSync(root, { recursive: true })
const results = []
for (let run = 1; run <= runs; run++) {
  for (const [phase, bundle, ...args] of steps) {
    const start = Date.now()
    // These are GUI tests; hiding their startup window changes the behavior under test.
    const child = spawnSync(electron, [join('out/main', bundle), ...args], {
      encoding: 'utf8', timeout: 60000, windowsHide: false
    })
    const output = (child.stdout || '') + (child.stderr || '')
    const pass = child.status === 0 && (child.stdout || '').includes('PASS')
    const result = { run, phase, exitCode: child.status, pass, ms: Date.now() - start }
    results.push(result)
    writeFileSync(join(root, `${run}-${phase}.log`), output)
    writeFileSync(join(root, 'results.json'), JSON.stringify(results, null, 2))
    console.log(JSON.stringify(result))
    if (!pass) {
      console.error(output || child.error?.message || 'No completion marker')
      process.exit(1)
    }
  }
}
