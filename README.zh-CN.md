# Codex Desk

<p align="center">
  <strong>掌握 Codex 额度，管理和切换账户。</strong><br />
  面向 Windows、macOS 和 Linux 的本地 Codex 桌面控制台。
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
- **设置**：刷新间隔、网络代理、额度提醒与邮箱脱敏。
- **桌面功能**：悬浮球、窗口置顶、可收起侧栏、明暗主题、系统托盘与五种界面语言。

登录和额度查询均通过 HTTPS 直接完成，无需安装 Codex CLI。

## 下载

前往 [Releases](https://github.com/xiaotao-xiaotao/codex-desk/releases) 下载最新安装包：

- Windows：普通用户下载 `.exe` 安装包（Windows 10/11）；企业或集中部署可选择 `.msi` 安装包。
- macOS：下载与芯片匹配的 `.dmg` 安装包。
- Linux：Debian/Ubuntu 下载 `.deb`；Fedora 等兼容 RPM 的发行版下载 `.rpm`；其他桌面发行版可下载 `.AppImage`。

首次启动后，可在账户管理中使用浏览器或设备码登录。

### macOS 安装说明

1. 在 [Releases](https://github.com/xiaotao-xiaotao/codex-desk/releases) 下载对应芯片的 `.dmg`：M 系列芯片选择文件名含 `aarch64` 的安装包，Intel 芯片选择含 `x64` 的安装包。可在“关于本机”中查看芯片类型。
2. 双击打开 `.dmg`，将 `Codex Desk.app` 拖到“应用程序（Applications）”文件夹。
3. 当前安装包尚未完成 Apple 签名和公证。仅当确认安装包来自本项目 Releases 时，如被 macOS 拦截，请在“应用程序”中按住 `Control` 点击 `Codex Desk`，选择“打开”，再点击一次“打开”。
4. 如果仍被拦截，前往“系统设置 → 隐私与安全性”，在安全提示旁点击“仍要打开”。

安装后可直接在 Codex Desk 中登录账户。

### 首次启动只需两步

1. 启动 Codex Desk，在账户管理中使用浏览器或设备码完成 ChatGPT 授权。
2. 切换到已保存账户后查看额度；网络不可达时，在设置中检查代理，再点击“立即刷新”。

## 语言

支持简体中文、繁體中文、English、日本語和한국어，可在标题栏选择语言或跟随系统。

## 数据与账户

所有账户统一使用各自凭据，通过 HTTPS 查询额度及重置卡，并在凭据过期时续期。浏览器登录使用 PKCE 与本地回调，设备码登录直接轮询授权服务。额度查询和登录不启动 Codex CLI；切换账户时会调用 CLI，仅重启已运行的 app-server。账户凭据保存在本机，不传入页面或日志。

额度、重置卡和设备授权使用兼容接口，响应格式或访问限制变化时可能需要更新适配。顶部、列表、悬浮球和同步状态共用每轮查询结果。

账户库为与 Codex 目录同级的 `.codex-desk/config.json` 明文文件，请妥善保管。旧账户库不迁移。Windows 偏好设置和 WebView 缓存位于 `.codex-desk/webview/main`。

账户切换通过写入 `CODEX_HOME/auth.json` 与外部 Codex 客户端兼容（默认 `~/.codex/auth.json`），需要 `cli_auth_credentials_store = "file"`。其他存储模式可直接查询保存账户；切换前需启用文件管理。写入成功后，Desk 通过 PATH 中的 Codex CLI 执行 `codex app-server daemon stop`，根据 JSON 状态决定后续操作：`stopped` 时执行 `start` 重启原服务，`notRunning` 时保持关闭，下次启动生效。重启可能中断运行中的任务。状态异常或重启失败时不再自动启动，凭据仍已切换，界面会提示手动检查服务。移除已保存账户不会注销当前登录。

## 运行要求

- Node.js 24 或更高版本（仅开发、打包所需）
- Rust（仅开发、打包所需）：使用 `rustup` 安装稳定版工具链
- 可登录的 ChatGPT 账户，以及可访问授权和额度服务的网络
- 账户切换后自动重启服务需要 PATH 中的 Codex CLI 支持 `app-server daemon stop/start`
- Windows 需要 WebView2（Windows 10/11 通常已内置）

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

发布信息统一维护在仓库根目录的 `version.json`。新版本发布前只需修改其中的版本号、发布日期和多语言更新说明，Tauri、安装包和 HTTPS 客户端都会读取该文件。

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
