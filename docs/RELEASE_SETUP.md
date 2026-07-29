# 发版与 CI 配置（仓库所有者内部备忘）

> 这不是面向用户的文档，是**仓库所有者自己**做发版配置时的备忘。涉及签名密钥、第三方账号、GitHub Secrets——只有仓库所有者能做。

本仓库的三个 workflow（`release.yml` / `upgradelink.yml` / `sync-to-codeberg.yml`）都改造自上游、指向自己，结构保留不变。以下是让它们真正跑起来要做的事。

## 1. 生成 Tauri 更新签名密钥（更新校验必需）✅ 已完成

Tauri 的 updater 需要一对签名密钥：**私钥**用于 release 构建时签名安装包，**公钥**（pubkey）内嵌进 `tauri.conf.json` 供客户端校验。

```bash
# 空密码：必须用 -p "" --ci 跳过交互（交互模式会反复问密码，无法留空）
pnpm tauri signer generate -w ~/.tauri/bongocat-todo.key -p "" --ci
# 公钥写进 ~/.tauri/bongocat-todo.key.pub，私钥写进 .key
```

- **公钥**：已填进 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`。
- **私钥**：`~/.tauri/bongocat-todo.key`（空密码），填进 GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`（见第 4 步）。
- 密码空，`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 填空串即可。

> 上游的 pubkey 已被删除——那是上游私钥对应的公钥，fork 用它无法校验你自己签的包。

## 2. 注册 UpgradeLink 账号 + 创建 app（更新统计 / 灰度，企业版免费）

UpgradeLink（https://upgrade.toolsetlink.com）企业版**永久免费**，提供更新分发、灰度、统计等增值能力。本仓库 `upgradelink.yml` + `tauri.conf.json` 的第一个 updater endpoint 都依赖它。

1. 打开 https://upgrade.toolsetlink.com → 点「后台登录」注册企业账号（**企业版永久免费**），创建一个 **Tauri 类型**的应用。
2. 在应用详情页拿到**四样东西**：`access_key` / `access_secret` / `app_key`（应用唯一标识）和 **`tauriKey`**（Tauri 升级策略接口密钥，用于 endpoint URL——与 `app_key` 是不同的标识）。
3. 把 **`tauriKey`** 的值粘进 `src-tauri/tauri.conf.json`，替换 updater endpoint 里的占位符 `REPLACE_WITH_YOUR_UPGRADELINK_TAURIKEY`。
4. `access_key` / `access_secret` / `app_key` 填进 GitHub Actions secrets（见第 4 步）。

## 3. 注册 Codeberg 账号 + 生成镜像 token

Codeberg 是本仓库的代码镜像目标（替代上游的 Gitee）。

1. 注册 Codeberg 账号，创建同名仓库 `bongocat-todo`（或让 workflow 的 `create: true` 自动建）。
2. 到 https://codeberg.org/user/settings/applications 生成 access token，权限勾 `write:repository`（如需自动建仓再加 `write:organization` `write:user`）。
3. token 填进 GitHub Actions secret `CODEBERG_TOKEN`（见第 4 步）。
4. 如果 Codeberg 用户名 / 仓库名与 GitHub 不同，编辑 `.github/workflows/sync-to-codeberg.yml` 取消注释 `owner` / `repo` 并填值。

> **为什么不用 `cschlosser/forgejo-mirror-action`？** 那个 action 走 Forgejo action 解析（`uses: https://codeberg.org/...`），需要自建 runner 或配置 `DEFAULT_ACTIONS_URL`，标准 GitHub-hosted runner 跑不了。`cssnr/mirror-repository-action@v1` 明确「tested with Codeberg」、原生 `uses:` 格式、零额外配置，更适合 fork 的最小改动原则。

## 4. 配置 GitHub Actions Secrets

到 https://github.com/ChHsiching/bongocat-todo/settings/secrets/actions 添加以下 secrets：

| Secret | 用途 | 来源 |
|--------|------|------|
| `RELEASE_TOKEN` | release workflow 推 release / 上传产物 | 你自己的 GitHub PAT（需 `repo` 权限） |
| `TAURI_SIGNING_PRIVATE_KEY` | release 构建时给安装包签名 | 第 1 步生成的私钥文件内容 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 解锁私钥 | 第 1 步设的密码 |
| `UPGRADE_LINK_ACCESS_KEY` | upgradelink workflow 上报 release | 第 2 步 |
| `UPGRADE_LINK_ACCESS_SECRET` | 同上 | 第 2 步 |
| `UPGRADE_LINK_APP_KEY` | 同上（标识你的 app，workflow 上报用） | 第 2 步 |
| `CODEBERG_TOKEN` | codeberg 镜像 workflow 推送 | 第 3 步 |

## 5. 发版

secrets 配齐、pubkey/tauriKey 占位符替换后：

```bash
pnpm release      # .release-it.ts: 打 tag v${version}，after:bump 跑 scripts/release.ts
git push --follow-tags origin master
# tag push 触发 release.yml → 多平台构建 → changelogithub 生成 draft release
# release published 后触发 upgradelink.yml 上报、master push 触发 codeberg 镜像
```
