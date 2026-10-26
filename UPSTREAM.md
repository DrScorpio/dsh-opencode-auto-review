# Upstream provenance

This package is a deliberate, minimal derivation of the official DeepSeek Harness
Auto review plugin. It exists because the official `0.2.1-rc.2` reviewer request
does not carry a session identity, so the pi-ai OpenCode providers cannot emit
`x-opencode-session` and the OpenCode gateway rejects the review with
`MissingSessionID`.

## Fixed baseline

| Item | Value |
| --- | --- |
| Upstream repository | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) |
| Tag | `dsh-v0.2.1-rc.2` |
| Commit | `687f282e8625c6b8d11ff58211a90524be2e4317` |
| Upstream package | `@deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.2` |
| Adapter under test | `@deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.2` |
| pi-ai under test | `@earendil-works/pi-ai@1.1.0` |
| Cordis baseline | `@deepseek-ai/cordis@4.0.5` |
| Derived package | `dsh-opencode-auto-review@0.1.2` |

An older local DSH source working tree is **not** a source for this project; all files
below were read from the tagged commit above.

Supported runtime window: this package runs on DSH `0.2.1-rc.1`, `0.2.1-rc.2` and
`0.2.1-rc.3`. Those three releases are one API generation — every `@deepseek-ai/*`
package except its `package.json` `version` text is byte-identical — so the derived
sources and the consistency checks below hold for all of them. The upstream baseline
above remains the `0.2.1-rc.2` tag used for derivation.

The rc.3 parity check compared the running desktop runtime directly: every package
this plugin imports, plus the official `@deepseek-ai/dsh-experimental-auto-review`
bundle, was extracted from `app.asar` at `0.2.1-rc.3` and diffed against the
`0.2.1-rc.2` npm packages in `node_modules`. Every compiled `lib/index.js` and
`lib/types/*.js` file is byte-identical; the official bundle's `lib/index.js` and
`cordis.patch.yml` are byte-identical too; only `package.json` `version` text (and
the matching dependency/peer ranges) differs. Upstream tag `dsh-v0.2.1-rc.3`
(merge commit `1f81c047fc48fa190a683e469daa699857e9afe8`) is six commits after the
rc.2 tag, none of which touch `packages/experimental/auto-review`.

## Derived files

| This package | Upstream path (commit `687f282`) | Upstream SHA-256 |
| --- | --- | --- |
| `src/index.ts` | `packages/experimental/auto-review/src/index.ts` | `1b0ebf6539f2f412c012eadf8049d19f711267040423d7800b3c4f06809413a7` |
| `tests/auto-review.spec.ts` | `packages/experimental/auto-review/tests/auto-review.spec.ts` | `ced393578024400ba08de15332e139d6c9abad01578df18eb660683ba9adb82e` |
| `tests/fixtures/external-activation-helpers.ts` | `packages/subagent/subagent/tests/external-activation-helpers.ts` | `9411ac2eb4e82d86f4970058660bd55b0a11d1f0da3fedce1200967d0089caef` |

`src/index.ts` differs from upstream in exactly three places:

1. A provenance header comment was added.
2. The `@module` annotation names this package.
3. `classifyRisk()` freezes `sessionId: agent.session.id` into the reviewer
   request, next to the existing `temperature: 0` and `signal`.

There are no other behavioral changes. Review policy text, five-section input
assembly, risk parsing, approval-priority handling, PTC handling, cancellation,
and disposal order are byte-identical to upstream.

`tests/auto-review.spec.ts` differs from upstream in exactly these port changes:

1. The module under test is `../src/index.ts` instead of the official package.
2. The repo-local fixture import resolves to `./fixtures/external-activation-helpers.ts`.
3. The bug-baseline assertion `expect(request).not.toHaveProperty('sessionId')`
   became `expect(request.sessionId).toBe(agent.session.id)`.
4. A provenance header comment was added.

Every other test assertion is unchanged.

`tests/fixtures/external-activation-helpers.ts` only replaced the private
in-repo type import (`../src/types.ts`) with the package's public export
(`@deepseek-ai/dsh-subagent`); the fixture behavior is unchanged.

## Upstream license

DeepSeek Harness is MIT licensed:

```text
MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Re-deriving and checking parity

```powershell
# Read the exact upstream files without touching the old working tree:
git -C <dsh-repo> show 687f282e8625c6b8d11ff58211a90524be2e4317:packages/experimental/auto-review/src/index.ts

# Compare the derived source with upstream: only the provenance header, the
# @module line, and the single sessionId line may differ.
git diff --no-index <upstream-index.ts> src/index.ts
```

When upstream ships an official fix, re-verify session-ID propagation against
the new target release and remove this package; see the README removal section.
