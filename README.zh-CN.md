# Codex Desk

<p align="center">
  <strong>掌握 Codex CLI 额度，管理和切换账户。</strong><br />
  面向 Windows、macOS 和 Linux 的本地 Codex CLI 桌面控制台。
</p>

<p align="center">
  <a href="https://github.com/xiaotao-xiaotao/codex-desk/releases"><strong>下载最新版本</strong></a>
  · <a href="README.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/xiaotao-xiaotao/codex-desk/releases"><img src="https://img.shields.io/github/v/release/xiaotao-xiaotao/codex-desk?display_name=tag&sort=semver" alt="最新版本" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/xiaotao-xiaotao/codex-desk" alt="MIT License" /></a>
  <a href="https://github.com/xiaotao-xiaotao/codex-desk/stargazers"><img src="https://img.shields.io/github/stars/xiaotao-xiaotao/codex-desk?style=flat" alt="GitHub Stars" /></a>
</p>

## 主要功能

- **账户用量**：查看各账户额度、重置时间、订阅及重置额度，支持账单和额度重置入口。
- **账户管理**：浏览器或设备码登录，本机保存、编辑与切换账户。
- **设置**：CLI 路径、刷新间隔、网络代理、额度提醒与邮箱脱敏。
- **桌面功能**：悬浮球、窗口置顶、可收起侧栏、明暗主题、系统托盘与五种界面语言。

需要 **Codex CLI ≥ 0.157.0**（[安装说明](https://github.com/openai/codex)）。

## 下载

前往 [Releases](https://github.com/xiaotao-xiaotao/codex-desk/releases) 下载最新安装包：

- Windows：普通用户下载 `.exe` 安装包（Windows 10/11）；企业或集中部署可选择 `.msi` 安装包。
- macOS：下载与芯片匹配的 `.dmg` 安装包。
- Linux：Debian/Ubuntu 下载 `.deb`；Fedora 等兼容 RPM 的发行版下载 `.rpm`；其他桌面发行版可下载 `.AppImage`。

首次启动前，请确保已单独安装并登录 [Codex CLI](https://github.com/openai/codex)，版本需 **≥ 0.157.0**。

### macOS 安装说明

1. 在 [Releases](https://github.com/xiaotao-xiaotao/codex-desk/releases) 下载对应芯片的 `.dmg`：M 系列芯片选择文件名含 `aarch64` 的安装包，Intel 芯片选择含 `x64` 的安装包。可在“关于本机”中查看芯片类型。
2. 双击打开 `.dmg`，将 `Codex Desk.app` 拖到“应用程序（Applications）”文件夹。
3. 当前安装包尚未完成 Apple 签名和公证。仅当确认安装包来自本项目 Releases 时，如被 macOS 拦截，请在“应用程序”中按住 `Control` 点击 `Codex Desk`，选择“打开”，再点击一次“打开”。
4. 如果仍被拦截，前往“系统设置 → 隐私与安全性”，在安全提示旁点击“仍要打开”。

完成安装后，仍需单独安装并登录 Codex CLI；Codex Desk 不会替代或内置 Codex CLI。

### 首次启动只需两步

1. 安装并登录 Codex CLI：`npm install -g @openai/codex`，随后执行 `codex` 完成登录。
2. 启动 Codex Desk；若看不到额度，可在设置中心确认 Codex CLI 路径，然后点击“立即刷新”重试。

## 语言

支持简体中文、繁體中文、English、日本語和한국어，可在标题栏选择语言或跟随系统。

## 数据与账户

当前账户身份和额度通过本机 Codex 服务读取；已保存账户的额度使用各自凭据直接查询官方接口。账户凭据保存在本机，不传入页面或日志。

账户库为与 Codex 目录同级的 `.codex-desk/saved-accounts.json` 明文文件，请妥善保管。旧账户库不迁移。Windows 偏好设置和 WebView 缓存位于 `.codex-desk/webview/main`。

账户切换需要 `cli_auth_credentials_store = "file"`；其他存储模式需先启用文件管理并重新登录。切换后请重启客户端核对，可选重启共享服务可能影响其他客户端。移除已保存账户不会注销当前登录。

## 运行要求

- Node.js 24 或更高版本（仅开发、打包 Codex Desk 所需；Codex CLI 的依赖取决于其安装方式）
- Rust（仅开发、打包所需）：使用 `rustup` 安装稳定版工具链
- 已安装并登录 **Codex CLI ≥ 0.157.0**
- Windows 需要 WebView2（Windows 10/11 通常已内置）

> 需要单独安装 Codex CLI，ChatGPT 桌面客户端不能替代它。

### 本机服务

Desk 自动启动或复用 Codex 共享 daemon。退出 Desk 或更改 CLI 路径不会停止该服务。

使用 `codex --version` 检查版本；需要升级时执行 `npm install -g @openai/codex@latest`。

## 开发启动

```powershell
Set-Location "<Codex Desk 项目目录>"
npm install
npm run tauri dev
```

如果 PowerShell 提示找不到 `cargo`，请确认已通过 `rustup` 安装 Rust，重新打开终端后执行 `cargo --version` 检查环境变量。

macOS 的同一项目可直接执行：

```bash
cd <Codex Desk 项目目录>
npm install
npm run tauri dev
```

## 打包

发布信息统一维护在仓库根目录的 `version.json`。新版本发布前只需修改其中的版本号、发布日期和多语言更新说明，Tauri、安装包和 Codex app-server 客户端都会读取该文件。

推送与版本号一致的 `v<版本号>` 标签后，GitHub Actions 会构建各平台安装包，并从该标签下的 `version.json` 生成中英文 Release 正文。发布前请确认各平台构建成功、Release 安装包上传齐全。

```powershell
npm run tauri build
```

输出位置：`src-tauri/target/release/bundle/`。Windows 可得到安装包，macOS 可构建 `.app`/`.dmg`；向其他 macOS 用户分发前通常需要 Apple 签名和公证。

## 使用方式

- 通过侧栏切换页面，在底部打开设置。
- 在账户管理中登录、保存或切换账户。
- 标题栏可刷新、置顶或收起为悬浮球。
- 默认每 3 分钟自动刷新，底栏显示倒计时；托盘菜单可重新打开或退出应用。
