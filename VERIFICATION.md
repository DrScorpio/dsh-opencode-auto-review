# Verification record

Package: `dsh-opencode-auto-review@0.1.0`
Target: DSH `0.2.1-rc.2` (tag `dsh-v0.2.1-rc.2`, commit `687f282e8625c6b8d11ff58211a90524be2e4317`), adapter
`@deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.2`, pi-ai `@earendil-works/pi-ai@1.1.0`, Cordis
`@deepseek-ai/cordis@4.0.5`  
Record status: **final for this release**, revised after the review follow-up (prepack
packaging guarantee, install-vs-launch status split, and two new fix-path gateway-error
transport tests), revised again on 2026-10-22 for the release documentation pass
(LICENSE/README release revision), revised again on 2026-10-22 for the DSH
version-support wording and powered-by-dsh badge revision, and revised again on 2026-10-22
for the open-source release path-sanitation pass: each time the tarball was repacked with
documentation-only changes and the isolated install/composition verification was re-run
(52 PASS / 0 FAIL). The release was also published to the npm registry on 2026-10-22:
section H records the pre-publication self-check and the registry verification, and the
open acceptance items below remain open. Dynamic evidence from the Lead's final run and the owning
teammates is quoted below; everything that was not run remains `NOT COMPLETED` and is
listed in [Not completed / limitations](#not-completed--limitations).

## Final result

| Area | Result |
| --- | --- |
| Full test suite (Lead-run, 2026-10-21 19:21 Asia/Shanghai; re-run 2026-10-22 15:31 Asia/Shanghai) | **PASS** — 4 test files, 65/65 tests passed, 0 failed/skipped, ~6.1 s (2026-10-21) and 14.1 s (2026-10-22 re-run): `auto-review.spec.ts` 31/31; `session-routing.spec.ts` 7/7; `opencode-transport.spec.ts` 14/14; `composition.spec.ts` 13/13 |
| Typecheck | **PASS** — `node ./node_modules/typescript/bin/tsc --noEmit` exit 0, zero diagnostics (re-run 2026-10-22 15:31) |
| Source parity with the fixed upstream commit | **PASS** — only the provenance header, `@module` line and `sessionId` line differ (17 insertions, 1 deletion) |
| Build / pack | **PASS** — `tsdown` exit 0 (`lib/index.js` 23,608 B, `lib/index.d.ts` 437 B); `prepack: "tsdown"` is set, and with `lib/` removed `npm pack --foreground-scripts` rebuilt `lib/` and produced a tarball containing both (`PACK_EXIT=0`); `pnpm pack --pack-destination` likewise rebuilt `lib/` and produced a valid tarball (`PNPM_PACK_EXIT=0`). Release tarball after the 2026-10-22 open-source path-sanitation documentation revision: 8 files, 27,545 B, SHA-256 `63A76209BFED6B5614B5F5453DEE58713BF4BD0EC73683D275E784659D93A29C`, built after the final documentation edit; it supersedes the version-support documentation artifact `EAF7305E…227A3` (27,543 B), the release-documentation artifact `21CEBBA4…04F6A` (26,163 B), the intermediate docs-rebuild `4F23E747…D9B4` (25,747 B) and `C2A83BE2…D091F` (24,942 B) with `package.json` and `lib/` bytes unchanged |
| Install / effective composition | **PASS** — target CLI `0.2.1-rc.2`; isolated profile; official `auto-review` row `disabled: true`; exactly one active `auto-review-opencode` row; re-verified against the release artifact on 2026-10-22 (52 PASS / 0 FAIL, `.verify/run-install-verification.ps1`); installed artifact imports in the real 0.2.1-rc.2 runtime |
| npm publication | **PASS** — `dsh-opencode-auto-review@0.1.0` published to `registry.npmjs.org` on 2026-10-22 21:35 Asia/Shanghai; registry `dist.integrity`/`dist.shasum` and the downloaded registry tarball match the verified 27,545 B artifact (H1–H6) |
| Launch with the published artifact (DEV §7 phase 5 "starts with the published artifact") | **NOT COMPLETED** — no full headless/web profile boot was run; only `--dump-config` / `--dump-config-schema` import checks exist |
| Real OpenCode gateway allow/deny acceptance | **NOT COMPLETED** — not run: no gateway credentials in this environment, and the running host is DSH 0.2.0-rc.2, not the target release. The loopback transport evidence (D1–D6) is the substitute evidence for the reviewer header path; this is one of the two open acceptance items. |
| `opencode-go` route | Excluded from the first-release support claim (the three APIs pass locally, but there is no real-gateway acceptance; DEVELOPMENT.md §6.3). |

**Open acceptance items (2):** (a) **E1** — the full booted-profile call chain
(conversation → reviewer → tool result, multiple sessions/subagents) including launch from
the published artifact; (b) **E2/F9** — real OpenCode gateway allow + deny. No other
acceptance item is open.

## Status legend

| Status | Meaning |
| --- | --- |
| PASS | The check was executed or the artifact inspected, and the captured evidence is quoted or reproduced below. |
| FAIL | The captured evidence shows the check failing. The failure is quoted; none recorded. |
| PARTIAL | A composite check whose named sub-checks mixed PASS and NOT COMPLETED. It is never used for a wholly unrun check and never means fully passed. |
| NOT COMPLETED | No captured evidence. This is neither a pass nor a failure: the check was unrun or deliberately deferred. It must never be reported as passed. |

No check is marked PASS unless the command or artifact that evidences it appears in this
file. Dynamic evidence produced by another teammate or the Lead is quoted with the command
and the owning role; raw dynamic logs live outside the published package (the install and
profile scratch area is gitignored).

## Environment and test runner

Final dynamic runs were executed on Windows 10.0.26200 with Node `v24.18.0`. The exact
runner used for every dynamic run under this DSH file sandbox:

```powershell
$env:DSH_TEST_SANDBOX='1'; node --require ./.verify/vitest-sandbox-preload.cjs --require ./.verify/fs-realpath-preload.cjs --import ./.verify/esm-realpath-register.mjs ./node_modules/vitest/vitest.mjs run --pool=threads [file]
```

### Environment note — sandbox-only test adaptations

The dynamic checks recorded here were run in a Windows workspace under the DSH file
sandbox. In that verification environment, pnpm package links appear as junction mount
points and piped child processes are blocked, so the resulting ESM entry points need a
sandbox-only preload/realpath hook set, and the test runner needs a thread pool. Those
helpers and flags live in the gitignored `.verify/` directory and are not repository
configuration.

These adaptations are properties of this verification sandbox only. They are **not**
requirements of the package or of its tests on a normal machine, and they are not part of
installation or usage instructions. On a normal machine the package commands are simply
`pnpm test`, `pnpm typecheck` and `pnpm build`; `vitest.config.ts` pins
`pool: 'threads'` itself and no sandbox flags exist in repo config. Plain `pnpm test` /
`pnpm build` were not executed verbatim inside this sandbox — that is a
verification-environment limitation, not a package requirement.

When the `prepack` mechanism was proven (A8), the build spawned by `npm pack` / `pnpm
pack` needed those same sandbox-only Node loader bridges; that is the same environment
limitation, not a package requirement — on a normal machine plain `npm pack` / `pnpm
pack` works.

All package-level claims in this record concern `src/`, `cordis.patch.yml`,
`package.json` and the built/packed artifact; environment adaptations are noted only so
the dynamic evidence can be reproduced inside this workspace.

## A. File-level evidence captured

These checks were performed by reading the repository files; each one is reproducible in
this checkout with the command shown. `.upstream/` is local reference material captured
from the fixed tag and is intentionally gitignored.

### A1. Fixed baseline and provenance hashes — PASS

Command:

```powershell
Get-FileHash -Algorithm SHA256 .upstream/packages/experimental/auto-review/src/index.ts,
  .upstream/packages/experimental/auto-review/tests/auto-review.spec.ts,
  .upstream/packages/subagent/subagent/tests/external-activation-helpers.ts
```

Captured result (lowercase hex, matches the table in `UPSTREAM.md`):

```text
1b0ebf6539f2f412c012eadf8049d19f711267040423d7800b3c4f06809413a7  .upstream/packages/experimental/auto-review/src/index.ts
ced393578024400ba08de15332e139d6c9abad01578df18eb660683ba9adb82e  .upstream/packages/experimental/auto-review/tests/auto-review.spec.ts
9411ac2eb4e82d86f4970058660bd55b0a11d1f0da3fedce1200967d0089caef  .upstream/packages/subagent/subagent/tests/external-activation-helpers.ts
```

`UPSTREAM.md` records tag `dsh-v0.2.1-rc.2`, commit
`687f282e8625c6b8d11ff58211a90524be2e4317`, and the upstream MIT copyright. `LICENSE`
reproduces the MIT license and carries the third-party notice for the derived content.

### A2. Derived source parity — PASS

Command:

```powershell
git diff --no-index .upstream/packages/experimental/auto-review/src/index.ts src/index.ts
```

Captured result: `1 file changed, 17 insertions(+), 1 deletion(-)`, exactly three
differences:

1. the provenance header comment added at the top of the file;
2. `@module @deepseek-ai/dsh-experimental-auto-review` → `@module dsh-opencode-auto-review`;
3. the single added line inside the frozen reviewer options:

```ts
    temperature: 0,
    sessionId: agent.session.id,
    signal,
```

No other line differs. Review policy text, five-section input assembly, risk parsing,
approval priority, PTC handling, cancellation and disposal order are therefore
byte-identical to the fixed upstream commit. This also establishes that the code uses the
fixed tag's TypeScript surface: every import is the upstream import unchanged.

### A3. Ported official behavior spec — PASS (port shape; execution in B3/B4)

Command:

```powershell
git diff --no-index .upstream/packages/experimental/auto-review/tests/auto-review.spec.ts tests/auto-review.spec.ts
```

Captured result: `22 insertions(+), 4 deletions(-)` in 4 hunks. Complete deviation list
from upstream (no behavior assertion weakened or deleted; all other assertions
byte-identical):

- D1 — a provenance header comment was added;
- D2 — the repo-local fixture import became `./fixtures/external-activation-helpers.ts`;
- D3 — the module under test became `../src/index.ts`;
- D4 — the prescribed bug-baseline flip
  `expect(request).not.toHaveProperty('sessionId')` became
  `expect(request.sessionId).toBe(agent.session.id)` (line 409);
- D5 — one type-only port correction: `source: { kind: 'test' } as never` (line 329). Its
  runtime value and every assertion about it are unchanged; the cast removes TS2322
  against the published `MessageSource` union because upstream's monorepo tests were not
  part of that tsc project.

The remaining check for this item is running the suite, which is B3.

### A4. Ported external-activation fixture — PASS

Command:

```powershell
git diff --no-index .upstream/packages/subagent/subagent/tests/external-activation-helpers.ts tests/fixtures/external-activation-helpers.ts
```

Captured result: `8 insertions(+), 1 deletion(-)`: the provenance header comment and the
private in-repo type import replaced with the public package export
(`@deepseek-ai/dsh-subagent`). Fixture behavior is unchanged.

### A5. Static header precedence rule (source-level) — PASS (integration in D5)

Captured from `.upstream/pi-ai-1.1.0/package/dist/providers/opencode-headers.js`:

```js
const OPENCODE_SESSION_HEADER = "x-opencode-session";
function hasHeader(headers, name) {
    const expected = name.toLowerCase();
    return Object.keys(headers ?? {}).some((key) => key.toLowerCase() === expected);
}
function withSessionHeader(options) {
    if (!options?.sessionId || hasHeader(options.headers, OPENCODE_SESSION_HEADER))
        return options;
    ...
}
```

An explicitly configured same-named header — in any letter case — suppresses the generated
value. `opencode.js` wraps four chat APIs with `withOpenCodeSessionHeader`
(`anthropic-messages`, `google-generative-ai`, `openai-completions`,
`openai-responses`); `opencode-go.js` wraps three (`anthropic-messages`,
`openai-completions`, `openai-responses`).

### A6. Composition patch shape — PASS (effective runtime composition in F7)

`cordis.patch.yml` contains exactly these two patch entries (comments omitted):

```yaml
- id: auto-review
  name: '@deepseek-ai/dsh-experimental-auto-review'
  disabled: true

- insert:
    - id: auto-review-opencode
      name: dsh-opencode-auto-review
```

Two distinct row IDs; the official row is only disabled (no `name` replacement, no
`config`), and one active row naming this package is inserted. `tests/composition.spec.ts`
encodes this contract plus the manifest checks and passes 13/13 (C9).

### A7. Published manifest contract — PASS

Captured from `package.json`:

- `name: dsh-opencode-auto-review`, `version: 0.1.0`, `type: module`;
- `main: ./lib/index.js`, `types: ./lib/index.d.ts`, exports for `.`, `./package.json`,
  `./cordis.patch.yml`;
- `files: [lib, cordis.patch.yml, README.md, README.zh.md, UPSTREAM.md, LICENSE]`;
- `engines.dsh: 0.2.1-rc.2` (exact, declarative metadata; current DSH installers/loaders do
  not enforce it — enforcement is through the pinned peers below), `engines.node: >=22.19.0`;
- `dsh.bundle.patch: ./cordis.patch.yml`;
- all `@deepseek-ai/dsh-*` packages are peer dependencies pinned to `0.2.1-rc.2` (Cordis
  to `4.0.5`); the only runtime dependency is `@deepseek-ai/dsh-util-values@0.2.1-rc.2`;
- `scripts`: `"build": "tsdown"`, `"prepack": "tsdown"`, `"pack": "npm pack"` — the
  `prepack` hook rebuilds `lib/` at pack time (mechanism proven in A8), so a pack cannot
  ship stale or missing output; there is no install-time script;
- `tsdown.config.ts` marks `@deepseek-ai/*` external, so no private Cordis or service copy
  is bundled.

The build output and packed tarball are inspected in A8.

### A8. Packed artifact contents — PASS (installation in F8)

Final artifact: `dsh-opencode-auto-review-0.1.0.tgz`, 27,545 bytes, SHA-256
`63A76209BFED6B5614B5F5453DEE58713BF4BD0EC73683D275E784659D93A29C`. Rebuilt for the
open-source release path-sanitation pass on 2026-10-22 at 17:10 Asia/Shanghai after the
final documentation edit; it supersedes the DSH version-support artifact
`EAF7305ED65A4E57F256B99EED67AA309414090C8D25111AA43B6EE83A2227A3` (27,543 bytes, 16:54),
the release-documentation artifact
`21CEBBA4D93391A37550CDB3079B9A138A94C8E1719DC382E1105E673E204F6A` (26,163 bytes, 15:44),
the intermediate docs-rebuild
`4F23E747453A6DE8F04EE7C7DD7FFA38C111B2415A4EF49847B2E91FFF21D9B4` (25,747 bytes, 15:29,
built before that edit) and
`C2A83BE27F26AAC825BB864F8F6BD55EC41A9599FD22E60F76CF0B02476D091F` (24,942 bytes, rebuilt
after the package rename on 2026-10-21 at 21:28). Across the 2026-10-22 artifacts only
`README.md`, `README.zh.md` and `UPSTREAM.md` changed: the packed `UPSTREAM.md` hash is now
`07E5445C50FC0AFB3BB15B47B1FABDE25823EADB3DDDC24C2108D11DBFC26C1F` (the path-sanitation
pass removed a developer-local absolute path; the previous packed hash was
`028E34E32B533FF7BF6786A41F3198792DC60690527C3C29A065CA47BE8E1B8C`), while the packed
`package.json` hash remains
`E297644B6D2CB7424D50DE8F3497FFAD4176F0BA32FC2A553F62F1B067A99C95`, `lib/index.js`
remains `18A92872FFAE35CF7E86C0DB69D4D98B7D618195D08A11150E13F78F26D53E50`, `lib/index.d.ts`
remains `780FF1B6BC629A0DC3231371AB5BA581B820842C329123A138CE7C568295A811`, and the packed
file list is unchanged (8 files). Extracted `README.md`, `README.zh.md` and `UPSTREAM.md` were
byte-identical to the repository worktree at build time (`B87870E6…BABC` / `B0C55621…E9F5` /
`07E5445C…6C1F`); the post-publication README revision described in H is not part of the
`0.1.0` artifact. The prepack rebuild mechanism below was proven earlier; this pass and the
version-support pass are documentation-only, so both were packed with
`npm pack --ignore-scripts` and the tarball's `lib/` and `package.json` bytes were
hash-checked against the previously verified build instead of being rebuilt.

Pack-time rebuild mechanism (Lead-run): with `lib/` removed,
`npm pack --foreground-scripts` invoked the `prepack` script, rebuilt `lib/index.js`
(23,608 B) + `lib/index.d.ts` (437 B) and produced a tarball containing both
(`PACK_EXIT=0`); `pnpm pack --pack-destination` likewise rebuilt `lib/` and produced a
valid tarball (`PNPM_PACK_EXIT=0`). `prepack` is pack-time only: the profile install runs
no build and the tarball ships the freshly built `lib/`.

Command:

```powershell
tar -tzf dsh-opencode-auto-review-0.1.0.tgz
```

Captured file list — exactly the whitelisted publishable files, with no `src/`, `tests/`,
`.upstream/`, `.verify/`, `.tools/`, caches or configs:

```text
package/LICENSE
package/lib/index.js
package/lib/index.d.ts
package/package.json
package/README.md
package/README.zh.md
package/UPSTREAM.md
package/cordis.patch.yml
```

The packed `package.json` declares `name`, `version: 0.1.0`, `main: ./lib/index.js`,
`types: ./lib/index.d.ts`, `engines.dsh: 0.2.1-rc.2`, `dsh.bundle.patch:
./cordis.patch.yml` and the scripts `build`/`prepack`/`pack` above; the built `lib/index.js`
contains the `sessionId: agent.session.id,` line. A scan of every packed file for
drive-letter absolute paths, user-profile paths or workspace-local `node_modules` paths
found no developer-machine absolute path. Installation and byte-identity of this exact
artifact are covered in F8.

### A9. Bilingual documentation coverage — PASS

`README.md` and `README.zh.md` exist, link to each other, and contain all required
sections: the `MissingSessionID` failure chain; what changes and what is preserved;
version support (declared `engines.dsh` plus the peer-pinned enforcement mechanism);
installation order and `--dump-config` verification;
correct final composition; session identity semantics; static `x-opencode-session` header
caveat; uninstall/rollback with the `danger-full-access` + `never` migration and the return
of the OpenCode defect; pointer to this record; known limitations/deferred work;
provenance/license. The 2026-10-22 release revision adds a quick-start install path,
release-artifact guidance, and an explicit project copyright/license attribution in both
languages. A second 2026-10-22 revision rewrites the version-support text (declarative
`engines.dsh` vs. enforced peer pins, A7) and ends each README with the official linked
`powered by dsh` badge. A third 2026-10-22 revision sanitizes the tracked documentation for
open-source release: developer-local absolute paths were removed from `UPSTREAM.md`,
`DEVELOPMENT.md` and this record, and the packed payload was rescanned for such paths (A8).

## B. DEVELOPMENT.md §6.1 — official behavior regression

| Check | Evidence / command | Status |
| --- | --- | --- |
| B1. Upstream spec ported; module import and repo-local fixture import adapted; no developer-machine test dependency | A3/A4; port diff is +22/−4 in 4 hunks with deviations D1–D5 only; no assertion weakened or deleted; `tests/` contains no developer-machine absolute path | PASS |
| B2. Error-baseline assertion replaced with `expect(request.sessionId).toBe(agent.session.id)` | `tests/auto-review.spec.ts:409` (A3, D4) | PASS |
| B3. Ported official spec passes | behavior-tests task-1 completion: `tests/auto-review.spec.ts` **31/31 passed** with the sandbox runner; final suite re-run by the Lead: 31/31 | PASS |
| B4. Frozen request/messages, no persisted outer-input `id`/`source`, unchanged five-section content, outer-input identity distinct from request-level `sessionId` | behavior-tests task-1 completion: the same 31/31 spec asserts the frozen request/messages, the absence of persisted outer-input `id`/`source`, and unchanged five-section content; the only request difference is the added `sessionId` | PASS |

## C. DEVELOPMENT.md §6.2 — new test matrix

`tests/session-routing.spec.ts` is **7/7 passed** (behavior-tests task-1 completion; final
suite re-run by the Lead: 7/7). The identity matrix rows below quote its evidence; rows
also covered by the ported official spec are noted.

| Check | Evidence / command | Status |
| --- | --- | --- |
| C1. Single-session native call: reviewer ID equals the pending Agent ID; tool executes once after allow | session-routing PASS: `request.sessionId === agent.session.id`; the probe executes exactly once after allow; identity is absent from prompt/system text | PASS |
| C2. Two concurrent sessions with a barrier: each review request carries its own session ID; no cross-session leakage | session-routing PASS: barrier-synchronized two concurrent Auto sessions, 2 in-flight requests; each request's `sessionId` matches its own session and not the other's; each review is cross-tied to its own `PENDING_ACTION` arguments so a swap cannot pass | PASS |
| C3. In-process subagent: reviewer uses the child session ID, never the parent ID | session-routing PASS: child has `origin: 'subagent'` and `parentSession` set; reviewer `sessionId` equals the child ID and differs from the parent ID | PASS |
| C4. PTC inner call: each started inner call reviewed once with the correct identity | session-routing PTC identity case PASS; the ported official spec's PTC cases also pass in the 31/31 run | PASS |
| C5. PTC outer `run_code`: outer transport stays excluded; no extra review | Covered by the routing spec PTC case and the ported official spec's exclusion cases (31/31); no extra review | PASS |
| C6. Approval and denial: `ask`, `never` and downstream-listener decisions keep official priority | session-routing approval case + ported official spec approval cases PASS; final suite includes them | PASS |
| C7. Technical failure: HTTP error, invalid JSON and abnormal finish never execute the tool body | session-routing failure cases (provider throw and invalid JSON) + ported official spec failure cases PASS; body never executes | PASS |
| C8. Cancellation and unload: in-flight review cancelled, no calls accepted after unload, no duplicate listener residue | session-routing: cancellation does not dispatch (`TOOL_ABORTED_BEFORE_DISPATCH`); ported official spec teardown/unload cases PASS | PASS |
| C9. Composition: official row disabled, new row active, exactly one Auto provider after load | `tests/composition.spec.ts` **13/13 passed**; plus the real `--dump-config` evidence in F7 | PASS |
| C10. Non-OpenCode route still reviewed via the original route with no OpenCode-specific logic | Every offline suite routes through the ordinary non-OpenCode `review` provider; no provider-specific branch exists in `src` (A2 parity) and the tests pass | PASS |

## D. DEVELOPMENT.md §6.3 — transport integration

`tests/opencode-transport.spec.ts` is **14/14 passed** (12 original + 2 review-follow-up
tests; transport-tests; final suite re-run by the Lead: 14/14). Setup: a real `LlmRuntime`
+ published `@deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.2` + `@earendil-works/pi-ai@1.1.0` + the
real Auto gate + probe, against an in-process loopback gateway on `127.0.0.1:0`; retries
disabled; offline only.

| Check | Evidence / command | Status |
| --- | --- | --- |
| D1. Local HTTP server records headers and returns legal stream responses; no project content leaves the machine; missing header reproduces the gateway failure | transport-tests PASS: loopback gateway records URL/headers/body and returns legal SSE; when the header is absent it answers `MissingSessionID` HTTP 400; no external network | PASS |
| D2. Through the real target adapter and pi-ai provider, the actual received `x-opencode-session` equals the pending Agent's session ID for all four OpenCode chat APIs | transport-tests PASS — one request each, decision parsed, probe executed exactly once: `opencode/openai-completions` → `POST /chat/completions`, header `opencode-openai-completions`; `opencode/openai-responses` → `POST /responses`, `opencode-openai-responses`; `opencode/anthropic-messages` → `POST /v1/messages?beta=true`, `opencode-anthropic-messages`; `opencode/google-generative-ai` → `POST /models/gemini-3-flash:streamGenerateContent?alt=sse`, `opencode-google-generative-ai`. Each header value equals the pending agent's session ID | PASS |
| D3. Same fixture, upstream unfixed vs this plugin: upstream reproduces the missing-header failure and executes no body; this plugin delivers the header and a valid decision | transport-tests PASS: official `@deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.2` sent no header → gateway 400 → tool result exactly `Auto review of tool "probe" failed; its body was not executed: auto-review: reviewer ended with error INVALID_REQUEST: 400: {"message":"Missing session ID","code":"MissingSessionID"}`; probe ran 0. Our `src` sent `x-opencode-session=fix-delivers-session` (=== that agent session ID), parsed the allow decision and executed exactly once. A deny-over-transport case (medium/deny under `never`) returns `AutoReviewDeniedError`/`AUTO_REVIEW_DENIED` with reason and probe runs 0 | PASS |
| D4. Four OpenCode chat APIs covered with legal response fixtures; `opencode-go` excluded from the first-release support claim unless independently accepted | transport-tests PASS for the four `opencode` APIs (D2). The three `opencode-go` APIs (`deepseek-v4-flash`, `gpt-5.6-luna`, `claude-haiku-5-5`) also pass locally with their own `opencode-go-*` headers, but are **excluded from the first-release support claim** per DEVELOPMENT.md §6.3: there is no real-gateway acceptance for them | PASS (opencode), excluded (opencode-go) |
| D5. Explicitly configured same-name header (any case) still wins over the generated value; upstream priority rule unchanged | transport-tests PASS: `x-opencode-session` (lower case) and `X-OpenCode-Session` (mixed case) both set to `deployment-static-session` were received on the wire instead of the generated value. Adapter-level baseline recorded: with `sessionId` set the stream header is present (`adapter-session-id`); with it omitted and with an empty string it is absent — recorded `[adapter-session-id, null, null]`, rejected `[false, true, true]` | PASS |
| D6. Fix path fails closed on a real gateway HTTP error after delivering the header | transport-tests PASS — new describe `fix path fails closed on a real gateway HTTP error after delivering the header` (2 tests). 400 case: our `./src/index.ts` mounted over real `LlmRuntime` + published `llm-pi-ai@0.2.1-rc.2` + `pi-ai@1.1.0` + loopback gateway; the gateway **received** the correct header `x-opencode-session=fix-gateway-error-400` (=== that pending agent's session ID) and answered HTTP 400 `{"message":"Missing Session ID","code":"MissingSessionID"}`; `result.isError === true`; `result.error.info === undefined` (not a final `AutoReviewDeniedError`); probe body executed 0 times; exactly 1 request; result message exactly `Auto review of tool "probe" failed; its body was not executed: auto-review: reviewer ended with error INVALID_REQUEST: 400: {"message":"Missing session ID","code":"MissingSessionID"}`. 500 case: header `x-opencode-session=fix-gateway-error-500`; result message exactly `Auto review of tool "probe" failed; its body was not executed: auto-review: reviewer ended with error SERVER: 500: {"message":"mock gateway exploded","code":"INTERNAL"}`; same fail-closed assertions; exactly 1 request (no retry) | PASS |

## E. DEVELOPMENT.md §6.4 — composition and real gateway

| Check | Evidence / command | Status |
| --- | --- | --- |
| E1. Independent test profile with the target full runtime: complete main-conversation → reviewer → tool-result path, with multiple sessions and subagents asserting their own IDs (no fixed global ID in helpers) | **NOT COMPLETED.** Install + effective composition (`--dump-config`) were verified, but **launch with the published artifact and the booted-profile call chain are not verified**: no full headless/web profile boot was run, only `--dump-config` / `--dump-config-schema` import checks exist, and no booted-profile conversation → reviewer → tool-result e2e run exists (this is open acceptance item (a)) | NOT COMPLETED |
| E2. Real OpenCode gateway: at least one allow and one deny; deny uses `never` or a rejected approval and the tool body does not execute; versions and sanitized results recorded | **NOT RUN.** This verification environment has no OpenCode gateway credentials (`OPENCODE_GO_API_KEY` is unset in the process environment; the local DSH credential store contains only DSH account/client-connection records) and the running host is DSH 0.2.0-rc.2, not the target release. No gateway request was attempted; this is an environment limitation, not a failure. The loopback transport evidence (D1–D6) is the substitute evidence for the reviewer header path; this is open acceptance item (b) | NOT COMPLETED |

## F. DEVELOPMENT.md §9 — completion checklist

| Check | Evidence / command | Status |
| --- | --- | --- |
| F1. All code and interfaces based on the fixed tag's TypeScript definitions and generated references | A1/A2 (parity against the fixed commit), A7 (manifest pins the target versions), and the Lead's typecheck `tsc --noEmit` exit 0 with zero diagnostics | PASS |
| F2. Core fix is `sessionId: agent.session.id`; prompt and policy have no extra changes | A2 (single added line; no other difference) | PASS |
| F3. Required injections, `ctx` registration, waterfall downstream calls and cleanup order match official | A2 (those lines are unchanged) | PASS |
| F4. Package uses host-shared dependencies; declaration matches the build artifact | A7 (peer dependencies, Cordis shared, `@deepseek-ai/*` external) + A8 (built `lib/index.js`/`lib/index.d.ts` are the tarball's `main`/`types`); build exit 0; import smoke returned `{"name":"experimental-auto-review","inject":["approval","llm","permissionPresets","sessions","tools","workingDirectory"],"apply":"function"}`; `lib` is ESM-only with exactly 4 `@deepseek-ai` imports and no inlined Cordis/service copy | PASS |
| F5. Single-session, concurrent, subagent, PTC, approval, failure and cancellation tests pass | Lead final suite: 4 files, **65/65 tests passed**, 0 failed/skipped (`auto-review.spec.ts` 31/31; `session-routing.spec.ts` 7/7; `opencode-transport.spec.ts` 14/14; `composition.spec.ts` 13/13), ~6.1 s. Re-run 2026-10-22 15:31 Asia/Shanghai: 4 files, **65/65 passed**, 0 failed, 14.1 s — same per-file counts, source unchanged | PASS |
| F6. Actual HTTP header test passes, including the upstream-unfixed failure comparison | D1–D6; transport suite 14/14, including the official-implementation missing-header failure, this plugin's correct header, and the new fix-path real-HTTP-error fail-closed cases (400 and 500) with the header delivered | PASS |
| F7. Exactly one effective Auto provider in the final profile | Isolated profile install (F8) then `--dump-config` exit 0, 367 lines. Verbatim decisive tail:<br>`# == @deepseek-ai/dsh-experimental-auto-review, patched by dsh-opencode-auto-review`<br>`- id: auto-review`<br>`  name: '@deepseek-ai/dsh-experimental-auto-review'`<br>`  disabled: true`<br>`# == dsh-opencode-auto-review`<br>`- id: auto-review-opencode`<br>`  name: dsh-opencode-auto-review`<br>Counts: exactly 1 official row (disabled), exactly 1 active replacement row, exactly 2 auto-review provider references in the whole tree. `--dump-config-schema` exit 0 with `"diagnostics": []`, walking entry `/97` `auto-review-opencode` (the artifact and its imports load in the real 0.2.1-rc.2 runtime) | PASS |
| F8. Prebuilt artifact installs independently, without developer-machine source paths | Release-documentation re-verification on 2026-10-22 15:44–15:46 Asia/Shanghai, version-support documentation re-verification on 2026-10-22 16:54–16:55 Asia/Shanghai, open-source path-sanitation re-verification on 2026-10-22 17:10–17:11 Asia/Shanghai, and rename install verification on 2026-10-21 21:30–21:34: `.verify/run-install-verification.ps1` returned `RESULT: PASS - every composition/install assertion passed.` (52 PASS / 0 FAIL) for the final release artifact `63A76209…3A29C` (27,545 B); the superseded artifacts `EAF7305E…227A3` (27,543 B), `21CEBBA4…04F6A` (26,163 B), `4F23E747…D9B4` (25,747 B) and `C2A83BE2…D091F` (24,942 B) had passed the same script. Evidence: `.verify/logs/tarball-sha256.log`, `step2-plugin-add-tgz.log`, `dump-config.log` and `dump-config-schema.log`; the older `.verify/installation-transcript.log` belongs to the previous package. Target CLI `0.2.1-rc.2`; isolated `DSH_HOME`; installed copy contains built `lib/` and no `src/`. Installed `package.json` SHA-256 `E297644B6D2CB7424D50DE8F3497FFAD4176F0BA32FC2A553F62F1B067A99C95` matches the repository manifest. Runtime output hashes remain `18A92872FFAE35CF7E86C0DB69D4D98B7D618195D08A11150E13F78F26D53E50` (`lib/index.js`) and `780FF1B6BC629A0DC3231371AB5BA581B820842C329123A138CE7C568295A811` (`lib/index.d.ts`). Effective config disables the official row and activates one `auto-review-opencode` row pointing to the renamed package; schema diagnostics `[]`, entry `/97`. Full suite re-run at 21:45: 65/65 passed. The real user profile was untouched | PASS |
| F9. Gateway allow and deny acceptance completed; unfinished checks recorded honestly | E2 not run (no gateway credentials; host is not the target release); this record marks it NOT COMPLETED and gives the reason | NOT COMPLETED |
| F10. Bilingual docs cover version, installation order, static header, uninstall migration and rollback | A9 | PASS |
| F11. Upstream MIT copyright, fixed commit and derivation differences fully recorded | A1/A2/A3/A4 and `UPSTREAM.md`/`LICENSE` | PASS |

## G. DEVELOPMENT.md §7 — phase table

| Phase / gate | Check | Evidence / command | Status |
| --- | --- | --- | --- |
| 1. Baseline | Upstream sources fixed, dependencies inventoried, copyright and provenance recorded; not an older local DSH working tree | A1; `UPSTREAM.md` fixed tag/commit and hashes | PASS |
| 2. Implementation — source | Session field added; manifest, build config and composition patch established; production behavior difference can be explained item by item | A2, A6, A7 | PASS |
| 2. Implementation — type gate | Typecheck passes | Lead-run `node ./node_modules/typescript/bin/tsc --noEmit` → exit 0, zero diagnostics | PASS |
| 3. Behavior verification | Ported official tests plus identity, concurrency and lifecycle tests pass | Lead final suite 65/65; `auto-review.spec.ts` 31/31 and `session-routing.spec.ts` 7/7 (B3, C1–C8) | PASS |
| 4. Transport verification | Correct header reaches the HTTP service through the real adapter; the error path executes no tool body | `opencode-transport.spec.ts` 14/14 (D1–D6), including the upstream-unfixed comparison and the new fix-path real-HTTP-error fail-closed cases | PASS |
| 5. Install verification | **PARTIAL** — install + effective composition (`--dump-config`) PASS (F4/F7/F8); **launch with the published artifact NOT COMPLETED** (no full headless/web profile boot; only `--dump-config` / `--dump-config-schema` import checks) | F7/F8; `.verify/installation-transcript.log` (52 PASS / 0 FAIL); launch evidence absent | PARTIAL |
| 6. Gateway acceptance | Desktop/Web allow and deny with no `MissingSessionID`; permission behavior as expected | Not run (E2/F9); no gateway credentials and the running host is not the target release | NOT COMPLETED |
| 7. Delivery — documentation | README (EN/ZH), upstream record and verification record; unfinished items explicitly listed and no pass claimed without evidence | A9, A1; this record's NOT COMPLETED entries | PASS |
| 7. Delivery — artifact | Prebuilt tarball plus source and verification record delivered | A8 final tarball; `README.md`/`README.zh.md`/`UPSTREAM.md`/`VERIFICATION.md` present | PASS |

## H. Registry publication — PASS

Self-check and first public release on the npm registry, 2026-10-22 (Asia/Shanghai). The
checkout had been moved from its pre-rename directory, so every pnpm junction was stale;
the working tree was re-linked first (`pnpm install --frozen-lockfile --ignore-scripts`,
lifecycle scripts skipped because no native build is needed for this package) and then
re-checked end to end before publishing.

| Check | Evidence | Status |
| --- | --- | --- |
| H1. Build, typecheck and pack reproduce the recorded output | `tsdown` (with the sandbox resolution bridges) rebuilt `lib/index.js` (23,608 B, `18A92872…E50`) and `lib/index.d.ts` (437 B, `780FF1B6…A811`); `tsc --noEmit` exit 0; `npm pack` with the `prepack` hook reproduced the recorded artifact: 27,545 B, SHA-256 `63A76209…3A29C` | PASS |
| H2. Full test suite passes on the re-linked checkout | `vitest run --pool=threads` via the sandbox runner: 4 files, **65/65 tests passed** (31 + 7 + 14 + 13), 2026-10-22 17:29 Asia/Shanghai | PASS |
| H3. Package name and version are valid and were free for first publication | `npm view dsh-opencode-auto-review` returned `E404` before publishing; `npm publish` succeeded as `+ dsh-opencode-auto-review@0.1.0` with tag `latest` and default public access | PASS |
| H4. Registry metadata matches the verified artifact | `dist.integrity` = `sha512-iYJt8jc/SJn2wTDe1hUB6QrBRBIV1njqZTS2dmfpPcugNEhKj9/z8/Ady/dlLTXcMzvmXfaCSJjqyZPbz+UklQ==` and `dist.shasum` = `2dbdc6a9b44011bc131fbe26e93758faaef2ec68`, i.e. the SHA-512/SHA-1 of the 27,545 B artifact above | PASS |
| H5. The registry tarball is byte-identical to the verified artifact | Downloaded `https://registry.npmjs.org/dsh-opencode-auto-review/-/dsh-opencode-auto-review-0.1.0.tgz` on 2026-10-22 21:37 Asia/Shanghai: 27,545 B, SHA-256 `63A76209…3A29C`; every payload file hash matches the repository copy (README.md `B87870E6…`, README.zh.md `B0C55621…`, UPSTREAM.md `07E5445C…`, package.json `E297644B…`, `lib/index.js` `18A92872…`, `lib/index.d.ts` `780FF1B6…`, LICENSE `AD56EF83…`, cordis.patch.yml `1617EE01…`) | PASS |
| H6. Publisher identity and account security | Published as npm account `drscorpio`; package maintainer is `drscorpio <drscorpio@vip.qq.com>`; the account has 2FA enabled (`auth-and-writes`) and publishing used a bypass-2FA granular access token | PASS |

Known follow-up (not a release blocker): `package.json` has no `repository`, `homepage` or
`bugs` fields, so the npm page for `0.1.0` does not link back to this repository. Add them in
the next published version.

Post-publication documentation update (not part of the `0.1.0` artifact): after the release,
`README.md` and `README.zh.md` were revised on 2026-10-22 to document installing from the npm
registry (`dsh plugin --profile <profile> add dsh-opencode-auto-review@0.1.0`) as the standard
path, keep the prebuilt tarball as the offline alternative, mention
`npm install dsh-opencode-auto-review@0.1.0` for dependency-style use, and add the npm version
badge. The npm `0.1.0` package and the release tarball remain unchanged (SHA-256
`63A76209…3A29C`); the next published version will carry the updated documentation. Because
npm version contents are immutable, the README shown on the npm page for `0.1.0` remains the
pre-publication snapshot.

## Evidence provenance

| Evidence | Source |
| --- | --- |
| Final full suite 65/65 and typecheck exit 0 | Lead's final run, 2026-10-21 19:21 Asia/Shanghai, and release-documentation re-run, 2026-10-22 15:31–15:32 Asia/Shanghai, using the sandbox runner in [Environment and test runner](#environment-and-test-runner) |
| `auto-review.spec.ts` 31/31 and port deviations D1–D5; `session-routing.spec.ts` 7/7 and matrix cases C1–C8, C10 | behavior-tests task-1 completion |
| `opencode-transport.spec.ts` 14/14, loopback gateway header captures, upstream-vs-fix comparison, static-header precedence, fix-path HTTP-error fail-closed cases (D6) | transport-tests; suite and fixtures in `tests/` |
| Build, pack, isolated-profile install, `--dump-config`, `--dump-config-schema` | install-composition task-3 completion; full record in `.verify/install-verification.md`, raw logs in `.verify/logs/*`, re-runnable script `.verify/run-install-verification.ps1` (all gitignored, not shipped) |
| Historical review follow-up: `prepack` packaging mechanism (PACK_EXIT=0 / PNPM_PACK_EXIT=0), previous artifact `4EDF5828…30C5` (24,947 B), install re-verification (52 PASS / 0 FAIL), same-version re-add behavior | Lead review-follow-up evidence, 2026-10-21 ~19:20–19:29; logs `.verify/logs/readd-tgz-new-artifact.log`, `upgrade-remove-old-tgz.log`, `upgrade-add-new-tgz.log`, `.verify/installation-transcript.log` |
| Renamed final artifact `C2A83BE2…D091F` (24,942 B), isolated installation and effective composition; full suite 65/65 and typecheck exit 0 | Rename verification, 2026-10-21 21:28–21:45 Asia/Shanghai; F8 and `.verify/logs/tarball-sha256.log`, `step2-plugin-add-tgz.log`, `dump-config.log`, `dump-config-schema.log` |
| Release artifact `21CEBBA4…04F6A` (26,163 B) rebuilt after the final documentation edit; isolated installation and effective composition re-verified (52 PASS / 0 FAIL); packed manifest and `lib/` hashes unchanged | Release-documentation verification, 2026-10-22 15:44–15:46 Asia/Shanghai; F8 and `.verify/logs/tarball-sha256.log`, `step2-plugin-add-tgz.log`, `dump-config.log`, `dump-config-schema.log` |
| Version-support documentation artifact `EAF7305E…227A3` (27,543 B) rebuilt after the DSH version-support wording and powered-by-dsh badge revision; isolated installation and effective composition re-verified (52 PASS / 0 FAIL); packed READMEs byte-identical to the worktree; manifest and `lib/` hashes unchanged | Version-support documentation verification, 2026-10-22 16:54–16:55 Asia/Shanghai; F8 and `.verify/logs/tarball-sha256.log`, `step2-plugin-add-tgz.log`, `dump-config.log`, `dump-config-schema.log` |
| Open-source path-sanitation artifact `63A76209…3A29C` (27,545 B) rebuilt after removing developer-local absolute paths from the tracked documentation and adding a packed-payload path scan; isolated installation and effective composition re-verified (52 PASS / 0 FAIL); packed READMEs/`UPSTREAM.md` byte-identical to the worktree; manifest and `lib/` hashes unchanged | Open-source release verification, 2026-10-22 17:10–17:11 Asia/Shanghai; F8 and `.verify/logs/tarball-sha256.log`, `step2-plugin-add-tgz.log`, `dump-config.log`, `dump-config-schema.log` |
| npm publication of `dsh-opencode-auto-review@0.1.0`: registry `dist.integrity`/`dist.shasum` and byte-identical downloaded registry tarball | npm publish / `npm view` / `npm pack` against `registry.npmjs.org`, 2026-10-22 21:35–21:37 Asia/Shanghai; H1–H6; downloaded tarball kept in `.verify/npm-published/` (gitignored, not shipped) |
| File-level diffs, hashes, manifest and patch contracts | Section A of this record; commands reproduce in this checkout |

## Not completed / limitations

- **E1 (full booted-profile call chain incl. launch from the published artifact)** — not
  run: install + effective composition were verified, but no full headless/web profile
  boot was performed (no long-running server), only `--dump-config` /
  `--dump-config-schema` import checks exist, and no booted-profile conversation →
  reviewer → tool-result e2e run exists. This is open acceptance item (a).
- **E2 / F9 / §7 phase 6 (real OpenCode gateway allow + deny)** — not run: no OpenCode
  gateway credentials in this environment (`OPENCODE_GO_API_KEY` unset; the local DSH
  credential store contains only DSH account/client-connection records) and the running
  host is DSH 0.2.0-rc.2, not the target release. No gateway request was attempted; this
  is an environment limitation, not a failure. Loopback transport evidence (D1–D6) covers
  the reviewer header path; this is open acceptance item (b).
- **Upgrade guidance — replacing a changed artifact of the same version.** Re-adding a
  changed `.tgz` with the **same version** via
  `dsh plugin --profile <profile> add <tgz>` makes pnpm report `Already up to date` and
  does **not** replace the installed bytes. Use
  `dsh plugin --profile <profile> remove dsh-opencode-auto-review` followed by a fresh
  `add <tgz>`, or bump the version. Recorded logs:
  `.verify/logs/readd-tgz-new-artifact.log`,
  `.verify/logs/upgrade-remove-old-tgz.log`,
  `.verify/logs/upgrade-add-new-tgz.log`.
- **Plain `pnpm test` / `pnpm build` were not executed verbatim inside this sandbox.**
  The package scripts are unchanged; sandbox-only preload/realpath helpers and
  `--pool=threads` were used for the dynamic runs, and the pack-time `prepack` child build
  likewise needed those sandbox-only bridges when exercised here (see the environment
  note). On a normal machine the plain commands are the intended entry points.
- **`opencode-go` support is excluded from the first-release claim.** Its three APIs pass
  locally but have no real-gateway acceptance (DEVELOPMENT.md §6.3).
- **Native packages not exercised:** npm blocked 5 dependency install scripts inside
  `.tools`; plugin management and config dumps do not require them, but a full interactive
  profile boot may need native packages (e.g. `node-pty`, `koffi`) that were not exercised.
- **Artifact stability:** the release tarball is `63A76209…3A29C` (27,545 B), rebuilt on
  2026-10-22 at 17:10 after the open-source path-sanitation revision; it supersedes
  `EAF7305E…227A3` (27,543 B), `21CEBBA4…04F6A` (26,163 B), the intermediate docs-rebuild
  `4F23E747…D9B4` (25,747 B), `C2A83BE2…D091F` (24,942 B) and the pre-rename
  `4EDF5828…30C5` (24,947 B). Every artifact was installed into an isolated profile and its
  effective composition verified (F8); `package.json` and `lib/` bytes are identical across
  all 2026-10-21 and 2026-10-22 artifacts.
  This verification record is not part of the tarball (not in the `files` whitelist), so
  updating this file cannot change the artifact hash.

## Notes

- `lib/`, `*.tgz`, `.upstream/`, `.verify/`, `.tools/` and package-manager caches are
  gitignored development artifacts; the published tarball contains only the whitelisted
  files (A7/A8) and therefore does not include this verification record or
  `DEVELOPMENT.md`.
- Statuses were updated only when the corresponding command output or artifact was
  captured; no `NOT COMPLETED` item was converted into PASS without evidence.
- The final suite (65/65) was run after the build/pack/install evidence was captured and
  re-run for the 2026-10-22 release documentation pass (65/65, typecheck exit 0); the four
  test files in the repository are `tests/auto-review.spec.ts`,
  `tests/session-routing.spec.ts`, `tests/opencode-transport.spec.ts` and
  `tests/composition.spec.ts` (plus their fixtures). This record was revised after the
  review follow-up, again for the 2026-10-22 release documentation pass, again for the
  2026-10-22 DSH version-support wording + powered-by-dsh badge pass, and again for the
  2026-10-22 open-source release path-sanitation pass; those revisions changed this record,
  `README.md`, `README.zh.md`, `UPSTREAM.md` and the rebuilt tarball, but not the runtime
  source or `lib/` output. The checkout inherited pnpm links from its pre-rename directory,
  so `npm pack` with the `prepack` hook cannot run until `pnpm install` relinks
  `node_modules`; the documentation-only passes therefore used `npm pack --ignore-scripts`
  and hash-checked the unchanged `lib/`/`package.json` bytes instead (A8).
