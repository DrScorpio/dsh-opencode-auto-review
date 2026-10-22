/**
 * Composition contract for the published DSH bundle.
 *
 * These assertions are offline and artifact-oriented: they read the two files
 * that make this package installable — `package.json` (the bundle manifest) and
 * `cordis.patch.yml` (the composition layer that a profile applies when this
 * package is listed in its `dsh.profile.bundles`) — and prove the layer shape
 * required by DEVELOPMENT.md sections 4.1, 4.2 and 5:
 *
 * 1. the official `auto-review` row is disabled by matching both its id and its
 *    plugin name (`patch` validates `name` against the row it overrides);
 * 2. exactly one row is inserted, with a distinct id, naming this package;
 * 3. after the layer is applied there is exactly one active Auto review
 *    provider, and it is this package;
 * 4. the published manifest points the host at the prebuilt `lib/` output,
 *    whitelists only publishable files, and declares the exact target DSH
 *    version.
 *
 * No YAML parser is a declared dependency of this project, so the small patch
 * file is parsed by the narrow block-YAML subset parser below (block maps,
 * block sequences, quoted/plain scalars, booleans) rather than adding one.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const patchFile = join(repoRoot, 'cordis.patch.yml')
const manifestFile = join(repoRoot, 'package.json')

const OFFICIAL_PLUGIN = '@deepseek-ai/dsh-experimental-auto-review'
const OFFICIAL_ROW_ID = 'auto-review'
const REPLACEMENT_PLUGIN = 'dsh-opencode-auto-review'
const REPLACEMENT_ROW_ID = 'auto-review-opencode'

// ---------------------------------------------------------------------------
// Narrow block-YAML subset parser (no dependency).
// ---------------------------------------------------------------------------

type YamlScalar = string | number | boolean | null
type YamlValue = YamlScalar | YamlValue[] | { [key: string]: YamlValue }
interface YamlMap {
  [key: string]: YamlValue
}

interface YamlLine {
  readonly indent: number
  readonly text: string
}

function isYamlMap(value: YamlValue | undefined): value is YamlMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function tokenizeYaml(source: string): YamlLine[] {
  const lines: YamlLine[] = []
  for (const raw of source.split(/\r?\n/)) {
    const leading = /^[ \t]*/.exec(raw)?.[0] ?? ''
    if (leading.includes('\t')) throw new Error('tab indentation is not supported by this parser')
    const text = raw.trim()
    if (text === '' || text.startsWith('#')) continue
    lines.push({ indent: leading.length, text })
  }
  return lines
}

/** Splits `key: value` at the first top-level colon, respecting quoted scalars. */
function splitKeyValue(text: string): { key: string; valueText: string } | undefined {
  let quote: "'" | '"' | undefined
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote !== undefined) {
      if (char === quote) quote = undefined
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char === ':' && (index + 1 === text.length || text[index + 1] === ' ')) {
      return { key: text.slice(0, index).trim(), valueText: text.slice(index + 1).trim() }
    }
  }
  return undefined
}

function parseYamlScalar(text: string): YamlScalar {
  if (text.startsWith("'")) {
    if (text.length < 2 || !text.endsWith("'")) throw new Error(`unterminated single-quoted scalar: ${text}`)
    return text.slice(1, -1).replaceAll("''", "'")
  }
  if (text.startsWith('"')) {
    if (!text.endsWith('"')) throw new Error(`unterminated double-quoted scalar: ${text}`)
    return JSON.parse(text) as string
  }
  if (text === 'true') return true
  if (text === 'false') return false
  if (text === 'null' || text === '~') return null
  if (/^-?\d+$/.test(text)) return Number(text)
  return text
}

