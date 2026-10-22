import { defineConfig } from 'vitest/config'

// Sandbox-only adaptation: on a normal machine the worker inherits nothing and
// Node resolves pnpm links natively. Inside the DSH Windows file sandbox the
// parent process registers CJS/ESM resolution bridges for pnpm junction mounts;
// forwarding the parent's Node flags lets worker threads reuse them.
const sandboxWorkerArgs = process.env.DSH_TEST_SANDBOX === '1'
  ? { execArgv: process.execArgv }
  : {}

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    // The reviewer tests drive several frameworks in-process. Threads keep the
    // suite hermetic and avoid spawning worker processes for every file.
    pool: 'threads',
    ...sandboxWorkerArgs,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
