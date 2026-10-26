# Codex Desk

<p align="center">
  <strong>Monitor Codex quota and manage accounts.</strong><br />
  A local desktop console for Codex on Windows, macOS, and Linux.
</p>

<p align="center">
  <a href="https://github.com/xiaotao-xiaotao/codex-desk/releases"><strong>Download the latest release</strong></a>
  · <a href="README.zh-CN.md">中文</a>
</p>

<p align="center">
  <a href="https://github.com/xiaotao-xiaotao/codex-desk/releases"><img src="https://img.shields.io/github/v/release/xiaotao-xiaotao/codex-desk?display_name=tag&sort=semver" alt="Latest release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/xiaotao-xiaotao/codex-desk" alt="MIT License" /></a>
  <a href="https://github.com/xiaotao-xiaotao/codex-desk/stargazers"><img src="https://img.shields.io/github/stars/xiaotao-xiaotao/codex-desk?style=flat" alt="GitHub stars" /></a>
</p>

## Features

- **Account usage**: quota windows, reset times, subscription and reset credits, with billing and quota reset shortcuts.
- **Accounts**: browser or device-code sign-in, local storage, editing, and switching.
- **Settings**: refresh interval, network proxy, quota alerts, and email masking.
- **Desktop**: floating quota orb, always-on-top mode, collapsible sidebar, light/dark themes, tray controls, and five interface languages.

Sign-in and quota queries use HTTPS directly. No Codex CLI installation is required.

## Download

Download the latest installer from [Releases](https://github.com/xiaotao-xiaotao/codex-desk/releases):

- **Windows**: download the `.exe` installer for a standard Windows 10/11 installation, or the `.msi` package for enterprise or managed deployment.
- **macOS**: download the `.dmg` installer that matches your Mac's chip.
- **Linux**: download `.deb` for Debian/Ubuntu, `.rpm` for Fedora and other compatible RPM-based distributions, or `.AppImage` for other desktop distributions.

On first launch, sign in from Account management using browser authorization or a device code.

### macOS installation

1. From [Releases](https://github.com/xiaotao-xiaotao/codex-desk/releases), download the `.dmg` for your chip: choose the filename containing `aarch64` for Apple silicon (M-series), or `x64` for Intel Macs. You can check your chip in **About This Mac**.
2. Open the `.dmg` and drag `Codex Desk.app` into the **Applications** folder.
3. The current packages are not yet Apple-signed or notarized. Only if you downloaded the package from this project's Releases page, `Control`-click `Codex Desk` in **Applications**, choose **Open**, then confirm **Open** once more if macOS blocks it.
4. If it is still blocked, go to **System Settings → Privacy & Security** and select **Open Anyway** beside the security notice.

After installation, sign in directly from Codex Desk.

### First launch in two steps

1. Launch Codex Desk and sign in to ChatGPT using browser authorization or a device code in Account management.
2. Switch to a saved account to view quota. If the network is unavailable, check the proxy in Settings and refresh.

## Languages

Simplified Chinese, Traditional Chinese, English, Japanese, and Korean. Select a language in the title bar, or follow the system language.

## Data and accounts

All accounts use their own credentials for direct HTTPS quota and reset-credit queries, with token renewal when needed. Browser sign-in uses PKCE and a loopback callback; device-code sign-in polls the authorization service directly. Quota queries and sign-in do not start Codex CLI; account switching invokes the CLI to restart app-server only if it was running. Credentials remain local and are not sent to the frontend or logs.

Quota, reset credits, and device authorization use compatibility endpoints and may require updates when upstream responses or access restrictions change. Cards, the orb, alerts, and sync status share each query batch.

Saved credentials are plaintext in `.codex-desk/config.json`, alongside the Codex directory. Keep this file private. Old account storage is not migrated.

Account switching writes `CODEX_HOME/auth.json` (default `~/.codex/auth.json`) for external Codex client compatibility and requires `cli_auth_credentials_store = "file"`. Other storage modes can still query saved accounts; enable file storage before switching. After writing credentials, Desk invokes `codex app-server daemon stop` using Codex CLI on PATH and checks its JSON status. A `stopped` response triggers `start` to restart the service; `notRunning` leaves it stopped so credentials apply on its next start. Restarting may interrupt running tasks. An unknown status or failure skips further startup, preserves the switched credentials, and asks you to check the service manually; removing a saved account does not log out the current account.

## Requirements

- Node.js 24 or later (only required for development and packaging)
- Automatic service restart after account switching requires Codex CLI on PATH with `app-server daemon stop/start` support
- Rust stable toolchain (only required for development and packaging), installed with `rustup`
- A ChatGPT account and network access to the authorization and quota services
- WebView2 on Windows (normally included with Windows 10/11)

## Development

```powershell
npm install
npm run tauri dev
```

On macOS, the same commands can be run from the project directory:

```bash
npm install
npm run tauri dev
```

## Build

Release metadata has a single source of truth: `version.json` in the repository root. For a new release, update its version, publication date, and localized release notes; Tauri, the installer, and the HTTPS client use that file.

Push a `v<version>` tag matching the version file to build all platform installers with GitHub Actions and generate the Chinese and English Release body from that tag's `version.json`. Confirm that all platform builds succeed and all installers are uploaded to the Release before publishing.

```powershell
npm run tauri build
```

Build artifacts are generated under `src-tauri/target/release/bundle/`. Windows builds include an installer; macOS builds can produce `.app` and `.dmg` packages.

## Usage

- Navigate with the sidebar; open Settings at the bottom.
- Use Account management to sign in, save, or switch accounts.
- Use the title bar to refresh, pin the window, or collapse it into the floating orb.
- Auto-refresh defaults to 3 minutes. The status bar shows its countdown; the tray menu can reopen or quit the app.

## License

See [LICENSE](LICENSE).
