# Codex Desk

<p align="center">
  <strong>Monitor quota, switch accounts, and return to local Codex sessions.</strong><br />
  A local desktop console for Codex CLI on Windows, macOS, and Linux.
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

<p align="center">
  <img src="docs/screenshots/social-preview-1280x640.jpg" alt="Codex Desk 2.0 — your local companion for Codex CLI: quota, accounts, sessions, and insights" width="100%" />
</p>

## Why Codex Desk?

- **Never lose track of your quota** — keep a floating desktop indicator visible, with optional alerts at 80%, 90%, and 100% usage.
- **Return to useful work faster** — search local Codex sessions, inspect messages and file changes, then copy the exact `codex resume <session ID>` command.
- **Understand how you use Codex** — explore activity trends, recurring topics, and Token usage by day or session.
- **Keep everyday accounts ready** — use Account management to sign in through a browser or device code, save and rename accounts, update credentials, and switch between everyday accounts. Account usage also provides a shortcut; an optional shared-service restart is available when switching.
- **Keep your data on your machine** — quota and session data come from the local shared Codex daemon and local files. Account management reads and stores credentials locally, never uploads them, and never exposes tokens to the frontend or logs. Saved credentials are plaintext in `.codex-desk/saved-accounts.json`, alongside the Codex directory (under your user directory by default). The old app data directory is not read or migrated; treat saved credentials like passwords.

