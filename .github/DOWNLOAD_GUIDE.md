# 下载指南

## 系统要求

- macOS 12 或更高版本。
- Windows 10 或更高版本。
- Linux 带有 X11 环境。

## macOS

### Homebrew（推荐）

```bash
brew tap ChHsiching/tap
brew install --cask bongo-cat-todo
```

更新：

```bash
brew upgrade --cask bongo-cat-todo
```

### 手动下载

- Apple Silicon：下载 `BongoCat_aarch64.dmg`
- Intel Chip：下载 `BongoCat_x64.dmg`

## Windows

- 64 位系统：下载 `BongoCat_x64.exe`
- 32 位系统：下载 `BongoCat_x86.exe`
- ARM64 架构：下载 `BongoCat_arm64.exe`

## Linux (X11)

### AUR（Arch / Manjaro）

两个包可选，二选一（互斥）：

**预编译二进制包（推荐，免编译快速安装）**：

```bash
yay -S bongo-cat-todo-bin
```

**源码编译包（从源码本地编译，编译时间较长但可审查构建过程）**：

```bash
yay -S bongo-cat-todo
```

### 手动下载（Debian / Ubuntu / Mint / Fedora 等）

- Debian / Ubuntu / Mint：
  ```bash
  sudo dpkg -i BongoCat_amd64.deb
  ```
- Fedora / RHEL：
  ```bash
  sudo rpm -i BongoCat_x86_64.rpm
  ```
- 通用版本（双击即用，免安装）：下载 `BongoCat_amd64.AppImage`

ARM64 架构：

- Debian / Ubuntu / Mint：下载 `BongoCat_arm64.deb`
- Fedora / RHEL：下载 `BongoCat_aarch64.rpm`
- 通用版本：下载 `BongoCat_aarch64.AppImage`

## 邮件通知功能说明

绑定邮箱后，桌宠会通过 IMAP IDLE 实时监听新邮件。使用此功能需要：

- **邮箱开启 IMAP 服务**：在各邮箱设置中开启 IMAP，并获取**授权码 / 专用密码**（不是登录密码）。
- **系统钥匙串权限**：邮箱密码通过系统钥匙串（Windows Credential Manager / macOS Keychain / Linux Secret Service）加密存储，不会明文落地。
- **境外邮箱**：Gmail 等境外邮箱可能需要配置代理（设置页 → 邮件 → 代理地址）。
- **支持的邮箱**：Gmail、QQ、Foxmail、163、126、Outlook、iCloud、Proton、Yahoo 及教育邮箱（自动识别）。
