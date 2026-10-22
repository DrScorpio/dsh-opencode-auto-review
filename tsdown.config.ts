import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: true,
  clean: true,
  deps: {
    // Every DeepSeek Harness package is supplied by the host runtime: peers are
    // shared instances, and the one runtime dependency is resolved at install
    // time beside this package. Never inline a private Cordis or service copy.
    neverBundle: [/^@deepseek-ai\//],
  },
})
