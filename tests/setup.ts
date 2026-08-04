import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:test-frame'
  URL.revokeObjectURL = () => undefined
}

if (typeof requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 16) as unknown as number
  globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle)
}