/** Parses the block-YAML subset used by `cordis.patch.yml` files. */
function parseYaml(source: string): YamlValue {
  const lines = tokenizeYaml(source)
  if (lines.length === 0) throw new Error('empty YAML document')
  let cursor = 0

  function parseBlock(indent: number): YamlValue {
    const line = lines[cursor]
    if (line === undefined) throw new Error('unexpected end of YAML document')
    if (line.indent !== indent) {
      throw new Error(`expected indentation ${indent}, found ${line.indent} at "${line.text}"`)
    }
    return line.text.startsWith('- ') ? parseSequence(indent) : parseMapping(indent)
  }

  function parseSequence(indent: number): YamlValue[] {
    const items: YamlValue[] = []
    for (;;) {
      const line = lines[cursor]
      if (line === undefined || line.indent < indent) return items
      if (line.indent > indent) throw new Error(`unexpected indentation at "${line.text}"`)
      if (!line.text.startsWith('- ')) return items
      const rest = line.text.slice(2)
      cursor += 1
      const pair = splitKeyValue(rest)
      if (pair === undefined) {
        items.push(parseYamlScalar(rest))
      } else {
        // A block sequence item may open a mapping inline (`- id: x`); the
        // mapping's own keys then continue at the column after the dash.
        items.push(parseMapping(indent + 2, pair))
      }
    }
  }

  function parseMapping(indent: number, seed?: { key: string; valueText: string }): YamlMap {
    const map: YamlMap = {}
    const assign = (key: string, valueText: string): void => {
      if (key === '') throw new Error('empty mapping key')
      if (Object.hasOwn(map, key)) throw new Error(`duplicate mapping key "${key}"`)
      if (valueText !== '') {
        map[key] = parseYamlScalar(valueText)
        return
      }
      const next = lines[cursor]
      if (next !== undefined && next.indent > indent) {
        map[key] = parseBlock(next.indent)
      } else {
        map[key] = null
      }
    }
    if (seed !== undefined) assign(seed.key, seed.valueText)
    for (;;) {
      const line = lines[cursor]
      if (line === undefined || line.indent < indent) return map
      if (line.indent > indent) throw new Error(`unexpected indentation at "${line.text}"`)
      if (line.text.startsWith('- ')) return map
      const pair = splitKeyValue(line.text)
      if (pair === undefined) throw new Error(`expected "key: value", found "${line.text}"`)
      cursor += 1
      assign(pair.key, pair.valueText)
    }
  }

  const document = parseBlock(lines[0]!.indent)
  if (cursor !== lines.length) throw new Error(`trailing YAML content at "${lines[cursor]!.text}"`)
  return document
}

// ---------------------------------------------------------------------------
// Composition projection.
// ---------------------------------------------------------------------------

interface CompositionRow {
  readonly id: string
  readonly name: string | undefined
  readonly active: boolean
  readonly source: 'override' | 'insert'
}

/**
 * Projects a patch document into the rows it contributes to the final
 * composition. A top-level entry is either a row override (targeted by `id`)
 * or an `insert` block holding new rows.
 */
function extractCompositionRows(entries: YamlValue[]): CompositionRow[] {
  const rows: CompositionRow[] = []
  for (const entry of entries) {
    if (!isYamlMap(entry)) throw new Error('each patch entry must be a mapping')
    const inserted = entry.insert
    if (inserted !== undefined) {
      if (!Array.isArray(inserted)) throw new Error('`insert` must be a sequence of rows')
      const extraKeys = Object.keys(entry).filter((key) => key !== 'insert')
      if (extraKeys.length > 0) throw new Error(`insert entry carries unexpected keys: ${extraKeys.join(', ')}`)
      for (const insertedRow of inserted) {
        if (!isYamlMap(insertedRow)) throw new Error('each inserted row must be a mapping')
        if (typeof insertedRow.id !== 'string') throw new Error('each inserted row must have a string `id`')
        rows.push({
          id: insertedRow.id,
          name: typeof insertedRow.name === 'string' ? insertedRow.name : undefined,
          active: insertedRow.disabled !== true,
          source: 'insert',
        })
      }
      continue
    }
    if (typeof entry.id !== 'string') throw new Error('each patch entry must have a string `id` or an `insert` block')
    rows.push({
      id: entry.id,
      name: typeof entry.name === 'string' ? entry.name : undefined,
      active: entry.disabled !== true,
      source: 'override',
    })
  }
  return rows
}

