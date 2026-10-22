import { app } from 'electron'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createExternalTilingService } from '../src/main/tiling/service'

async function run(): Promise<void> {
  const profile = mkdtempSync(join(tmpdir(), 'deriva-packaged-tiling-worker-'))
  app.setPath('userData', profile)
  let service: ReturnType<typeof createExternalTilingService> | null = null
  try {
    await app.whenReady()
    service = createExternalTilingService({
      workerPath: resolve(
        'dist/win-unpacked/resources/app.asar/out/main/tiling-worker.js'
      ),
      stateFilePath: join(profile, 'external-tiling.json')
    })
    const windows = await service.listWindows()
    console.log(`PASS packaged tiling worker enumerated ${windows.length} windows`)
    await service.dispose()
    service = null
  } finally {
    service?.disposeNow()
    rmSync(profile, { recursive: true, force: true })
  }
}

run()
  .then(() => app.quit())
  .catch((cause) => {
    console.error('FAIL packaged tiling worker', cause)
    app.exit(1)
  })
