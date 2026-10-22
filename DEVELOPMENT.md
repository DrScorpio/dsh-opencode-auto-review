# OpenCode Auto Review 兼容插件开发文档

文档日期：2026-10-21  
项目：`dsh-opencode-auto-review`
目标 DSH 版本：`0.2.1-rc.2`  
状态：开发设计，代码实现与验收尚未完成。

## 1. 目标与验收结果

交付一个可独立安装的 DSH 组合包，使官方 Auto review 的审查请求能够通过 OpenCode 网关的会话身份校验。

插件基于官方目标版本的 auto-review 做最小派生，补充 reviewer 请求的 `sessionId`，通过 profile 配置层接替官方实现。完成后应满足：

- OpenCode reviewer 请求的 `x-opencode-session` 等于待审工具所属 Agent 的会话 ID。
- 主会话、并发会话、进程内子会话使用各自的 ID。
- 审查策略、权限判定、人工审批、PTC、取消和卸载行为与目标版本官方实现一致。
- 最终组合中只有一个 Auto preset 提供方和一套有效的审查监听器。
- 可通过预构建 `.tgz` 安装到目标版本的 profile，无需修改 Desktop 的 `app.asar`。

本期不增加模型适配器、独立 reviewer 模型、重试层、策略配置、工具豁免、UI 面板或新的会话事件；不修改官方安装目录，不向模型提示词添加会话身份。

## 2. 固定版本与证据基线

| 项目 | 固定值 |
| --- | --- |
| DSH 标签 | `dsh-v0.2.1-rc.2` |
| DSH 提交 | `687f282e8625c6b8d11ff58211a90524be2e4317` |
| 官方插件 | `@deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.2` |
| 适配器 | `@deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.2` |
| pi-ai 锁文件版本 | `@earendil-works/pi-ai@1.1.0`，含 DSH 仓库补丁 |
| Cordis 基线 | `@deepseek-ai/cordis@4.0.5` |
| 拟定插件首版 | `dsh-opencode-auto-review@0.1.0` |

前期核对使用的本地 DSH 源码工作树停在旧版本；本项目应读取上述标签或提交，不能直接复制该工作树的当前文件。此前关于 pi-ai `0.87.1` 的说明不作为目标版本依赖依据。

以下路径均相对于固定提交的 DSH 仓库根目录：

| 证据位置 | 核实结论 |
| --- | --- |
| `packages/experimental/auto-review/src/index.ts` | `classifyRisk()` 接收 `agent`；构造冻结的请求，但未设置 `sessionId` |
| `packages/llm/llm/src/types.ts` | `GenerateOptions.sessionId` 已有定义，是请求路由使用的模型不可见传输元数据 |
| `packages/llm/llm-pi-ai/src/adapter.ts` | 已将 `options.sessionId` 转为字符串传给 `streamSimple()` |
| `docs/subsystems/llm-streaming.md` | 生成参考声明 `llm/stream` 的 `next()` 不接收替换请求参数 |
| `packages/experimental/auto-review/cordis.patch.yml` | 官方组合插入 `id: auto-review` 行 |
| `vendor/include/src/index.ts` | patch 的 `name` 校验现有插件名，不会替换插件名；未知目标会警告并跳过 |
| `packages/interaction/permission-presets/src/index.ts` | 重复 `registerAuto()` 会抛错 |
| `docs/user/develop/basic/publish.md` | 定义组合包、profile、依赖共享和配置层顺序 |

另已读取 npm 发布的 pi-ai `1.1.0` 包：`dist/providers/opencode-headers.js` 仅在 `sessionId` 非空且不存在显式同名头时添加 `x-opencode-session`；`dist/providers/opencode.js` 的四个聊天 API 使用此包装器。

据此，故障链为：

```text
工具调用进入 Auto review
  -> reviewer 请求缺少 sessionId
  -> pi-ai 未生成 x-opencode-session
  -> OpenCode 网关返回 MissingSessionID
  -> reviewer 技术失败
  -> 审查闸门关闭，工具正文不执行
```

## 3. 架构决策

### 3.1 最小派生官方插件

将目标提交的官方 auto-review 实现纳入本项目，保留上游来源和许可证，以新的包名发布。

该方案选择在请求构造位置修复问题。目标版本请求已经 `deepFreeze()`，普通 `llm/stream` 监听器无法修改原对象，`next()` 也不能接收克隆后的请求。此外，该事件没有提供待审 Agent 参数，不能依靠全局“最近会话”推断归属。

不采用运行时源码替换、服务方法 monkey patch、全局 HTTP 拦截或静态共享会话头。

### 3.2 唯一核心行为改动