Requires an installed and signed-in **Codex CLI ≥ 0.157.0** ([installation guide](https://github.com/openai/codex)). If Codex Desk saves you time, a **Star** or an [Issue](https://github.com/xiaotao-xiaotao/codex-desk/issues) helps the project reach more Codex users.

## Download

Download the latest installer from [Releases](https://github.com/xiaotao-xiaotao/codex-desk/releases):

- **Windows**: download the `.exe` installer for a standard Windows 10/11 installation, or the `.msi` package for enterprise or managed deployment.
- **macOS**: download the `.dmg` installer that matches your Mac's chip.
- **Linux**: download the `.deb` package for Debian/Ubuntu, or the `.AppImage` package for most other desktop distributions.

Before launching the app, install and sign in to [Codex CLI](https://github.com/openai/codex) **version 0.157.0 or later** separately. The ChatGPT desktop app does not provide the `codex` command or the `app-server` protocol.

### macOS installation

1. From [Releases](https://github.com/xiaotao-xiaotao/codex-desk/releases), download the `.dmg` for your chip: choose the filename containing `aarch64` for Apple silicon (M-series), or `x64` for Intel Macs. You can check your chip in **About This Mac**.
2. Open the `.dmg` and drag `Codex Desk.app` into the **Applications** folder.
3. The current packages are not yet Apple-signed or notarized. Only if you downloaded the package from this project's Releases page, `Control`-click `Codex Desk` in **Applications**, choose **Open**, then confirm **Open** once more if macOS blocks it.
4. If it is still blocked, go to **System Settings → Privacy & Security** and select **Open Anyway** beside the security notice.

After installation, you still need to install and sign in to Codex CLI separately; Codex Desk does not include or replace it.

### First launch in two steps

1. Install and sign in to Codex CLI: `npm install -g @openai/codex`, then run `codex` to complete sign-in.
2. Launch Codex Desk. If quota is unavailable, confirm the Codex CLI path in **Settings**, then select **Refresh now** to retry.

## Features

- **Account and usage overview**: view a masked sign-in email, subscription plan, quota windows, reset times, and shortcuts to official billing and usage-limit reset pages. A monthly Token activity calendar and summary metrics show lifetime usage, daily peak, longest task duration, and activity streaks.
- **Multi-account sign-in and switching**: sign in through a browser or device code, save accounts locally, edit names, update credentials, and switch without repeating the full sign-in flow.
- **Quota alerts**: after you explicitly enable native notifications, get one alert per reset window at three configurable usage thresholds (80%, 90%, and 100% by default).
- **Activity trends**: view the last 3, 7, or 30 days and independently show or hide messages, tool calls, file changes, and errors in a code-drawn line chart.
- **Keyword cloud**: summarize recurring topics from user prompts over the selected range while filtering code blocks, URLs, and common technical noise.
- **Token insights**: derive daily increments from Token snapshots using event timestamps in the local time zone, covering resumed older sessions and filtering duplicate cumulative snapshots. Trends and session distributions cover the selected 3, 7, or 30 days; events without valid timestamps are excluded from daily buckets. Session details retain the final cumulative total, input, output, cached-input, and reasoning-output usage.
- **Local sessions**: browse non-archived local sessions, pin frequently used sessions above the rest, search titles without case sensitivity, and view creation and update times. The dedicated history page adapts pagination to the available window height.
- When the installed Codex CLI does not support native pin metadata, Codex Desk stores pin choices in its local app data; they do not sync to other Codex clients.
- **Sidebar navigation**: switch between Account usage, Account management, Data insights, Session topics, and Local history. Collapse the sidebar for more content space, or keep the window above other apps.
- **Session details and insights**: inspect recent turns first and load older history on demand, with intermediate replies from the same turn collapsed under elapsed time while the final reply stays expanded. Expand the overview sidebar to load full-history counts and records, enlarge images in a dedicated preview, and copy messages with images when the system clipboard supports rich content. Message search covers loaded history.
- **File change comparison**: aggregate file and tool activity below the relevant reply. File cards show filenames and added/removed line counts, and can be expanded before opening side-by-side or inline diffs. Historical diffs are shown from the session record and are not read from the current workspace.
- **Resume quickly**: copy `codex resume <session ID>` from session details and continue the session in your terminal.
- **Session import and export**: export selected sessions as portable Codex Desk bundles and import them as new sessions on another signed-in device.
- **Single-instance behavior**: launching the app again brings the existing window to the front, avoiding duplicate daemon connections and floating-orb instances.
- **Organized settings**: Connection & refresh, Alerts & privacy, and Reading categories group CLI paths, refresh intervals, quota thresholds, email masking, fonts, text sizes, and line spacing. Reading changes have a live preview; custom CLI paths are validated with `codex --version` before saving.
- **Connection recovery**: if the initial read fails, the dashboard shows a full-page connection state with a retry action. Repeated failures use bounded exponential backoff and return to the normal refresh schedule after recovery.
- **Update notifications**: manually check the public version file from the dashboard; when a newer version is available, show its Release notes and provide a download link.
- **Local data boundary**: account, quota, and session data are obtained through the local Codex app server. Token usage is read only from cumulative snapshots in local Codex session files. Account management reads and saves credentials locally, without sending them to the frontend, logs, or remote services. Update checks request only public version and Release information from GitHub.

## Screenshots

The v2.0 interface below is rendered from the current frontend with fixed demonstration data. All example emails are masked; the animation illustrates navigation and the switching flow, not a real sign-in or account switch.

### A quick tour

![Codex Desk v2.0: account usage, account management, switching flow, and settings](docs/screenshots/desktop-tour-en.gif)

### Account usage

![Account usage with quota cards and a monthly Token activity calendar](docs/screenshots/dashboard-light-en.png)

<details>
<summary>Dark theme and floating usage orb</summary>

![Codex Desk dark account usage page](docs/screenshots/dashboard-dark-en.png)

<p align="center">
  <img src="docs/screenshots/quota-orb-light-en.png" alt="Light floating usage orb" width="56" />
  <img src="docs/screenshots/quota-orb-dark-en.png" alt="Dark floating usage orb" width="56" />
</p>

</details>

### Multi-account management

![Saved accounts with masked emails and quick switch actions](docs/screenshots/accounts-en.png)

<details>
<summary>Sign-in, switch confirmation, and the local switching flow</summary>

![Browser and device-code sign-in options](docs/screenshots/account-login-en.png)

![Account switching confirmation with an optional service restart](docs/screenshots/account-switch-en.png)

![Local credential switching flow](docs/screenshots/account-switch-flow-en.png)

</details>

### Settings

![Settings organized into connection, alerts, and reading categories](docs/screenshots/settings-connection-en.png)

<details>
<summary>Quota alerts, privacy, and reading preview</summary>

![Quota alert thresholds and email masking settings](docs/screenshots/settings-alerts-en.png)

![Reading preferences with a live preview](docs/screenshots/settings-reading-en.png)

</details>

<details>
<summary>Data insights, session topics, local history, and file comparisons</summary>

![Activity trends and Token insights](docs/screenshots/insights-en.png)

![Session topic cloud](docs/screenshots/topics-en.png)

![Searchable local session history](docs/screenshots/history-en.png)

![Session details with messages and recorded file activity](docs/screenshots/session-details-en.png)

![Recorded file changes in a side-by-side comparison](docs/screenshots/file-changes-en.png)

</details>

## Multilingual support

The app provides five interface languages: Simplified Chinese, Traditional Chinese, English, Japanese, and Korean.

- In **System** mode, the app selects a language based on your operating system language.
- You can also switch languages manually from the language menu in the top-right corner.
- Your language preference is stored locally and restored on the next launch.

## Import and export

Import and export are intended for migrating or backing up **conversation text**, not for backing up the complete local Codex runtime state. Export files are unencrypted JSON; store them carefully and do not upload them to untrusted locations.

Only Codex Desk v1 bundles are supported. The app does not import Codex JSONL files or arbitrary JSON files. A single file is limited to 64 MB, and one operation supports up to 5,000 sessions.

## Requirements

- Node.js 24 or later (only required for Codex Desk development and packaging; Codex CLI dependencies depend on its installation method)
- Rust stable toolchain (only required for development and packaging), installed with `rustup`
- **Codex CLI ≥ 0.157.0**, installed and signed in
- WebView2 on Windows (normally included with Windows 10/11)

### Shared daemon lifecycle

- Desk automatically runs `codex app-server daemon start`, reusing an existing daemon. It no longer starts a dedicated `app-server --stdio` instance.
- Account and quota, session interactions, and background statistics use separate connections to the same local service.
- Quitting or restarting Desk closes only its own connections and proxies. The shared daemon and other Codex clients remain running.
- Account switching requires file credential storage (`cli_auth_credentials_store = "file"`). Saving reads the current ChatGPT credentials; switching preserves the previous account's latest tokens and atomically replaces `CODEX_HOME/auth.json`. Removing a saved record does not log out the current account. A service restart happens only when explicitly selected in the switch confirmation, and may interrupt other clients. File replacement alone does not confirm the running client's identity.
- Check your CLI with `codex --version`; upgrade older versions with `npm install -g @openai/codex@latest`. Desk enforces the minimum version and has no legacy CLI fallback.
- The CLI path in Settings launches the daemon and proxies. Changing it does not restart an existing shared daemon.

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

Release metadata has a single source of truth: `version.json` in the repository root. For a new release, update its version, publication date, and localized release notes; Tauri, the installer, the Codex app-server client, and update checks all use that file.

Push a `v<version>` tag matching the version file to build all platform installers with GitHub Actions and generate the Chinese and English Release body from that tag's `version.json`. Update checks read the version file directly from `main`, so push the tag promptly after merging release metadata and confirm that all platform builds succeed and all installers are uploaded to the Release.

```powershell
npm run tauri build
```

Build artifacts are generated under `src-tauri/target/release/bundle/`. Windows builds include an installer; macOS builds can produce `.app` and `.dmg` packages.

## Usage

- Click the floating usage orb to expand the dashboard; use **Collapse to floating orb** in the title bar to return to the orb.
- Optionally enable system quota alerts at 80% / 90% / 100% usage from the dashboard.
- Use the sidebar to open Data insights or Session topics and select a 3-, 7-, or 30-day range. Data insights shows both Token trends and session distributions; Account usage has an independent monthly activity calendar.
- Open Account management to sign in, save, or switch accounts. Restart your client after switching to verify the active account; the optional shared-service restart can affect other connected clients.
- Collapse the sidebar to gain content space, or pin the window above other apps from the title bar. Settings are available at the bottom of the sidebar.
- Search, inspect, import, or export local sessions from the session list. In session details, open recorded file diffs, or double-click an image to enlarge it.
- Copy `codex resume <session ID>` from a session detail page to continue it in the terminal.
- Drag the title area to reposition the floating window.
- Auto-refresh uses the configured interval (60 seconds by default) and shows the countdown in the status bar. Expanding from the orb keeps the existing data and refresh schedule; use **Refresh now** for an immediate update.
- Use **Minimize to system tray** to hide the dashboard and reopen, restart, or quit the app from the tray menu.

## License

See [LICENSE](LICENSE).