/** Collects every string value stored under `key`, at any depth. */
function collectStringValues(value: YamlValue, key: string, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, key, found)
    return found
  }
  if (!isYamlMap(value)) return found
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey === key && typeof entryValue === 'string') found.push(entryValue)
    else collectStringValues(entryValue, key, found)
  }
  return found
}

function sortedKeys(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return []
  return Object.keys(value).sort()
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe('cordis.patch.yml — official row override', () => {
  const document = parseYaml(readFileSync(patchFile, 'utf8'))
  const entries = Array.isArray(document) ? document : []

  it('is a non-empty sequence of patch entries', () => {
    expect(Array.isArray(document)).toBe(true)
    expect(entries.length).toBeGreaterThan(0)
  })

  it('targets the official auto-review row by id and validates its plugin name', () => {
    const officialEntries = entries.filter((entry) => isYamlMap(entry) && entry.id === OFFICIAL_ROW_ID)
    expect(officialEntries).toHaveLength(1)
    const official = officialEntries[0] as YamlMap
    expect(official.id).toBe(OFFICIAL_ROW_ID)
    expect(official.name).toBe(OFFICIAL_PLUGIN)
    expect(official.disabled).toBe(true)
    // The override must stay minimal: a layer replaces the whole config value.
    expect(sortedKeys(official)).toEqual(['disabled', 'id', 'name'])
  })

  it('does not rename or reconfigure the official row in any other way', () => {
    for (const entry of entries) {
      if (!isYamlMap(entry)) continue
      if (entry.id !== OFFICIAL_ROW_ID) continue
      expect(entry).not.toHaveProperty('insert')
      expect(entry).not.toHaveProperty('config')
      expect(entry).not.toHaveProperty('inject')
      expect(entry.disabled).toBe(true)
    }
  })
})

describe('cordis.patch.yml — inserted replacement row', () => {
  const document = parseYaml(readFileSync(patchFile, 'utf8'))
  const entries = Array.isArray(document) ? document : []

  it('has exactly one insert block', () => {
    const insertEntries = entries.filter((entry) => isYamlMap(entry) && Object.hasOwn(entry, 'insert'))
    expect(insertEntries).toHaveLength(1)
    const insertEntry = insertEntries[0] as YamlMap
    expect(sortedKeys(insertEntry)).toEqual(['insert'])
    expect(Array.isArray(insertEntry.insert)).toBe(true)
  })

  it('inserts exactly one row naming this package with a distinct row id', () => {
    const rows = extractCompositionRows(entries)
    const inserted = rows.filter((row) => row.source === 'insert')
    expect(inserted).toHaveLength(1)
    const replacement = inserted[0]!
    expect(replacement.id).toBe(REPLACEMENT_ROW_ID)
    expect(replacement.name).toBe(REPLACEMENT_PLUGIN)
    expect(replacement.active).toBe(true)
    expect(replacement.id).not.toBe(OFFICIAL_ROW_ID)

    const insertBlocks = entries.filter((entry) => isYamlMap(entry) && Object.hasOwn(entry, 'insert'))
    const insertedRow = ((insertBlocks[0] as YamlMap).insert as YamlValue[])[0]
    expect(sortedKeys(insertedRow)).toEqual(['id', 'name'])
  })
})

describe('cordis.patch.yml — effective composition', () => {
  const document = parseYaml(readFileSync(patchFile, 'utf8'))
  const entries = Array.isArray(document) ? document : []
  const rows = extractCompositionRows(entries)

  it('contributes exactly two rows: the disabled official row and our active row', () => {
    expect(rows).toHaveLength(2)
    const official = rows.find((row) => row.id === OFFICIAL_ROW_ID)
    const replacement = rows.find((row) => row.id === REPLACEMENT_ROW_ID)
    expect(official).toBeDefined()
    expect(replacement).toBeDefined()
    expect(official!.source).toBe('override')
    expect(official!.name).toBe(OFFICIAL_PLUGIN)
    expect(official!.active).toBe(false)
    expect(replacement!.source).toBe('insert')
    expect(replacement!.name).toBe(REPLACEMENT_PLUGIN)
    expect(replacement!.active).toBe(true)
  })

  it('leaves exactly one active Auto review provider: this package', () => {
    const active = rows.filter((row) => row.active)
    expect(active).toHaveLength(1)
    expect(active[0]!.name).toBe(REPLACEMENT_PLUGIN)
    expect(active[0]!.id).toBe(REPLACEMENT_ROW_ID)
  })

  it('references each plugin name exactly once in the whole document', () => {
    const names = collectStringValues(document, 'name')
    expect(names.filter((name) => name === OFFICIAL_PLUGIN)).toHaveLength(1)
    expect(names.filter((name) => name === REPLACEMENT_PLUGIN)).toHaveLength(1)
    // The single official reference is the row being disabled, never an insert.
    expect(names.filter((name) => name === OFFICIAL_PLUGIN)[0]).toBe(OFFICIAL_PLUGIN)
    // No other Auto review provider is inserted or re-enabled by this layer.
    const providerNames = names.filter((name) => name === OFFICIAL_PLUGIN || name === REPLACEMENT_PLUGIN)
    expect(providerNames).toHaveLength(2)
  })
})

describe('package.json — published bundle manifest', () => {
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as {
    name?: unknown
    version?: unknown
    type?: unknown
    main?: unknown
    types?: unknown
    exports?: Record<string, Record<string, string> | string>
    files?: unknown
    engines?: Record<string, unknown>
    dsh?: { bundle?: { patch?: unknown } }
  }

  it('is the standalone ESM package this project publishes', () => {
    expect(manifest.name).toBe(REPLACEMENT_PLUGIN)
    expect(manifest.version).toBe('0.1.0')
    expect(manifest.type).toBe('module')
  })

  it('points the host at the prebuilt lib output', () => {
    expect(manifest.main).toBe('./lib/index.js')
    expect(manifest.types).toBe('./lib/index.d.ts')
    expect(manifest.exports?.['.']).toEqual({
      types: './lib/index.d.ts',
      default: './lib/index.js',
    })
    expect(manifest.exports?.['./package.json']).toBe('./package.json')
    expect(manifest.exports?.['./cordis.patch.yml']).toBe('./cordis.patch.yml')
  })

  it('whitelists exactly the publishable artifacts', () => {
    expect(Array.isArray(manifest.files)).toBe(true)
    const files = manifest.files as string[]
    for (const required of ['lib', 'cordis.patch.yml', 'README.md', 'README.zh.md', 'UPSTREAM.md', 'LICENSE']) {
      expect(files).toContain(required)
    }
    for (const forbidden of [
      'src',
      'tests',
      'node_modules',
      '.upstream',
      '.verify',
      '.tools',
      '.npm-cache',
      'DEVELOPMENT.md',
      'pnpm-lock.yaml',
      'tsconfig.json',
      'tsdown.config.ts',
      'vitest.config.ts',
    ]) {
      expect(files).not.toContain(forbidden)
    }
    expect(files.some((file) => file.startsWith('src/') || file.startsWith('tests/'))).toBe(false)
  })

  it('requires exactly the target DSH release', () => {
    expect(manifest.engines?.dsh).toBe('0.2.1-rc.2')
  })

  it('declares a bundle patch that exists on disk', () => {
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    const declared = manifest.dsh?.bundle?.patch
    expect(typeof declared).toBe('string')
    const resolved = resolve(repoRoot, declared as string)
    expect(resolved).toBe(patchFile)
    expect(existsSync(resolved)).toBe(true)
  })
})
