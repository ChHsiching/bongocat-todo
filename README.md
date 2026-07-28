> 🔖 本仓库是 [ayangweb/BongoCat](https://github.com/ayangweb/BongoCat) 的 **fork**，在上游基础上以插件化方式扩展了手绘风格的 todo（待办）模块，并持续接收上游更新。感谢上游作者 [@ayangweb](https://github.com/ayangweb)。

![BongoCat](https://socialify.git.ci/ayangweb/BongoCat/image?custom_description=&description=1&font=Source+Code+Pro&forks=1&issues=1&logo=https%3A%2F%2Fgithub.com%2Fayangweb%2FBongoCat%2Fblob%2Fmaster%2Fsrc-tauri%2Fassets%2Flogo-mac.png%3Fraw%3Dtrue&name=1&owner=1&pattern=Floating+Cogs&pulls=1&stargazers=1&theme=Auto)

<div align="center">
  <div>
    <a href="https://github.com/ChHsiching/bongocat-todo/releases"><img alt="Windows" src="https://img.shields.io/badge/-Windows-blue?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB0PSIxNzI2MzA1OTcxMDA2IiBjbGFzcz0iaWNvbiIgdmlld0JveD0iMCAwIDEwMjQgMTAyNCIgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHAtaWQ9IjE1NDgiIHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4Ij48cGF0aCBkPSJNNTI3LjI3NTU1MTYxIDk2Ljk3MTAzMDEzdjM3My45OTIxMDY2N2g0OTQuNTEzNjE5NzVWMTUuMDI2NzU3NTN6TTUyNy4yNzU1NTE2MSA5MjguMzIzNTA4MTVsNDk0LjUxMzYxOTc1IDgwLjUyMDI4MDQ5di00NTUuNjc3NDcxNjFoLTQ5NC41MTM2MTk3NXpNNC42NzA0NTEzNiA0NzAuODMzNjgyOTdINDIyLjY3Njg1OTI1VjExMC41NjM2ODE5N2wtNDE4LjAwNjQwNzg5IDY5LjI1Nzc5NzVzek00LjY3MDQ1MTM2IDg0Ni43Njc1OTcwM0w0MjIuNjc2ODU5MjUgOTE0Ljg2MDMxMDEzVjU1My4xNjYzMTcwM0g0LjY3MDQ1MTM2eiIgcC1pZD0iMTU0OSIgZmlsbD0iI2ZmZmZmZiI+PC9wYXRoPjwvc3ZnPg==" /></a>
    <a href="https://github.com/ChHsiching/bongocat-todo/releases"><img alt="MacOS" src="https://img.shields.io/badge/-MacOS-black?style=flat-square&logo=apple&logoColor=white" /></a>
    <a href="https://github.com/ChHsiching/bongocat-todo/releases"><img alt="Linux" src="https://img.shields.io/badge/-Linux-yellow?style=flat-square&logo=linux&logoColor=white" /></a>
  </div>

  <p>
    <a href="./LICENSE"><img src="https://img.shields.io/github/license/ChHsiching/bongocat-todo?style=flat-square" /></a>
    <a href="https://github.com/ChHsiching/bongocat-todo/releases/latest"><img src="https://img.shields.io/github/package-json/v/ChHsiching/bongocat-todo?style=flat-square"/></a>
    <a href="https://github.com/ChHsiching/bongocat-todo/releases"><img src="https://img.shields.io/github/downloads/ChHsiching/bongocat-todo/total?style=flat-square"/></a>
  </div>
</div>

| macOS                                                                                        | Windows                                                                                        | Linux(x11)                                                                                   |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| ![macOS](https://i0.hdslb.com/bfs/openplatform/dff276b96d49c5d6c431b74b531aab72191b3d87.png) | ![Windows](https://i0.hdslb.com/bfs/openplatform/a4149b753856ee7f401989da902cf3b5ad35b39e.png) | ![Linux](https://i0.hdslb.com/bfs/openplatform/3b49f961819d3ff63b2b80251c1cc13c27e986b0.png) |

## 赞助商

<a href="https://www.toolsetlink.com">
  <img height="54" alt="UpgradeLink" src="https://github.com/user-attachments/assets/6b84fb0f-3f1d-44b5-9932-2298bc999d8d" />
</a>

## 开发背景

本项目的灵感来源于 [MMmmmoko](https://github.com/MMmmmoko) 大佬开发的 [Bongo-Cat-Mver](https://github.com/MMmmmoko/Bongo-Cat-Mver)。它以独特的猫咪互动功能深受用户喜爱，但仅支持 Windows 平台。作为一名深度 macOS 用户，我特别希望在自己的设备上也能使用这款可爱的猫咪，于是我决定开发一个适配 macOS 的版本。

同时，得益于 [Tauri](https://github.com/tauri-apps/tauri) 强大的跨平台能力，本项目不仅支持 macOS，还兼容 Windows 和 Linux(x11)，让更多的用户都能与这只可爱的猫咪互动！

## 本 fork 的新增（BongoCat Todo）

本仓库在上游 BongoCat 基础上，以**插件化方式**新增了一个手绘风格的 todo（待办）模块，并持续接收上游更新。todo 模块自包含于 `src/plugins/todo/`，对上游代码的侵入点全部是「追加」，详见 `docs/adr/0001-plugin-architecture-for-todo.md`。

- 右键桌宠 / 托盘菜单呼出「待办面板」伴随窗口。
- 手绘纸张风视觉：纯白纸 + 851 手写字体 + SVG 手绘 checkbox / 墨点 / 时钟 / 波浪分隔线 / 爪印。
- 三档优先级（低/中/高），用墨点颜色标记，主面板可点击切换。
- 截止日期提醒（基于 `@tauri-apps/plugin-notification`，到点本地通知）。
- 快速新建：迷你输入窗跟随光标，三状态（空 / 输入中 / 保存成功）。
- 数据通过 `@tauri-store/pinia` 自动落地 JSON，零额外依赖。

## 下载

- [GitHub Releases](https://github.com/ChHsiching/bongocat-todo/releases)
- [Codeberg 镜像](https://codeberg.org/ChHsiching/bongocat-todo)

> ⚠️ Releases 由 GitHub Actions（`release.yml`）在 tag push 时自动构建。**首次发版前需完成下方「发版与 CI 配置（用户手动）」一节的配置**，否则构建会因为缺少 secrets 失败。

不确定下载哪一个？请查阅[下载指南](.github/DOWNLOAD_GUIDE.md)。

## 功能介绍

- 适配 macOS、Windows 和 Linux(x11)。
- 根据键盘、鼠标或手柄的操作，同步对应的动作。
- 支持导入自定义模型，自由打造专属猫咪形象。
- 完全开源，代码公开透明，绝不收集任何用户数据。
- 支持离线运行，无需联网，保护用户隐私。

## 开发

### 环境要求

- Node.js 20+ / pnpm（`preinstall` 钩子强制 pnpm）
- Rust stable（`rustup`）
- 各平台 Tauri 2 依赖（macOS: Xcode CLT；Windows: WebView2 + MSVC；Linux: `libwebkit2gtk-4.1-dev` 等，见 `.github/workflows/release.yml`）

### 本地启动 / 打包

```bash
pnpm install
pnpm tauri dev      # 本地开发
pnpm tauri build    # 打包（调试加 --debug）
```

### 测试 / 构建 / Lint

```bash
pnpm test        # vitest（todo 模块单测）
pnpm build       # vite 构建 + 图标构建
pnpm lint        # eslint --fix src
```

> ⚠️ 已知工程债：`pnpm lint` / `eslint` 在 Windows 大目录树偶发段错误（exit 0xC0000005）。可靠绕过：`node --max-old-space-size=4096 ./node_modules/eslint/bin/eslint.js src`（不带 `--fix`）。详见 `CONTEXT.md`「已踩坑清单」。

### 项目文档

- `CONTEXT.md` —— 单上下文词汇表 + 决策快照 + 已踩坑清单（**任何新 agent 必读**）。
- `AGENTS.md` —— 分支策略、上游同步约定、agent 工作守则。
- `docs/adr/` —— 架构决策记录（ADR）。
- `docs/designs/todo-panel-exploration/` —— todo 面板视觉设计稿（定稿 `panel.html` / `mini-input.html`）。

## 上游同步

- `upstream` → `ayangweb/BongoCat`（**只 fetch，绝不 push**）。
- `origin` → `ChHsiching/bongocat-todo`（日常 push/pull）。

```bash
# 在 master 上合并上游，再切到模块分支带进来
git fetch upstream
git merge upstream/master      # master 始终干净，只镜像上游
git checkout todo
git merge master               # 把上游更新带进模块分支，冲突在模块分支解
```

分支与同步策略详见 `AGENTS.md`。

---

## 发版与 CI 配置（用户手动，agent 只准备代码 + 写说明）

> 本仓库的三个 workflow 都是**改造自上游、指向自己**的，结构保留不变。以下步骤必须由你（仓库所有者）手动完成，agent 不持有这些密钥/账号，无法代做。

### 1. 生成 Tauri 更新签名密钥（更新校验必需）

Tauri 的 updater 需要一对签名密钥：**私钥**用于 release 构建时签名安装包，**公钥**（pubkey）内嵌进 `tauri.conf.json` 供客户端校验。

```bash
pnpm tauri signer generate -w ~/.tauri/bongocat-todo.key
# 会输出：
#   Private key: 写入 ~/.tauri/bongocat-todo.key
#   Public key:  dW50cnVzdGVkIGNvbW1lbnQ6...（base64 字符串）
```

- **公钥**：替换 `src-tauri/tauri.conf.json` 里 `plugins.updater.pubkey` 的占位符 `REPLACE_WITH_YOUR_OWN_UPDATER_PUBKEY`。
- **私钥 + 密码**：填进 GitHub Actions secrets（见下）。

> 上游的 pubkey 已被删除——那是上游私钥对应的公钥，fork 用它无法校验你自己签的包。

### 2. 注册 UpgradeLink 账号 + 创建 app（更新统计 / 灰度，企业版免费）

UpgradeLink（https://upgrade.toolsetlink.com）企业版**永久免费**，提供更新分发、灰度、统计等增值能力。本仓库 `upgradelink.yml` + `tauri.conf.json` 的第一个 updater endpoint 都依赖它。

1. 注册 UpgradeLink 账号，创建一个 **app_type = tauri** 的应用。
2. 拿到三样东西：`access_key` / `access_secret` / `app_key`。
3. **`app_key`** 替换 `src-tauri/tauri.conf.json` 里 updater endpoint 的占位符 `REPLACE_WITH_YOUR_UPGRADELINK_APP_KEY`（`tauriKey=...`）。
4. `access_key` / `access_secret` / `app_key` 填进 GitHub Actions secrets（见下）。

### 3. 注册 Codeberg 账号 + 生成镜像 token

Codeberg 是本仓库的代码镜像目标（替代上游的 Gitee）。

1. 注册 Codeberg 账号，创建同名仓库 `bongocat-todo`（或让 workflow 的 `create: true` 自动建）。
2. 到 https://codeberg.org/user/settings/applications 生成 access token，权限勾 `write:repository`（如需自动建仓再加 `write:organization` `write:user`）。
3. token 填进 GitHub Actions secret `CODEBERG_TOKEN`（见下）。
4. 如果你的 Codeberg 用户名 / 仓库名与 GitHub 不同，编辑 `.github/workflows/sync-to-codeberg.yml` 取消注释 `owner` / `repo` 并填值。

> **为什么不用 `cschlosser/forgejo-mirror-action`？** 那个 action 走 Forgejo action 解析（`uses: https://codeberg.org/...`），需要自建 runner 或配置 `DEFAULT_ACTIONS_URL`，标准 GitHub-hosted runner 跑不了。`cssnr/mirror-repository-action@v1` 明确「tested with Codeberg」、原生 `uses:` 格式、零额外配置，更适合 fork 的最小改动原则。

### 4. 配置 GitHub Actions Secrets

到 https://github.com/ChHsiching/bongocat-todo/settings/secrets/actions 添加以下 secrets：

| Secret | 用途 | 来源 |
|--------|------|------|
| `RELEASE_TOKEN` | release workflow 推 release / 上传产物 | 你自己的 GitHub PAT（需 `repo` 权限） |
| `TAURI_SIGNING_PRIVATE_KEY` | release 构建时给安装包签名 | 第 1 步生成的私钥文件内容 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 解锁私钥 | 第 1 步设的密码 |
| `UPGRADE_LINK_ACCESS_KEY` | upgradelink workflow 上报 release | 第 2 步 |
| `UPGRADE_LINK_ACCESS_SECRET` | 同上 | 第 2 步 |
| `UPGRADE_LINK_APP_KEY` | 同上（标识你的 app） | 第 2 步，需与 `tauri.conf.json` endpoint 里的一致 |
| `CODEBERG_TOKEN` | codeberg 镜像 workflow 推送 | 第 3 步 |

### 5. 发版

secrets 配齐、pubkey/app_key 占位符替换后：

```bash
pnpm release      # .release-it.ts: 打 tag v${version}，after:bump 跑 scripts/release.ts
git push --follow-tags origin master
# tag push 触发 release.yml → 多平台构建 → changelogithub 生成 draft release
# release published 后触发 upgradelink.yml 上报、master push 触发 codeberg 镜像
```

## 模型转换

如果你想将 Bongo-Cat-Mver 应用中的模型转换为兼容 BongoCat 的格式，可以使用以下工具：

🔗 [在线转换](https://bongocat.vteamer.cc)

## 更多模型

你可以在这个仓库中探索、下载更多猫咪模型，或提交你的创作，与大家一起分享：

📦 [Awesome-BongoCat](https://github.com/ayangweb/Awesome-BongoCat)

## 社区交流

<table>
  <thead>
    <tr>
      <th>QQ 群 1</th>
      <th>QQ 群 2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <a href="https://qm.qq.com/q/AS3gNv2Vzy">
          <picture>
            <source
              media="(prefers-color-scheme: dark)"
              srcset="https://i0.hdslb.com/bfs/openplatform/8ecdc4982ab01b59d7731fcca3ec26631a274560.png"
            />
            <source
              media="(prefers-color-scheme: light)"
              srcset="https://i0.hdslb.com/bfs/openplatform/09f56580397063e1819c4c2ed63d07dee12720e1.png"
            />
            <img
              alt="QQ Group 1"
              src="https://i0.hdslb.com/bfs/openplatform/09f56580397063e1819c4c2ed63d07dee12720e1.png"
              height="250"
            />
          </picture>
        </a>
      </td>
      <td>
        <a href="https://qm.qq.com/q/TmltLAod2O">
          <picture>
            <source
              media="(prefers-color-scheme: dark)"
              srcset="https://i0.hdslb.com/bfs/openplatform/473c522487ff33e0f32b15466aeb0734f17161c8.png"
            />
            <source
              media="(prefers-color-scheme: light)"
              srcset="https://i0.hdslb.com/bfs/openplatform/d5ae8c5af6ae1d0a1f066705ee822d1287384cf6.png"
            />
            <img
              alt="QQ Group 2"
              src="https://i0.hdslb.com/bfs/openplatform/d5ae8c5af6ae1d0a1f066705ee822d1287384cf6.png"
              height="250"
            />
          </picture>
        </a>
      </td>
    </tr>
  </tbody>
</table>

## 赞赏

每一份认可都值得被珍视！赞赏随缘，心意无价，谢谢你的支持 ❤️

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://i0.hdslb.com/bfs/openplatform/e7438bff14cdfb6bfd0feacbb482f99ea4093294.png" />
  <source media="(prefers-color-scheme: light)" srcset="https://i0.hdslb.com/bfs/openplatform/da55cc3ec1556580c91e59f589792866c998c7c6.png" />
  <img alt="微信赞赏码" src="https://i0.hdslb.com/bfs/openplatform/da55cc3ec1556580c91e59f589792866c998c7c6.png" height="250" />
</picture>

## 贡献指南

感谢大家为 BongoCat 做出的宝贵贡献！如果你也希望做出贡献，请查阅[贡献指南](.github/CONTRIBUTING.md)。

## 历史星标

<a href="https://www.star-history.com/#ayangweb/BongoCat&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=ayangweb/BongoCat&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=ayangweb/BongoCat&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=ayangweb/BongoCat&type=Date" />
 </picture>
</a>

## License

继承上游 License，见 [LICENSE](./LICENSE)。
