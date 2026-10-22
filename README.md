# dsh-opencode-auto-review

English | [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/dsh-opencode-auto-review.svg)](https://www.npmjs.com/package/dsh-opencode-auto-review)
[![DSH 0.2.1-rc.2](https://img.shields.io/badge/DSH-0.2.1--rc.2-blue.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![Node.js >=22.19.0](https://img.shields.io/badge/Node.js-%3E%3D22.19.0-brightgreen.svg)](https://nodejs.org)

Make DSH Auto review work over the OpenCode gateway on DSH `0.2.1-rc.2`.

`dsh-opencode-auto-review@0.1.0` is a minimal, stand-alone derivation of the official
`@deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.2` bundle. It changes exactly one
behavior: the frozen reviewer request now carries `sessionId: agent.session.id`, so the
pi-ai OpenCode providers can emit the required `x-opencode-session` header. Everything
else — review policy, five-section input, risk rules, JSON protocol, approval precedence,
PTC handling, cancellation and disposal — is the official implementation, unchanged.

> **Version support.** This first release targets DSH `0.2.1-rc.2` exactly, with adapter
> `@deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.2` and pi-ai `@earendil-works/pi-ai@1.1.0`.
> `engines.dsh: "0.2.1-rc.2"` only declares that target — current DSH installers and
> loaders do not enforce it. The effective gate is the package's exact `0.2.1-rc.2`
> `peerDependencies` on the `@deepseek-ai/dsh-*` service packages: DSH checks those ranges
> against the running version before loading a profile, so another DSH release is refused
> with an incompatibility diagnostic rather than merely discouraged. Widening support means
> widening the peer ranges and re-running the parity and transport checks recorded in
> [UPSTREAM.md](UPSTREAM.md) and [VERIFICATION.md](VERIFICATION.md); changing `engines.dsh`
> alone has no runtime effect.

## Table of contents

- [Quick start](#quick-start)
- [What breaks and why](#what-breaks-and-why)
- [What this package changes](#what-this-package-changes)
- [What this package preserves](#what-this-package-preserves)
- [Version support](#version-support)
- [Installation](#installation)
- [What a correct final composition looks like](#what-a-correct-final-composition-looks-like)
- [Session identity semantics](#session-identity-semantics)
- [Static `x-opencode-session` header caveat](#static-x-opencode-session-header-caveat)
- [Uninstall and rollback](#uninstall-and-rollback)
- [Verification status](#verification-status)
- [Known limitations and deferred work](#known-limitations-and-deferred-work)
- [Provenance and license](#provenance-and-license)

## Quick start

The `0.1.0` release is published on npm as
[`dsh-opencode-auto-review@0.1.0`](https://www.npmjs.com/package/dsh-opencode-auto-review).
Installation and effective composition are the verified path; the load/reselect step and a
full booted-profile launch are not covered by that evidence (see
[Verification status](#verification-status)).

Prerequisite: the official `@deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.2` bundle
layer must already be enabled in the profile and ordered before this package
([Installation](#installation) step 1). Without it the patch's disable entry only warns, and
the composition check below cannot pass.

```sh
# 1. Install the npm package into the target profile
dsh plugin --profile <profile> add dsh-opencode-auto-review@0.1.0

#    Offline alternative: install the same prebuilt artifact from its tarball
#    dsh plugin --profile <profile> add ./dsh-opencode-auto-review-0.1.0.tgz

# 2. Check the effective composition
dsh --profile <profile> --dump-config

# 3. Load the composition, then explicitly select Auto review again (Installation step 4)
```

`--dump-config` must show a disabled official `auto-review` row and exactly one active
`auto-review-opencode` row; see
[What a correct final composition looks like](#what-a-correct-final-composition-looks-like).
Installing a bundle layer never changes a live session's selected permission preset, so the
Auto review reselection in step 3 is an explicit user action; [Installation](#installation)
describes the stop / load / verify sequence.

## What breaks and why

Auto review sends its review request through the same LLM service as the conversation,
using the current route's provider and model. In the official `0.2.1-rc.2`
implementation, `classifyRisk()` builds a `deepFreeze()`-d `GenerateOptions` object that
contains the route, the fixed review policy, one review message, `temperature: 0` and the
abort signal — but no `sessionId`.

The pi-ai `1.1.0` OpenCode providers add `x-opencode-session` only when `sessionId` is
set and no same-named header is already configured. With no `sessionId` there is no
header, so the OpenCode gateway rejects the review request with `MissingSessionID`. Auto
review treats every technical reviewer failure as a closed gate, so the pending tool body
never executes:

```text
pending tool call enters Auto review
  -> reviewer request is built without sessionId
  -> pi-ai does not emit x-opencode-session
  -> the OpenCode gateway rejects the request with MissingSessionID
  -> the reviewer fails technically
  -> the review gate fails closed and the tool body never executes
```

The concrete effect in a session on the Auto permission preset with an OpenCode-routed
model is that tool calls are reviewed, rejected as technical failures, and never run.
Other provider routes are unaffected. The bug is in the reviewer request construction,
not in the provider configuration.

The fix is applied at that construction site rather than elsewhere because:

- the official request is `deepFreeze()`-d, so an `llm/stream` listener cannot modify the
  original object, and `next()` does not accept a replacement request;
- the `llm/stream` event does not expose the Agent whose tool is under review, so a
  process-wide "most recent session" guess would misroute concurrent sessions;
- the only correct identity is the reviewed Agent's own `agent.session.id`; no random,
  parent, prompt-derived or cached process-level ID is correct.

Runtime source replacement, service monkey-patching and global HTTP interception were
rejected for the same reasons: they guess at identity or rewrite shared machinery instead
of setting the field where it is known. This package therefore derives the official
implementation and adds the missing field directly.

## What this package changes

| Aspect | Official `0.2.1-rc.2` | This package |
| --- | --- | --- |
| Package | `@deepseek-ai/dsh-experimental-auto-review` | `dsh-opencode-auto-review` |
| Composition row | inserts `auto-review` | disables `auto-review`, inserts `auto-review-opencode` |
| Reviewer request | no `sessionId` | `sessionId: agent.session.id` in the frozen options |
| Source metadata | official provenance and `@module` | derived provenance and `@module dsh-opencode-auto-review` |
| Everything else | — | byte-identical to the fixed upstream commit |

`src/index.ts` differs from `packages/experimental/auto-review/src/index.ts` of
`dsh-v0.2.1-rc.2` (commit `687f282e8625c6b8d11ff58211a90524be2e4317`) in exactly three
places: a provenance header comment, the `@module` line, and the single added
`sessionId` line. The parity diff is recorded in [VERIFICATION.md](VERIFICATION.md).

The Cordis diagnostic plugin name is left as upstream's `experimental-auto-review` to
keep the derivation minimal; the composition row ID (`auto-review-opencode`) and the
package name (`dsh-opencode-auto-review`) are what distinguish this layer in
configuration.

The bundle patch replaces the official row with two distinct row IDs:

```yaml
- id: auto-review
  name: '@deepseek-ai/dsh-experimental-auto-review'
  disabled: true

- insert:
    - id: auto-review-opencode
      name: dsh-opencode-auto-review
```

Two distinct row IDs are required. Setting a new `name` on the existing `auto-review`
row cannot replace the official plugin (the patch `name` field validates the row's
existing plugin name), and inserting another row with the same ID does not override the
existing one.

## What this package preserves

Review behavior is the official `0.2.1-rc.2` implementation unchanged:

- the fixed `REVIEW_POLICY` text and the five-section review input: policy, cwd-only
  environment, sourced project instructions, filtered sourced history, and the complete
  pending action;
- the low / medium / high risk rules, the exact session-created-object cleanup
  exception, authorization rules, and fail-closed handling of ambiguous effects or
  unresolved authorization conflicts;
- the strict JSON risk/decision protocol: one text object, duplicate-member detection,
  allowed risk/decision combinations, optional deny reason, and rejection of malformed,
  truncated or over-long responses;
- the prepended `tools/pre-execute` listener and its approval precedence: under the
  `never` approval policy a reviewer denial is final; under `ask` a denial is raised to
  the user only when every later listener allows the call, so a later denial, cancel or
  ask wins;
- native and PTC inner reviews, each started inner call reviewed once, with the outer
  `run_code` transport excluded;
- technical failures fail closed with a specific error
  (`Auto review of tool "<name>" failed; its body was not executed: <error>`) and never
  execute the tool body;
- cancellation and disposal: the execution signal is combined with the lifecycle
  signal; unload stops accepting new reviews, migrates live Auto sessions to
  `danger-full-access`, then aborts and drains in-flight reviews before the listener and
  preset contribution are withdrawn;
- the same required injections (`approval`, `llm`, `permissionPresets`, `sessions`,
  `tools`, `workingDirectory`), the same single `ctx.effect` registration, and the same
  failure if a second Auto provider registers;
- no new configuration options, no new session events, no UI, and no change to the
  model-visible prompt.

See the official Auto review README shipped with
`@deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.2` (in the DSH repository under
`packages/experimental/auto-review/README.md`) for the full behavior description; that
text applies verbatim to this package.

## Version support

| Item | Required version |
| --- | --- |
| DSH runtime | `0.2.1-rc.2` exactly; enforced by the pinned peers below, not by `engines.dsh` |
| Declared compatibility | `engines.dsh: "0.2.1-rc.2"` — author-declared SemVer metadata; current DSH installers and loaders do not enforce it |
| Adapter | `@deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.2` |
| pi-ai | `@earendil-works/pi-ai@1.1.0` (with the DSH repository patch) |
| Cordis | `@deepseek-ai/cordis@4.0.5` |
| Node.js | `>=22.19.0` (`engines.node`) |

Version support is written down in two independent places, and only one of them is
enforced:

- `engines.dsh: "0.2.1-rc.2"` is author-declared metadata. DSH defines the field as a
  SemVer range of compatible hosts, but its current installers and loaders do not enforce
  `engines.dsh` or validate its syntax; a mismatch there does not reject a host.
- The `peerDependencies` are the effective gate. The `@deepseek-ai/dsh-*` service packages
  that must share the host's instances are pinned to `0.2.1-rc.2` (Cordis is a peer pinned
  to `4.0.5`). Before a profile imports a plugin, DSH compares every declared
  `@deepseek-ai/dsh`/`@deepseek-ai/dsh-*` peer range with the single runtime version it
  reports (`getDshRuntimeVersion()`); every range must match and prereleases participate
  in range matching, so these exact prerelease pins accept only DSH `0.2.1-rc.2`. On a
  mismatch the profile disables the row with an incompatibility diagnostic instead of
  loading it (an operator can still grant an explicit exact-version exemption).

The only regular runtime dependency is `@deepseek-ai/dsh-util-values@0.2.1-rc.2`. The
remaining `@deepseek-ai/*` packages appear only in `devDependencies` for typechecking,
tests and the build. The build marks `@deepseek-ai/*` as external, so the host's Cordis and
service instances are shared, not duplicated.

There is intentionally no broad compatibility range for the first release — neither in
`engines.dsh` nor in the peer pins. The fix depends on both the exact
`GenerateOptions`/adapter behavior and the exact reviewer implementation of the target
release. Widening the claim means widening the peer ranges and re-running the parity and
transport checks; editing `engines.dsh` alone cannot widen it, because DSH does not enforce
that field. When upstream ships an official fix that carries the reviewer session
identity, upgrade and re-verify before removing this package (see
[UPSTREAM.md](UPSTREAM.md)).

The four OpenCode `opencode` chat APIs covered by dynamic transport acceptance are recorded
as PASS in [VERIFICATION.md](VERIFICATION.md) (D2/D4); the `opencode-go` routes are excluded
from the first-release support claim because there is no real-gateway acceptance for them.

## Installation

Prerequisites:

- use the DSH CLI from the **same** DSH `0.2.1-rc.2` installation and the **same**
  `DSH_HOME` as the Desktop or Web UI you want to change; installing into another
  `DSH_HOME` or profile does not affect the running window;
- confirm the CLI version matches the target release (`dsh --version` should report
  `0.2.1-rc.2`); a different runtime gets the row disabled by the pinned-peer check at
  profile load with an incompatibility diagnostic, and `engines.dsh` does not enforce a
  mismatch;
- the official Auto review bundle layer for `0.2.1-rc.2` must be enabled and appear
  **before** this package's bundle layer in the profile's ordered bundle list. The
  shipped DSH installation contains the layer but leaves it switched off; adding it to
  the profile enables it.

Step 1 — make sure the official layer is present. Skip this step if the profile's
effective composition already contains the official `auto-review` row (for example
because it was enabled from the Web sidebar's Plugins page):

```sh
dsh plugin --profile <profile> add @deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.2
```

Step 2 — add this package. The standard path is the npm registry package; the prebuilt
tarball is the same artifact for offline or air-gapped profiles (no build step, no
developer source path in either case):

```sh
# From the npm registry (recommended; the package is published at 0.1.0)
dsh plugin --profile <profile> add dsh-opencode-auto-review@0.1.0

# Or from the release tarball, when the registry is not reachable
dsh plugin --profile <profile> add ./dsh-opencode-auto-review-0.1.0.tgz
```

The registry package and the tarball are the same published artifact (27,545 B, SHA-256
`63A76209BFED6B5614B5F5453DEE58713BF4BD0EC73683D275E784659D93A29C`). If you only need the
package as a dependency in another project, `npm install dsh-opencode-auto-review@0.1.0`
installs that same prebuilt package. Do not substitute a git checkout: `lib/` is gitignored
and the package has no `prepare`/`install` build hook, so a source install has no built
entry point.

Step 3 — inspect the effective composition, not just the bundle list:

```sh
dsh --profile <profile> --dump-config
```

Step 4 — apply the configuration to the running UI. Installing or removing a bundle layer
does not change a live session's selected permission preset: stop the current turn, keep
the session in an appropriate non-Auto mode while loading and verifying the composition,
then explicitly select Auto review again. For acceptance testing, use a separate test
profile.

If the official layer is missing, the disable entry in this package's patch only warns
and is skipped; the profile may still load, but it is not the standard, accepted
installation described above.

## What a correct final composition looks like

`dsh --profile <profile> --dump-config` must show, in semantic terms (formatting depends
on the CLI version):

| Row | Plugin | Required state |
| --- | --- | --- |
| `auto-review` | `@deepseek-ai/dsh-experimental-auto-review` | present with `disabled: true` |
| `auto-review-opencode` | `dsh-opencode-auto-review` | present and active (no `disabled`) |
| any other row | either plugin | must not be active |

In other words:

- the official row stays installed but disabled;
- exactly one active `auto-review-opencode` row points at `dsh-opencode-auto-review`;
- no other active row mounts the official implementation or this package, and therefore
  only one Auto preset provider and one review listener exist.

Configuration layers apply in order: the profile's ordered bundle list, the profile's own
patch, the home patch, and the command-line overlay. A later layer can re-enable the
official row or disable this package, so the final composition must always be checked;
the bundle list alone is not sufficient. If both implementations load, duplicate Auto
registration fails explicitly (`registerAuto()` throws) instead of being silently
swallowed.

## Session identity semantics

The reviewer request carries the session ID of the Agent that owns the pending tool call.
It is stamped at request construction, so every reviewer route gets the same correct
identity without provider-specific branching.

| Call source | Reviewer session identity |
| --- | --- |
| Main agent native tool call | the main agent's `agent.session.id` |
| Another concurrent main session | that session's own ID (no cross-session leakage) |
| In-process subagent tool call | the subagent's own `agent.session.id`, never the parent's ID |
| Parent agent initiating out-of-process delegation | the parent's ID for the delegation call; the external child keeps its own permission system and does not use the parent's Auto reviewer |

No random ID is generated, no parent ID substitutes for a child ID, no ID is extracted
from the prompt, and no process-level session identity is cached. The identity is
model-invisible transport metadata; the reviewer prompt content is unchanged.

## Static `x-opencode-session` header caveat

pi-ai `1.1.0` only adds `x-opencode-session` when no header with the same name already
exists, comparing header names case-insensitively. Any explicitly configured
`x-opencode-session` header — including `X-OpenCode-Session` or another differently cased
spelling — therefore wins over the dynamically generated per-session value and is sent
unchanged.

If a static header was configured as an emergency workaround for this bug, it will pin
every review to one conversation ID and defeat the per-session identity fix. Before
dynamic acceptance:

1. inspect the provider configuration for a same-named header in any letter case;
2. remove it (this package never edits provider configuration on your behalf);
3. re-run the acceptance with two concurrent sessions and confirm each review request
   reaches the gateway with its own session ID.

The upstream priority rule (explicit header wins) is unchanged and is verified at transport
level by item D5 in [VERIFICATION.md](VERIFICATION.md); the remaining confirmation is the
real OpenCode gateway acceptance (E2), which is not completed.

## Uninstall and rollback

Remove this package's layer:

```sh
dsh plugin --profile <profile> remove dsh-opencode-auto-review
dsh --profile <profile> --dump-config
```

What happens, and what does not:

- the bundle layer is removed and configuration recomputation restores the official
  `auto-review` row's previous setting (this package only disabled it);
- unloading runs the official disposal behavior preserved by this package: selection and
  review admission close first, every session currently on the Auto preset is migrated to
  `danger-full-access` with the `never` approval policy written through the Session
  writer, then in-flight reviews are aborted and awaited before the listener and preset
  contribution are withdrawn. The sandbox value and persistent terminals survive the
  migration. The model sees the new policy in the next runtime-context snapshot; no
  policy-change notice is queued;
- live sessions are **not** switched back to Auto automatically, and reinstalling the
  layer restores the option but does not move live sessions back either. Selecting Auto
  again after a reinstall is an explicit user action;
- removing this package restores the official implementation, so the original OpenCode
  defect returns: OpenCode-routed reviewer requests carry no `sessionId`, the gateway
  rejects them with `MissingSessionID`, and the review gate fails closed. Rollback is a
  return to baseline, not a working OpenCode review path.

If the official layer was added only for this package and Auto review is no longer
wanted, remove it as well:

```sh
dsh plugin --profile <profile> remove @deepseek-ai/dsh-experimental-auto-review
```

Permission-mode migration is never silent or seamless: confirm the current session's
permission mode and approval policy after install, hot-swap, uninstall or rollback.

## Verification status

The evidence record is [VERIFICATION.md](VERIFICATION.md), in the repository checkout
alongside this README (files listed in the published manifest are the tarball contents;
the repository additionally contains the design spec, tests and verification record).
That record lists each acceptance check with the command or artifact that evidences it,
and marks checks without captured evidence as `NOT COMPLETED`. This README claims no
check that the record does not evidence; anything not marked `PASS` there should be
treated as unverified.

## Known limitations and deferred work

This release deliberately does not add:

- a model adapter or a separate reviewer model — the reviewer uses the current agent's
  provider and model and the shipped adapter's defaults;
- a retry, backoff or fallback layer — one extra reviewer request per supported call,
  and an oversized or failing request fails the call closed;
- configurable policy, deterministic tool exemptions or persistent grants;
- a UI panel, new permission modes, or new session events;
- prompt-visible session identity — `sessionId` is transport metadata only, so the
  reviewer cannot reason about which session it is reviewing;
- a file sandbox: the outer `run_code` transport and direct Node effects inside a PTC
  program do not pass through inner-tool review;
- any change to provider configuration, including the static header workaround removal
  described above;
- support for any DSH release other than `0.2.1-rc.2`.

Inherited official limitations still apply: model classification can be wrong (Auto may
allow unsafe actions, deny useful work, and spend additional tokens); out-of-process
subagents retain their own permission systems after the parent delegation call is
allowed; the reviewer reads session action history through the deprecated synchronous
`snapshotEvents()` reader. This package also only addresses the `MissingSessionID`
failure caused by the missing reviewer `sessionId`; other gateway or provider rejections
are out of scope.

## Provenance and license

This package is released under the [MIT License](LICENSE), Copyright (c) 2026 Dr.Scorpio.

It is derived from `@deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.2`,
deepseek-ai/deepseek-harness commit `687f282e8625c6b8d11ff58211a90524be2e4317`, MIT,
Copyright (c) 2026 DeepSeek. The third-party notice for the derived portions is included
in [LICENSE](LICENSE) below the MIT text. The exact upstream paths, file hashes, derivation
changes and re-derivation commands are in [UPSTREAM.md](UPSTREAM.md).

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
