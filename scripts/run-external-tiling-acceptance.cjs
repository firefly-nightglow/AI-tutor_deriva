const { spawnSync } = require('node:child_process')
const { existsSync, mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const electron = require('electron')
const runs = Number(
  process.argv.find((argument) => argument.startsWith('--runs='))?.slice(7) ?? 1
)
if (!Number.isInteger(runs) || runs < 1 || runs > 5) {
  throw new Error('--runs must be between 1 and 5')
}

const bundle = resolve('out/main/external-tiling-app-smoke.cjs')
if (!existsSync(bundle)) {
  throw new Error('Missing external tiling smoke bundle; run npm run smoke:tiling first')
}

const root = resolve('node_modules/.cache/deriva-external-tiling-acceptance')
mkdirSync(root, { recursive: true })
const results = []

for (let run = 1; run <= runs; run++) {
  const started = Date.now()
  const child = spawnSync(electron, [bundle], {
    encoding: 'utf8',
    timeout: 60000,
    windowsHide: false
  })
  const output = (child.stdout || '') + (child.stderr || '')
  const pass = child.status === 0 && (child.stdout || '').includes('PASS')
  const result = {
    run,
    exitCode: child.status,
    pass,
    elapsedMs: Date.now() - started
  }
  results.push(result)
  writeFileSync(join(root, `${run}.log`), output)
  writeFileSync(join(root, 'results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(result))
  if (!pass) {
    console.error(output || child.error?.message || 'No completion marker')
    process.exit(1)
  }
}
