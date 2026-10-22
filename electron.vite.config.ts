import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const STRICT_CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'"
const DEV_CSP =
  "default-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'"

/**
 * Vite injects an inline module script in dev (the React Fast Refresh preamble), which the strict
 * production CSP blocks. Relax the policy for the dev server only; the packaged build keeps the
 * meta tag written in src/renderer/index.html.
 */
function relaxCspInDev(): Plugin {
  return {
    name: 'deriva-relax-csp-in-dev',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace(STRICT_CSP, DEV_CSP)
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'tiling-worker': resolve('src/main/tiling/worker.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), relaxCspInDev()]
  }
})
