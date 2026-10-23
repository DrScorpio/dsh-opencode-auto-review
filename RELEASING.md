# 发布（npm 与 GitHub Release）

本项目通过 GitHub Actions 在推送版本 tag（`v*`）时自动完成发布：

1. `publish.yml`（工作流名 “Publish to npm”）——构建、测试并发布到 npmjs.org；
2. `release.yml`（工作流名 “Package GitHub Release”）——同一 tag push 时，先由
   `build` job 从 tag 构建发布包并上传为工作流 artifact；等 npm 发布成功后，
   `release` job 从 tag 重新构建该包，与 registry 的 `dist.integrity` 逐字节比对，
   再创建 GitHub Release，附上 tarball 与校验和。

npm 认证使用 Trusted Publishing（OIDC），仓库中不保存任何 npm token；
GitHub Release 使用工作流内置的 `GITHUB_TOKEN`（`contents: write`）。

> 两个工作流文件都必须提交到默认分支（`master`）后才会被 GitHub 调度：
> tag push 触发的工作流使用 tag 指向的那次提交里的版本（`publish.yml` 与
> `release.yml` 的 `build` job），而 `workflow_run` 触发的 `release` job 只认
> 默认分支上的 `release.yml` 版本。若只提交了其中一个，另一段自动化不会运行。

## 1. 一次性配置

### 1.1 前提

- 包 `dsh-opencode-auto-review` 已存在于 npm registry（`0.1.0`、`0.1.1` 已发布，当前 `latest` 为 `0.1.1`）。
- npm 账号已开启 2FA。Trusted Publishing 的创建命令要求账号级 2FA，
  且不支持带「bypass 2FA」的 Granular Access Token。
- `package.json` 的 `repository` 字段指向本仓库。发布 provenance（来源证明）
  需要该字段，`npm trust` 在没有 `--repo` 时也会读取它。

### 1.2 在 npm 上登记 trusted publisher（二选一）

方式 A：CLI（npm >= 11.15.0）

```bash
npm login --auth-type=web   # 必须交互式 2FA，见下方说明
npm trust github dsh-opencode-auto-review \
  --file publish.yml \
  --repo DrScorpio/dsh-opencode-auto-review \
  --allow-publish

npm trust list dsh-opencode-auto-review   # 确认配置
```

- 必须用交互式 2FA 认证（`--auth-type=web`）。registry 会拒绝「bypass 2FA」的
  Granular Access Token：trust 相关接口（包括 `npm trust list` 的 GET）会返回
  `403 ... Please enable 2fa for your account`，即使账号本身已经开启 2FA。
  若本机 `~/.npmrc` 里已有旧的 `_authToken`，先备份并删除该行再登录
  （不要用 `npm logout`，它会吊销那枚 token）。
- `--file` 只写工作流文件名 `publish.yml`，不是 `.github/workflows/publish.yml`。
- `--allow-publish` 必须给，否则登记成功但没有发布权限。
- 一个包当前只支持一个 trusted publisher 配置；要换配置先
  `npm trust list dsh-opencode-auto-review` 取 id，再
  `npm trust revoke dsh-opencode-auto-review --id <id>`。

方式 B：网页

打开 <https://www.npmjs.com/package/dsh-opencode-auto-review/access> →
Trusted Publisher → GitHub Actions，填写：

| 字段 | 值 |
| --- | --- |
| Owner | `DrScorpio` |
| Repository | `dsh-opencode-auto-review` |
| Workflow filename | `publish.yml` |
| Environment | 留空 |
| 权限 | 允许 publish |

登记后 **48 小时内**必须完成第一次成功发布，否则该配置过期失效
（npm 自 2026-10-02 起生效）；过期后重新创建即可。

### 1.3 GitHub 仓库

无需添加 Secrets：

- `publish.yml` 声明了 `id-token: write`，npm 用 OIDC 换取短期发布凭证；
- `release.yml` 声明了 `contents: write`，用内置 `GITHUB_TOKEN` 创建 Release。

仓库 Settings → Actions → General 的 Workflow permissions 保持默认即可，
两个工作流都在文件内显式声明了自己需要的权限。

## 2. 日常发布

```bash
pnpm version patch          # 或 minor / major；自动提交并打 tag v<version>
git push --follow-tags      # 推送 tag，触发发布
```

随后按顺序执行：

