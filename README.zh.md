# dsh-opencode-auto-review

[English](README.md) | 中文

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/dsh-opencode-auto-review.svg)](https://www.npmjs.com/package/dsh-opencode-auto-review)
[![DSH 0.2.1-rc.2](https://img.shields.io/badge/DSH-0.2.1--rc.2-blue.svg)](https://github.com/deepseek-ai/deepseek-harness)
[![Node.js >=22.19.0](https://img.shields.io/badge/Node.js-%3E%3D22.19.0-brightgreen.svg)](https://nodejs.org)

让 DSH Auto review 在 DSH `0.2.1-rc.2` 上通过 OpenCode 网关正常工作。

`dsh-opencode-auto-review@0.1.0` 是官方 `@deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.2` 组合包的最小独立派生。它只改变一个行为：冻结的 reviewer 请求现在携带 `sessionId: agent.session.id`，使 pi-ai 的 OpenCode 提供方能够发出必需的 `x-opencode-session` 请求头。其余全部——审查策略、五段输入、风险规则、JSON 协议、审批优先级、PTC 处理、取消与卸载——都保持官方实现不变。

> **版本支持。** 首版面向精确的 DSH `0.2.1-rc.2`，配套适配器 `@deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.2` 与 pi-ai `@earendil-works/pi-ai@1.1.0`。`engines.dsh: "0.2.1-rc.2"` 只是声明目标版本——当前 DSH 安装器与加载器并不强制校验它。真正生效的是包内以 `0.2.1-rc.2` 精确锁定的 `@deepseek-ai/dsh-*` 服务包 `peerDependencies`：DSH 会在加载 profile 前把这些范围与运行版本比对，因此其他 DSH 版本会以不兼容诊断被拒绝加载，而不只是「不建议安装」。要扩大支持范围，必须同时放宽 peer 范围并重跑 [UPSTREAM.md](UPSTREAM.md) 与 [VERIFICATION.md](VERIFICATION.md) 记录的一致性对照和传输验证；只改 `engines.dsh` 不会产生任何运行时效果。

## 目录

- [快速开始](#快速开始)
- [故障原因](#故障原因)
- [本包的改动](#本包的改动)
- [本包保留的行为](#本包保留的行为)
- [版本支持](#版本支持)
- [安装](#安装)
- [正确的最终组合](#正确的最终组合)
- [会话身份语义](#会话身份语义)
- [静态 x-opencode-session 请求头注意事项](#静态-x-opencode-session-请求头注意事项)
- [卸载与回退](#卸载与回退)
- [验证状态](#验证状态)
- [已知限制与延期工作](#已知限制与延期工作)
- [来源与许可证](#来源与许可证)

## 快速开始

`0.1.0` 发布物已发布到 npm：[`dsh-opencode-auto-review@0.1.0`](https://www.npmjs.com/package/dsh-opencode-auto-review)。安装与生效组合是经过验证的路径；加载/重选步骤与完整 profile 启动不在该证据范围内（见[验证状态](#验证状态)）。

前置条件：官方 `@deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.2` 组合层必须已在该 profile 中启用，
并且在有序 bundle 列表中位于本包之前（[安装](#安装)步骤 1）。缺少该层时，本包 patch 的停用条目只会告警，
下面的组合检查也无法通过。

```sh
# 1. 从 npm registry 安装到目标 profile
dsh plugin --profile <profile> add dsh-opencode-auto-review@0.1.0

#    离线备选：从同一个预构建产物（tarball）安装
#    dsh plugin --profile <profile> add ./dsh-opencode-auto-review-0.1.0.tgz

# 2. 检查生效组合
dsh --profile <profile> --dump-config

# 3. 按安装步骤 4 加载组合，然后重新显式选择 Auto review
```

`--dump-config` 必须显示官方 `auto-review` 行已被停用，且恰好只有一行有效的
`auto-review-opencode`；参见[正确的最终组合](#正确的最终组合)。安装组合层从不改变存活会话已选的权限预设，
因此第 3 步重新选择 Auto review 是用户的显式操作；停止轮次、加载与确认顺序见[安装](#安装)。

## 故障原因

Auto review 通过与对话相同的 LLM 服务发送审查请求，使用当前路由的 provider 和模型。官方 `0.2.1-rc.2` 实现的 `classifyRisk()` 构造一个经过 `deepFreeze()` 的 `GenerateOptions` 对象，其中包含路由、固定审查策略、一条审查消息、`temperature: 0` 和取消信号，但不包含 `sessionId`。

pi-ai `1.1.0` 的 OpenCode 提供方只在 `sessionId` 非空且不存在同名请求头时才添加 `x-opencode-session`。没有 `sessionId` 就没有该请求头，OpenCode 网关以 `MissingSessionID` 拒绝审查请求。Auto review 把一切审查器技术失败视为关闭闸门，因此待审工具正文不会执行：

```text
待审工具调用进入 Auto review
  -> reviewer 请求未携带 sessionId
  -> pi-ai 不生成 x-opencode-session
  -> OpenCode 网关以 MissingSessionID 拒绝请求
  -> reviewer 技术失败
  -> 审查闸门关闭，工具正文不执行
```

实际后果是：在 Auto 权限预设下使用 OpenCode 路由模型的会话里，工具调用会被审查、以技术失败被拒绝，并且永不执行。其他 provider 路由不受影响。缺陷位于 reviewer 请求的构造处，而非 provider 配置。

选择在该构造处修复，是因为：

- 官方请求已被 `deepFreeze()`，`llm/stream` 监听器无法修改原对象，`next()` 也不接受替换后的请求；
- `llm/stream` 事件没有暴露待审工具所属的 Agent，按进程级「最近会话」推断会在并发会话中串号；
- 唯一正确的身份是被审 Agent 自己的 `agent.session.id`；随机 ID、父 ID、从提示词提取的 ID 或进程级缓存 ID 都不正确。

因此本包没有采用运行时源码替换、服务方法 monkey patch 或全局 HTTP 拦截——它们要么在猜测身份，要么在改写共享机制，而不是在已知身份的位置直接写入该字段。本包改为派生官方实现，直接补上缺失字段。

## 本包的改动

| 方面 | 官方 `0.2.1-rc.2` | 本包 |
| --- | --- | --- |
| 包名 | `@deepseek-ai/dsh-experimental-auto-review` | `dsh-opencode-auto-review` |
| 组合行 | 插入 `auto-review` | 停用 `auto-review`，插入 `auto-review-opencode` |
| reviewer 请求 | 无 `sessionId` | 冻结选项中含 `sessionId: agent.session.id` |
| 源码元数据 | 官方来源与 `@module` | 派生来源与 `@module dsh-opencode-auto-review` |
| 其余部分 | — | 与固定上游提交逐字节一致 |

`src/index.ts` 与 `dsh-v0.2.1-rc.2`（提交 `687f282e8625c6b8d11ff58211a90524be2e4317`）的 `packages/experimental/auto-review/src/index.ts` 恰好有三处差异：新增来源说明头注释、修改 `@module` 行、新增唯一一行 `sessionId`。一致性 diff 记录在 [VERIFICATION.md](VERIFICATION.md)。

为保持最小派生，Cordis 诊断插件名沿用上游的 `experimental-auto-review`；配置中通过组合行 ID（`auto-review-opencode`）和包名（`dsh-opencode-auto-review`）区分本层。

发布包通过两个不同行 ID 的组合 patch 接替官方行：

```yaml
- id: auto-review
  name: '@deepseek-ai/dsh-experimental-auto-review'
  disabled: true

- insert:
    - id: auto-review-opencode
      name: dsh-opencode-auto-review
```

必须使用两个不同的行 ID。对既有 `auto-review` 行设置新 `name` 不能替换官方插件（patch 的 `name` 字段只校验行内既有插件名），再次插入同 ID 行也不会覆盖既有行。

## 本包保留的行为

审查行为就是官方 `0.2.1-rc.2` 实现，未作改动：

- 固定的 `REVIEW_POLICY` 文本，以及五段审查输入：策略、仅 cwd 的环境、带来源的项目约束、过滤后带来源的历史、完整待审动作；
- low / medium / high 风险规则、仅限本 Session 创建对象的精确清理例外、授权规则，以及效果不明确或授权冲突未解决时失败即拒绝的处理；
- 严格 JSON 风险/决策协议：单个 JSON 文本对象、重复成员检测、合法的 risk/decision 组合、可选 deny 理由，以及拒绝格式错误、截断或超长响应；
- 置前的 `tools/pre-execute` 监听器及其审批优先级：`never` 审批策略下 reviewer 拒绝为最终结果；`ask` 下只有在后续所有监听器均放行时才升级为用户审批，因此后续的拒绝、取消或 ask 优先；
- native 与 PTC inner 审查，每个已开始的 inner 调用审查一次，外层 `run_code` transport 排除在外；
- 技术失败关闭闸门，返回具体错误（`Auto review of tool "<name>" failed; its body was not executed: <error>`），且从不执行工具正文；
- 取消与卸载：执行信号与生命周期信号组合；卸载时先停止接收新审查，将存活的 Auto 会话迁移到 `danger-full-access`，再中止并等待在途审查结清，最后撤回监听器与 preset contribution；
- 相同的必需注入（`approval`、`llm`、`permissionPresets`、`sessions`、`tools`、`workingDirectory`）、同一个 `ctx.effect` 注册，以及第二个 Auto 提供方注册时同样失败；
- 不新增配置项、不新增会话事件、无 UI，也不改变模型可见的提示词。

完整行为描述见官方 Auto review README（随 `@deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.2` 发布，位于 DSH 仓库 `packages/experimental/auto-review/README.md`），该描述对本包同样适用。

## 版本支持

| 项目 | 必需版本 |
| --- | --- |
| DSH 运行时 | 精确 `0.2.1-rc.2`；由下方锁定的 peer 强制，而非 `engines.dsh` |
| 兼容性声明 | `engines.dsh: "0.2.1-rc.2"`——仅作者声明的 SemVer 元数据；当前 DSH 安装器与加载器不强制校验 |
| 适配器 | `@deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.2` |
| pi-ai | `@earendil-works/pi-ai@1.1.0`（含 DSH 仓库补丁） |
| Cordis | `@deepseek-ai/cordis@4.0.5` |
| Node.js | `>=22.19.0`（`engines.node`） |

版本支持分散在两个相互独立的位置，其中只有一处会被 DSH 强制校验：

- `engines.dsh: "0.2.1-rc.2"` 是作者声明的元数据。DSH 把该字段定义为「兼容宿主版本」的 SemVer 范围，但当前安装器与加载器既不强制校验 `engines.dsh`，也不校验其语法；这里不匹配不会拒绝宿主。
- `peerDependencies` 才是真正生效的闸门。需要在宿主中共享实例的 `@deepseek-ai/dsh-*` 服务包都以 `0.2.1-rc.2` 固定（Cordis 固定在 `4.0.5`）。profile 导入插件前，DSH 会把每个声明的 `@deepseek-ai/dsh`/`@deepseek-ai/dsh-*` peer 范围与运行时报告的单一版本（`getDshRuntimeVersion()`）比对；所有范围都必须匹配，且预发布版本参与范围匹配，因此这些精确的预发布锁定只接受 DSH `0.2.1-rc.2`。不匹配时 profile 会在加载前停用该行并给出不兼容诊断（运维仍可显式授予精确版本豁免）。

唯一常规运行时依赖是 `@deepseek-ai/dsh-util-values@0.2.1-rc.2`。其余 `@deepseek-ai/*` 包只出现在 `devDependencies` 中，供类型检查、测试与构建使用。构建把 `@deepseek-ai/*` 标记为 external，共享宿主的 Cordis 与服务实例，不会打入私有副本。

首版有意不声明宽泛兼容区间——`engines.dsh` 与 peer 锁定都不放宽。修复同时依赖精确的 `GenerateOptions`/适配器行为和精确的 reviewer 实现。要扩大支持声明，必须同时放宽 peer 范围并重跑一致性对照与传输验证；只改 `engines.dsh` 无法扩大支持，因为 DSH 不强制该字段。上游若发布携带 reviewer 会话身份的正式修复，届时先升级并重新验证，再移除本包（见 [UPSTREAM.md](UPSTREAM.md)）。

动态传输验收覆盖的四个 OpenCode `opencode` 聊天 API 已在 [VERIFICATION.md](VERIFICATION.md) 中记录为 PASS（D2/D4）；`opencode-go` 路由因没有真实网关验收而排除在首版支持声明之外。

## 安装

前置条件：

- 使用与要修改的 Desktop 或 Web UI **相同**的 DSH `0.2.1-rc.2` 安装所提供的 CLI，并指向**同一个** `DSH_HOME`；安装到其他 `DSH_HOME` 或 profile 不会改变当前窗口；
- 确认 CLI 版本与目标版本一致（`dsh --version` 应报告 `0.2.1-rc.2`）；版本不一致时该行会在 profile 加载阶段被锁定的 peer 校验停用并给出不兼容诊断，`engines.dsh` 并不会拦截；
- 官方 `0.2.1-rc.2` Auto review 组合层必须已启用，并且在 profile 的有序 bundle 列表中位于本包组合层**之前**。DSH 安装随附该层但默认关闭，将其加入 profile 即启用。

步骤 1 —— 确认官方层存在。如果 profile 的最终组合中已包含官方 `auto-review` 行（例如已在 Web 侧栏插件页开启），跳过此步：

```sh
dsh plugin --profile <profile> add @deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.2
```

步骤 2 —— 安装本包。标准路径是 npm registry 包；预构建 tarball 是同一产物，供离线或内网 profile 使用（两者都无需构建，也不依赖开发者源码路径）：

```sh
# 从 npm registry 安装（推荐；当前发布版本为 0.1.0）
dsh plugin --profile <profile> add dsh-opencode-auto-review@0.1.0

# 或从发布 tarball 安装（registry 不可达时使用）
dsh plugin --profile <profile> add ./dsh-opencode-auto-review-0.1.0.tgz
```

registry 包与 tarball 是同一个已发布产物（27,545 B，SHA-256 `63A76209BFED6B5614B5F5453DEE58713BF4BD0EC73683D275E784659D93A29C`）。如果只是需要在其他项目中把它作为依赖使用，`npm install dsh-opencode-auto-review@0.1.0` 安装的也是同一个预构建包。不要改用 git 检出：`lib/` 已被 gitignore，且包内没有 `prepare`/`install` 构建钩子，源码安装不会得到已构建的入口。

步骤 3 —— 检查生效组合，而不只是 bundle 列表：

```sh
dsh --profile <profile> --dump-config
```

步骤 4 —— 让配置作用于运行中的 UI：安装或移除组合层不会改变存活会话已选的权限预设；停止当前轮次，在加载与确认组合期间保持会话处于合适的非 Auto 模式，确认组合后显式重新选择 Auto review。验收测试请使用独立测试 profile。

如果官方层缺失，本包 patch 中的停用条目只会告警并跳过；profile 可能仍能加载，但不属于上述标准验收安装。

## 正确的最终组合

`dsh --profile <profile> --dump-config` 在语义上必须显示（具体格式随 CLI 版本而定）：

| 行 | 插件 | 必需状态 |
| --- | --- | --- |
| `auto-review` | `@deepseek-ai/dsh-experimental-auto-review` | 存在，且 `disabled: true` |
| `auto-review-opencode` | `dsh-opencode-auto-review` | 存在且有效（无 `disabled`） |
| 其他任何行 | 上述任一插件 | 不得有效 |

也就是说：

- 官方行保留安装但被停用；
- 恰好有一个有效的 `auto-review-opencode` 行指向 `dsh-opencode-auto-review`；
- 不得有其他有效行挂载官方实现或本包，从而只有一个 Auto preset 提供方和一套审查监听器。

配置层按顺序生效：profile 的有序 bundle 列表、profile 自身 patch、home patch、命令行 overlay。后面的层可能重新启用官方行或停用本包，因此必须检查最终组合；只看 bundle 列表不够。若两套实现同时加载，重复 Auto 注册会明确失败（`registerAuto()` 抛错），不会被静默吞掉。

## 会话身份语义

reviewer 请求携带待审工具所属 Agent 的会话 ID，在构造请求时写入，因此所有 reviewer 路由都得到同一正确身份，无需按 provider 名分支。

| 调用来源 | reviewer 会话身份 |
| --- | --- |
| 主代理 native 工具调用 | 主代理的 `agent.session.id` |
| 并发的另一主会话 | 该会话自己的 ID（不会串会话） |
| 进程内子代理工具调用 | 子代理自己的 `agent.session.id`，绝不使用父代理 ID |
| 父代理发起进程外委派 | 委派调用使用父代理 ID；外部子进程保留自身权限系统，不使用父代理的 Auto reviewer |

不生成随机 ID，不用父会话 ID 替代子会话 ID，不从提示词提取 ID，也不缓存进程级会话身份。该身份是对模型不可见的传输元数据，reviewer 提示词内容不变。

## 静态 x-opencode-session 请求头注意事项

pi-ai `1.1.0` 只在不存在同名请求头（名称比较不区分大小写）时才添加 `x-opencode-session`。因此任何显式配置的 `x-opencode-session` 头——包括 `X-OpenCode-Session` 或其他大小写写法——都会优先于动态生成的每会话值，并被原样发送。

如果曾用静态请求头作为本缺陷的应急规避，它会把所有审查固定到同一个会话 ID，使按会话修复失效。动态验收前请：

1. 检查 provider 配置中是否存在任意大小写的同名请求头；
2. 移除它（本包不会代你修改 provider 配置）；
3. 用两个并发会话重跑验收，确认每个审查请求都以自己的会话 ID 到达网关。

上游「显式请求头优先」的规则未被改变，并已由 [VERIFICATION.md](VERIFICATION.md) 中的 D5 项在传输层验证；剩余确认为真实 OpenCode 网关验收（E2），尚未完成。

## 卸载与回退

移除本包层：

```sh
dsh plugin --profile <profile> remove dsh-opencode-auto-review
dsh --profile <profile> --dump-config
```

会发生与不会发生的事：

- 移除组合层后，配置重算会恢复官方 `auto-review` 行此前的设置（本包只是停用了它）；
- 卸载会执行本包保留的官方清理行为：先关闭选择与 review admission，将所有仍处于 Auto 预设的会话迁移到 `danger-full-access`，并通过 Session writer 写入 `never` 审批策略；随后中止并等待在途审查结清，再撤回监听器与 preset contribution。沙箱值与持久终端在迁移中保持不变。模型在下一次 runtime-context 快照中看到新策略；不会排入策略变更通知；
- 存活会话**不会**自动切回 Auto；重装本层只恢复该选项，也不会把存活会话切回。重装后重新选择 Auto 是用户的显式操作；
- 移除本包会恢复官方实现，因此 OpenCode 的原始缺陷随之恢复：OpenCode 路由的 reviewer 请求不带 `sessionId`，网关以 `MissingSessionID` 拒绝，审查闸门关闭。回退只是回到基线，不代表 OpenCode 审查继续可用。

如果官方层只是为本包而添加、且不再需要 Auto review，可一并移除：

```sh
dsh plugin --profile <profile> remove @deepseek-ai/dsh-experimental-auto-review
```

权限模式迁移从来不是静默或无缝的：在安装、热替换、卸载或回退之后，都要确认当前会话的权限模式与审批策略。

## 验证状态

证据记录见 [VERIFICATION.md](VERIFICATION.md)，它与本 README 一起位于仓库检出中（发布清单列出的文件才是 tarball 内容；仓库还会包含设计文档、测试与验证记录）。该记录逐项列出验收检查、对应命令或产物证据，并把没有捕获证据的检查标记为 `NOT COMPLETED`。本 README 不声称任何该记录未证明通过的检查；记录中未标为 `PASS` 的项目都应视为未验证。

## 已知限制与延期工作

本版有意不增加：

- 模型适配器或独立 reviewer 模型——reviewer 使用当前 agent 的 provider 与模型以及随附适配器默认值；
- 重试、退避或回退层——每个受支持调用一次额外 reviewer 请求，超长或失败的请求使调用失败即拒绝；
- 可配置策略、确定性工具豁免或持久授权；
- UI 面板、新权限模式或新会话事件；
- 提示词可见的会话身份——`sessionId` 只是传输元数据，reviewer 无法据此判断自己在审查哪个会话；
- 文件沙箱：外层 `run_code` transport 与 PTC 程序内直接 Node 效果不经过 inner-tool review；
- 对 provider 配置的任何修改，包括上文所述移除静态请求头的操作；
- 对 `0.2.1-rc.2` 以外任何 DSH 版本的支持。

官方固有限制同样适用：模型分类可能出错（Auto 可能放行不安全动作、拒绝有用工作并消耗额外 token）；进程外子代理在父委派调用获准后保留自身权限系统；reviewer 通过已废弃的同步 `snapshotEvents()` 读取会话动作历史。本包只处理 reviewer 缺少 `sessionId` 导致的 `MissingSessionID`；其他网关或 provider 拒绝不在范围内。

## 来源与许可证

本包以 [MIT 许可证](LICENSE)发布，Copyright (c) 2026 Dr.Scorpio。

派生自 `@deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.2`，deepseek-ai/deepseek-harness 提交
`687f282e8625c6b8d11ff58211a90524be2e4317`，MIT，Copyright (c) 2026 DeepSeek。派生内容的第三方声明
位于 [LICENSE](LICENSE) 中 MIT 文本之后。确切的上游路径、文件哈希、派生变更和重新派生命令见
[UPSTREAM.md](UPSTREAM.md)。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