在 `classifyRisk()` 的冻结请求中加入：

```ts
const options: GenerateOptions = deepFreeze({
  provider: snapshot.provider,
  model: snapshot.model,
  system: REVIEW_POLICY,
  messages: [{
    role: 'user',
    content: [{ type: 'text', text: reviewUserText(snapshot) }],
  }],
  temperature: 0,
  sessionId: agent.session.id,
  signal,
})
```

这一行对所有 reviewer 路由生效，不按 provider 名做分支。OpenCode 的协议头由已有适配器和 pi-ai 生成；其他提供方继续按各自适配器处理该字段。

会话归属规则：

| 调用来源 | reviewer 的会话身份 |
| --- | --- |
| 主代理工具调用 | 主代理 `agent.session.id` |
| 并发的另一主会话 | 该会话自己的 ID |
| 进程内子代理工具调用 | 子代理自己的 `agent.session.id` |
| 父代理发起进程外委派 | 父代理的 ID；外部子进程保留自身权限系统 |

不生成随机 ID，不使用父会话 ID 替代子会话 ID，不从 prompt 提取 ID，也不缓存进程级会话身份。

### 3.3 保留官方生命周期与语义

保留目标版本的：

- `name`、`inject`、`apply()` 插件形态；显示名称可调整为本插件名称。
- `approval`、`llm`、`permissionPresets`、`sessions`、`tools`、`workingDirectory` 必需注入。
- 五段审查输入、风险策略、严格 JSON 解析及请求冻结。
- `tools/pre-execute` 的 prepended 审查与下游 `next()` 调用规则。
- native 与 PTC inner 审查，以及外层 `run_code` 排除。
- `ask` 与 `never` 审批策略差异、技术失败关闭闸门的行为。
- 取消信号组合、停止接收新审查、终止并等待在途审查的卸载过程。

全部注册继续归属 `ctx` 生命周期，不增加模块级运行副作用。没有新增可调参数，因此首版无需新增 `Config`；后续确有部署差异时再使用 Schemastery。

## 4. 组合与安装约束

### 4.1 组合 patch

发布包的 `cordis.patch.yml`：

```yaml
- id: auto-review
  name: '@deepseek-ai/dsh-experimental-auto-review'
  disabled: true

- insert:
    - id: auto-review-opencode
      name: dsh-opencode-auto-review
```

必须使用两个不同的行 ID。不能通过对 `auto-review` 行设置新 `name` 实现替换，也不能通过再次插入同 ID 行覆盖已有行。

### 4.2 标准安装前提

官方 auto-review 组合层已经启用，并位于本插件组合层之前。本插件接替它的运行实现，官方包继续留在 profile 中。

配置层顺序为：profile 的有序 bundle 列表、profile 自身 patch、home patch、命令行 overlay。后面的层仍可能重新启用官方行或停用本插件，因此必须检查最终组合，不能只检查 bundle 列表。

`--dump-config` 中应看到：

- 官方 `auto-review` 行为 `disabled: true`。
- `auto-review-opencode` 行有效，指向本插件。
- 没有其他有效行再次挂载官方实现或本插件。

若官方层不存在，停用 patch 只会警告并跳过；这不算完成标准安装验收。若两套实现同时加载，重复 Auto 注册应明确失败，不得吞错。

### 4.3 热切换与回退

官方卸载会将活跃 Auto 会话迁移到 `danger-full-access`，写入 `never` 审批策略，然后中止并等待审查结束。派生插件保留这一行为；安装、热替换和移除都不能被描述为会话权限自动无缝迁移。

联调使用独立测试 profile。切换前停止当前轮次并将会话切换到适当的非 Auto 模式；完成加载检查后，显式重新选择 Auto review。热切换的在途取消和清理另由自动化测试覆盖。

移除本插件后，配置重算会恢复此前官方行的配置，但活跃会话不会自动重新选择 Auto。OpenCode 的原始缺陷也随官方实现恢复；该操作是回到基线，不代表 OpenCode 审查继续可用。

## 5. 文件与构建设计

拟定目录：

```text
package.json
pnpm-lock.yaml
tsconfig.json
tsdown.config.ts
cordis.patch.yml
src/index.ts
tests/auto-review.spec.ts
tests/session-routing.spec.ts
tests/opencode-transport.spec.ts
tests/composition.spec.ts
tests/fixtures/
README.md
README.zh.md
UPSTREAM.md
LICENSE
DEVELOPMENT.md
```

`UPSTREAM.md` 记录标签、完整提交、原文件路径、上游 MIT 版权、派生变更以及测试移植差异。保留现有项目许可证，对复制的上游内容保留原版权声明。