1. `publish.yml` 解析 tag，校验 tag 与 `package.json` 版本一致；
2. `pnpm install --frozen-lockfile`；
3. `pnpm typecheck`、`pnpm test`、`pnpm build`；
4. `npm publish --provenance`（无 `NODE_AUTH_TOKEN`，用 OIDC 换取短期凭证）；
5. 轮询 `npm view ... dist.attestations` 确认 provenance 已生成。

同一 tag push 还会触发 `release.yml` 的 `build` job：它从 tag 构建发布包、
校验包内容并上传为工作流 artifact。该 job 不访问 npm，因此可以与上面的发布并行。

`publish.yml` 整体成功后，`release.yml` 的 `release` job 自动触发：从 tag
重新构建该版本的 tarball，用 sha512 与 registry 的 `dist.integrity` 比对；
一致时把它作为 Release 资产，不一致时退回下载 registry 的 tarball（下载后同样
校验），然后创建或更新 GitHub Release，附上 `dsh-opencode-auto-review-<version>.tgz`
与 `SHA256SUMS.txt`（详见第 3 节）。

预发布版本（版本号含 `-`，如 `0.2.0-rc.1`）：npm 发布到 `next` dist-tag，
GitHub Release 标记为 prerelease（不抢占 Latest）。正式版本发布到 `latest`。

手动重跑 npm 发布：Actions → “Publish to npm” → Run workflow → 填入已存在的 tag。
若这次手动运行不是从 tag ref 发起的，`release.yml` 无法从运行的分支推断 tag，
需要再手动运行一次 “Package GitHub Release” 并填同一个 tag（或者把
“Publish to npm” 的 Run workflow 分支选项直接选成该 tag，让两者自动衔接）。
手动重跑 / 补建 GitHub Release：Actions → “Package GitHub Release” → Run workflow →
填入已存在的 tag（例如补建 `v0.1.0` 的 Release）。

## 3. 自动创建 GitHub Release（`release.yml`）

触发方式：

- `push`（tag `v*`）：只运行 `build` job，从 tag 构建发布包并上传为工作流
  artifact，供发布前人工检查；它不创建 Release，也不访问 npm。
- `workflow_run`：监听 “Publish to npm” 的 `completed` 事件，且只在
  `conclusion == 'success'` 时运行 `release` job。这样 GitHub Release 不会
  先于 npm 出现——npm 拒绝（版本重复、测试失败、trusted publisher 配置错误等）
  时不会产生 Release。工作流名必须与 `publish.yml` 的 `name:` 完全一致，
  改名时两处一起改。
- `workflow_dispatch`：手动填 tag，运行 `release` job，用于补建旧版本的
  Release 或重试失败运行；它同样会先构建并校验再创建 Release。

工作流做的事：

`build` job（tag push 时）：

1. 解析 tag，校验 tag 与 `package.json` 版本一致；
2. 检出该 tag，`pnpm install --frozen-lockfile`、`pnpm build`、
   `npm pack --ignore-scripts`；
3. 校验包内文件清单与 packed version，生成 `SHA256SUMS.txt`，把 tarball 与
   校验和上传为工作流 artifact（保留 30 天）。

`release` job（publish 成功后自动运行，或手动 dispatch）：

1. 解析 tag（手动输入 / 触发运行的分支或 tag / 指向触发提交的 `v*` tag），
   并校验 tag 指向的提交就是 npm 发布所构建的提交；
2. 检出该 tag，校验 tag 与 `package.json` 版本一致；
3. 从 tag 重新构建发布包并计算 sha512，与 registry 的 `dist.integrity` 比对
   （带重试，等待 npm 传播）。一致时把它作为 Release 资产；不一致时输出
   warning，退回下载 registry 的 tarball 并同样校验；
4. 生成 `SHA256SUMS.txt`；
5. 创建 GitHub Release：标题为 tag，正文 = npm 链接、安装命令、sha256 加上
   GitHub 自动生成的 release notes；资产为 tarball 与校验和文件。

Release 资产是本次运行从 tag 构建出的 tarball，并已证明与 npm 上的 tarball
字节级相同（sha512 与 registry 的 `dist.integrity` 一致）。因此它既对应 tag
的可复现构建，也与 npm 的 provenance 证明指向同一个 artifact。

幂等性：Release 已存在时只覆盖资产（`--clobber`）；如果上次运行在「上传资产完成、
发布 Release」之间失败而留下 draft，会把它发布出来。因此直接重跑工作流是安全的。

## 4. 验证发布结果

npm：

```bash
npm view dsh-opencode-auto-review@<version> dist.attestations --json
npm audit signatures
```

GitHub Release：

