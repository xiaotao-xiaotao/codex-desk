# Codex Desk

一个跨 Windows 与 macOS 的 Codex 本地桌面控制台：启动后显示置顶额度球，展开后提供额度概览、会话浏览、近 7 天活动趋势与会话详情洞察。

## 功能概览

- **额度概览**：展示当前套餐、额度窗口、已用比例和重置时间。
- **近 7 天趋势**：以代码绘制可切换的折线趋势图，可查看消息、工具调用、文件变更和异常四个维度。
- **最近会话**：读取最近更新的最多 100 个会话，每页展示 10 个；支持按标题或会话 ID 模糊搜索，并同时显示创建时间与最后更新时间。
- **会话详情与洞察**：查看用户消息和 Codex 回复、复制单条内容，并汇总消息数、工具调用数、文件变更数和异常数；可展开查看最近 30 条结构化操作记录。
- **本地数据边界**：所有数据均通过本机 `codex app-server --stdio` 获取；不读取或解析本地 JSONL、不会读取或保存 `auth.json`，也不会调用账号信息接口。

## 统计口径

- 趋势图展示最近 7 个自然日。消息按所属回合的时间归档；回合时间缺失时，才使用会话最后更新时间作为回退。
- 趋势的“消息”仅统计可识别的用户消息和 Codex 回复。每个会话最多纳入最新 500 条消息，与详情页的消息展示上限一致。
- 详情页上方的四项洞察基于该会话返回的全部可识别回合汇总；因此其中的消息数可能大于详情区域实际显示的 500 条消息。
- 趋势数据缓存 60 秒；手动刷新会跳过缓存并重新聚合。

## 运行要求

- Node.js 20 或更高版本
- Rust（仅开发、打包所需）：使用 `rustup` 安装稳定版工具链
- 已安装并登录 Codex CLI；本应用通过 `codex app-server --stdio` 读取额度和会话数据，不读取或保存 `auth.json`
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
- 展开后可在额度区域下方查看近 7 天趋势，点击“消息 / 工具 / 文件变更 / 异常”切换指标。
- 最近会话支持按标题或会话 ID 模糊搜索；点击会话可查看详情，复制会话 ID 或单条消息内容。
- 会话详情最多展示最新 500 条可识别消息；上方洞察区展示汇总指标，展开“近期操作”可查看结构化记录。
- 应用启动后会常驻一个本机 `codex app-server` 进程；额度、会话、详情和趋势请求会严格串行复用该连接，退出应用时会将其关闭。
- 展开后可拖动标题区域改变悬浮位置。
- 每 60 秒自动刷新，点击刷新按钮可立即更新。
- 点击关闭按钮只隐藏悬浮窗；从系统托盘菜单“显示额度”可再次打开。