发布 manifest 至少包含：

```json
{
  "name": "dsh-opencode-auto-review",
  "version": "0.1.0",
  "type": "module",
  "main": "./lib/index.js",
  "types": "./lib/index.d.ts",
  "exports": {
    ".": {
      "types": "./lib/index.d.ts",
      "default": "./lib/index.js"
    }
  },
  "files": [
    "lib",
    "cordis.patch.yml",
    "README.md",
    "README.zh.md",
    "UPSTREAM.md",
    "LICENSE"
  ],
  "engines": { "dsh": "0.2.1-rc.2" },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

此片段省略依赖和 scripts，不能作为完整 manifest 直接发布。首版只声明支持该精确预发布版本，不使用宽泛的兼容区间。

依赖管理要求：

- 逐项核对实际导入，包括类型增强导入；不直接照抄上游 manifest。
- 必须共享宿主实例的 Cordis 和 DSH 包放入 `peerDependencies`，并在 `devDependencies` 提供目标基线对应版本。
- 上游的 `workspace:` 协议改为独立项目可解析的发布版本；Cordis 使用其独立版本。
- 无状态工具库按实际使用声明为普通依赖。
- 构建输出 ESM 和声明文件，将宿主共享依赖设为 external，不打入私有 Cordis 或服务实例。
- 传输集成测试使用目标基线的适配器、pi-ai 及相关仓库补丁，不能只验证另一个新版本。
- 锁定开发依赖；发布 tarball 包含已生成的 `lib/`，安装无需编译。

拟提供 `typecheck`、`test`、`build`、`pack` 开发入口。它们属于后续实现内容，当前文档不表示这些命令已经存在或执行通过。

## 6. 测试设计

### 6.1 官方行为回归

移植目标提交的 `packages/experimental/auto-review/tests/auto-review.spec.ts`，将被测模块导入改为本项目入口，并处理其仓库相对路径测试辅助依赖。

保留测试对应的行为断言；独立项目不能留下指向开发者本机源码工作树的测试依赖。优先采用发布的测试辅助接口，缺失时只移植必要夹具并记录来源。

将错误基线断言：

```ts
expect(request).not.toHaveProperty('sessionId')
```

替换为：

```ts
expect(request.sessionId).toBe(agent.session.id)
```

继续检查请求和消息冻结、外层 user 输入没有持久化 `id` 或 `source`、五段审查内容未变化。外层输入身份与请求级 `sessionId` 是不同概念。

### 6.2 新增测试矩阵

| 测试 | 关键断言 |
| --- | --- |
| 单会话 native 调用 | reviewer ID 等于待审 Agent ID；允许后工具执行一次 |
| 两个并发会话 | 使用屏障交错审查，请求身份不串会话 |
| 进程内子代理 | reviewer 使用子会话 ID，不使用父 ID |
| PTC inner 调用 | 每个已启动的 inner 调用按官方规则审查，身份正确 |
| PTC 外层 | `run_code` 外层保持排除，无新增审查 |
| 审批与拒绝 | `ask`、`never` 和后续监听器的决定保持官方优先级 |
| 技术失败 | HTTP 错误、无效 JSON、异常 finish 均不执行工具正文 |
| 取消与卸载 | 取消在途审查，卸载后不再接收调用，无重复监听残留 |
| 配置组合 | 官方行停用、新行启用；加载后只有一个 Auto 提供方 |
| 非 OpenCode 路由 | 仍经原路由完成审查，不增加 OpenCode 专用逻辑 |

### 6.3 实际传输集成

使用本地 HTTP 服务模拟协议响应，经真实目标版本 `llm-pi-ai` 和 pi-ai 发起请求。服务记录请求头并返回合法的流响应，不向外部发送项目内容。

必须验证实际收到的 `x-opencode-session`，不能只检查 mock 函数参数。用同一夹具对比上游未修复实现和本插件：前者复现缺头失败，后者带正确头并得到有效决定。

覆盖项目支持的四种 OpenCode 聊天 API，使用对应模型路由及合法响应夹具；`opencode-go` 若未完成独立验收，不写入首版支持声明。

显式配置的同名请求头优先于 pi-ai 自动生成值，因此动态身份验收前须移除应急静态头，包括大小写不同的同名键。集成测试同时确认该上游优先规则没有被改变。

### 6.4 组合与真实网关联调

独立测试 profile 使用目标版本完整运行环境。参照官方 `apps/web/tests/shipped-composition.e2e.ts` 验证主对话到 reviewer 再到工具结果的完整路径；多个会话和子代理按各自预期 ID 断言，不能在通用辅助函数中固定一个全局 ID。

真实 OpenCode 网关完成至少一次允许和一次拒绝。拒绝验收使用预设 `never` 策略或拒绝人工审批，检查工具正文没有执行。记录 DSH、适配器、pi-ai、模型路由和插件版本，以及脱敏结果，不记录 API key 或原始审查内容。

## 7. 开发步骤与交付门槛

| 阶段 | 工作 | 完成条件 |
| --- | --- | --- |
| 1. 建立基线 | 固定上游源码、清点依赖、记录版权和来源 | 来源可追溯，未复制旧工作树实现 |
| 2. 实现插件 | 补充会话字段，建立 manifest、构建及组合 patch | 类型检查通过，生产行为差异可逐项解释 |
| 3. 行为验证 | 移植官方测试，补充身份、并发及生命周期测试 | 单元和组合测试通过 |
| 4. 传输验证 | 本地真实适配器请求及上下游前后对照 | 正确头到达 HTTP 服务，错误路径不执行工具 |
| 5. 安装验证 | 构建、打包、安装到独立 profile | 使用发布产物可启动，配置只有一个审查器 |
| 6. 网关验收 | Desktop 或 Web 实际允许与拒绝联调 | 无 MissingSessionID，权限行为符合预期 |
| 7. 交付 | README、中英说明、上游记录、tarball 和验证记录 | 未完成项明确列出，不声称已通过 |

开发机可通过以下流程验证预构建包；`<profile>` 为实际测试 profile，命令使用目标 DSH 安装提供的 CLI：

```powershell
dsh plugin --profile <profile> add @deepseek-ai/dsh-experimental-auto-review@0.2.1-rc.2
dsh plugin --profile <profile> add ./dsh-opencode-auto-review-0.1.0.tgz
dsh --profile <profile> --dump-config
```

如果官方层已经存在，不重复添加。Desktop 的插件安装与 CLI 必须指向同一 DSH_HOME 和 profile；CLI 安装到另一个 profile 不会改变当前窗口。源码启动使用源码项目的启动流程，打包 Desktop 使用其插件管理和运行环境，两者分别记录验收结果。

交付物为预构建 tarball、源码、双语使用说明、上游记录及验证记录。当前任务只产出开发文档，以上阶段均待实施。

## 8. 风险、回放与维护

| 项目 | 处理方式 |
| --- | --- |
| 派生实现漂移 | 固定提交，首版只改会话字段和独立包所需元数据；升级时重新对照 |
| 配置被后续层覆盖 | 验收最终配置与实际注册状态；记录官方层和本包的顺序 |
| 卸载权限迁移 | 保留官方行为，说明 Full access 迁移及手动重新选择 Auto 的步骤 |
| 静态请求头遮蔽 | 动态路由测试移除静态头；不替用户自动修改 provider 配置 |
| 回放分桶变化 | reviewer 从匿名桶进入所属会话桶；实际录制 reviewer 的夹具需检查请求顺序，必要时重录 |
| 隐私与日志 | 新增字段仅用于传输；不将 reviewer prompt、推理或原始输出新增到日志 |
| 依赖版本差异 | 以锁文件及目标运行环境为准；不将未验证的新 pi-ai 版本纳入支持范围 |

现有冷回放或 stub 场景是否需要调整，应逐个检查是否真的调用 reviewer，不能仅凭测试文件名判断。只有录制及回放场景存在实际影响时才重录。

上游正式修复后，在升级后的目标版本重新验证 session ID 传递与 Auto 流程，再移除本插件并恢复官方实现。移除兼容插件后仍需显式确认当前会话权限，不自动切回 Auto。

## 9. 完成检查

- [ ] 所有代码与接口依据固定标签的 TypeScript 定义和生成参考。
- [ ] 核心修复为 `sessionId: agent.session.id`，prompt 和策略未发生额外变化。
- [ ] 必需注入、ctx 注册、waterfall 下游调用和清理顺序与官方一致。
- [ ] 包使用宿主共享依赖，声明与构建产物一致。
- [ ] 单会话、并发、子代理、PTC、审批、失败和取消测试通过。
- [ ] 实际 HTTP 请求头测试通过，包含上游未修复版本的失败对照。
- [ ] 最终 profile 中只有一个有效 Auto 提供方。
- [ ] 打包产物可独立安装，不依赖开发者本机源码路径。
- [ ] 网关允许与拒绝联调完成，未完成检查如实记录。
- [ ] 中英文说明覆盖版本、安装顺序、静态头、卸载迁移及回退。
- [ ] 上游 MIT 版权、固定提交和派生差异记录完整。