```bash
gh release view v<version> --repo DrScorpio/dsh-opencode-auto-review
gh release download v<version> --repo DrScorpio/dsh-opencode-auto-review --pattern '*.tgz'
sha256sum dsh-opencode-auto-review-<version>.tgz   # 应与 SHA256SUMS.txt 一致
```

npm 包页面会显示 “Built and signed on GitHub Actions” 徽章。

tag push 后，`release.yml` 的 `build` job 还会在 Actions 运行页面留下同名
artifact（tarball 与 `SHA256SUMS.txt`，保留 30 天），可在 npm 发布完成前
检查构建结果。

## 5. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| publish 返回 `404 PUT` / `E404` | npm 上的 trusted publisher 与工作流身份不匹配：owner、repo、文件名（只写 basename）必须完全一致。改完配置后 48 小时内要发布一次。 |
| `npm trust` 返回 `403 ... Please enable 2fa for your account`（账号其实已开 2FA） | 当前用的是「bypass 2FA」的 Granular Access Token（`npm_` 开头）。2026-07 起这类 token 不能创建或修改 trusted publishing 配置，必须交互式 2FA：备份 `~/.npmrc`，删除 `//registry.npmjs.org/:_authToken=...` 行（不要 `npm logout`，它会吊销 token），再 `npm login --auth-type=web` 后重试；或直接用网页添加。 |
| `provenance` 生成失败，提示缺 repository | `package.json` 缺少 `repository` 字段，或与 GitHub 仓库不一致。 |
| 发布失败并提示 npm 版本过旧 | trusted publishing 要求 npm >= 11.5.1；Node 22 自带 npm 10.x 不满足，本工作流使用 Node 24。 |
| `cannot publish over ...` | 该版本已存在，npm 不允许覆盖，必须升版本号。 |
| tag 与 package.json 不一致 | 工作流会直接失败，先改 package.json 再打 tag。 |
| OIDC 被拒绝（token 无效） | 触发事件不支持：npm 拒绝 `pull_request_target`、`issue_comment` 事件的 token；请用 `push`（tag）、`release` 或 `workflow_dispatch`。 |
| 配置 48 小时后失效 | 重新创建 trusted publisher，并在 48 小时内成功发布一次。 |
| npm 发布成功但没有 GitHub Release | `release.yml` 只在 “Publish to npm” 整体成功后才运行。若 publish 在 `npm publish` 之前的步骤失败，修好后重新发版；若 publish 在 publish 之后的 provenance 校验步骤失败，npm 上其实已有该版本，不要重跑 publish（会报版本已存在），直接手动 dispatch “Package GitHub Release” 填该 tag；若只是 Release 工作流失败（例如网络抖动），到 Actions 重跑它即可。 |
| `release.yml` 解析 tag 失败 | 手动 dispatch 填了不存在的 tag，或触发 publish 的提交上没有 `v*` tag。重跑并填正确 tag；工作流也会校验 tag 指向的提交与发布所构建的提交一致。 |
| tag push 后只看到 `build` job，没有 Release | 正常：`release` job 要等 “Publish to npm” 整体成功后才运行。若 publish 失败，先修好再重新发版；若 npm 上其实已有该版本，直接手动 dispatch “Package GitHub Release”。 |
| `release` job 提示 build 与 registry 不一致 | tag 上的构建产物与 npm 实际发布的 tarball 不同（工具链差异）。工作流会输出 warning，改用 registry 的 tarball 并校验，Release 仍然正确；要消除 warning，检查构建环境是否与发布时一致（同一 Node/pnpm 版本、frozen lockfile）。 |
| `release` job 提示 tarball integrity mismatch | 下载的 tarball 与 registry 的 `dist.integrity` 不一致（通常是下载损坏）；重跑工作流即可。 |
| 想给旧版本补 GitHub Release | Actions → “Package GitHub Release” → Run workflow，填入该版本 tag；要求该版本仍在 npm registry 上。 |

## 6. 回退方案：NPM_TOKEN（不推荐）

如果暂时不能用 OIDC，可以改为长期 token 发布：

1. 在 npm 账号创建 Granular Access Token（读写该包、允许发布），
   存为仓库 Secret `NPM_TOKEN`。
2. 在 `publish.yml` 的发布步骤加上：

   ```yaml
   env:
     NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
   ```

3. 删除 job 的 `id-token: write` 权限（留着也无害，但不再需要）。

注意 npm 正在逐步弃用可绕过 2FA 的 token，长期方案仍应使用 OIDC。
