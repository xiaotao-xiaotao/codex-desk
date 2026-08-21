# Codex Desk

一个跨 Windows 与 macOS 的 Codex 本地桌面控制台：启动后显示置顶额度球，展开后提供额度概览、最近会话、会话搜索与会话详情。

## 运行要求

- Node.js 20 或更高版本
- Rust（仅开发、打包所需）：使用 `rustup` 安装稳定版工具链
- 已安装并登录 Codex CLI；本应用通过 `codex app-server --stdio` 读取额度，不读取或保存 `auth.json`
- Windows 需要 WebView2（Windows 10/11 通常已内置）

## 开发启动

```powershell
Set-Location "<Codex Desk 项目目录>"
npm install
npm run tauri dev
```

如果 PowerShell 提示找不到 `cargo`，说明 Rust 安装目录尚未加入 `PATH`。先将实际安装目录加入当前终端；例如本机自定义安装在 D 盘时：

```powershell
$toolchainBin = "$env:USERPROFILE\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin"
$env:Path = "$toolchainBin;D:\Software\Rust\cargo\bin;$env:Path"
npm run tauri dev
```

建议随后将 Rust 的 `cargo\bin` 目录加入用户 `PATH`，避免每次都要设置。

macOS 的同一项目可直接执行：

```bash
cd <Codex Desk 项目目录>
npm install
npm run tauri dev
```

## 打包

```powershell
npm run tauri build
```

输出位置：`src-tauri/target/release/bundle/`。Windows 可得到安装包，macOS 可构建 `.app`/`.dmg`；向其他 macOS 用户分发前通常需要 Apple 签名和公证。

## 使用方式

- 点击额度球：展开或收起本地看板。
- 展开后可查看最近会话，按标题或会话 ID 模糊搜索；点击会话可查看用户消息与 Codex 回复。
- 会话详情仅展示最近 120 条可识别消息，并支持复制单条内容。
- 应用启动后会常驻一个本机 `codex app-server` 进程；额度、搜索与详情请求会严格串行复用该连接，退出应用时会将其关闭。
- 展开后可拖动标题区域改变悬浮位置。
- 每 60 秒自动刷新，点击刷新按钮可立即更新。
- 点击关闭按钮只隐藏悬浮窗；从系统托盘菜单“显示额度”可再次打开。
