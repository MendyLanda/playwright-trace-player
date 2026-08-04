import { readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const packageWorker = resolve(projectRoot, 'dist/trace-worker.js')
const packageWorkerSize = (await stat(packageWorker)).size
if (packageWorkerSize < 1_000) {
  throw new Error('The package trace worker is missing or empty.')
}

const demoAssets = await readdir(resolve(projectRoot, 'demo-dist/assets'))
const demoWorkers = demoAssets.filter((name) => /^trace-worker-.+\.js$/.test(name))
if (demoWorkers.length !== 1) {
  throw new Error(`Expected one demo trace worker asset, found ${demoWorkers.length}.`)
}

console.log(`Worker assets ready: dist/trace-worker.js and ${demoWorkers[0]}`)
