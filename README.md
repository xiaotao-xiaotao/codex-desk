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
  <img src="docs/screenshots/desktop-tour-en.gif" alt="Codex Desk v2.0: account usage, account management, switching flow, and settings" width="100%" />
</p>

## Features

- **Quota**: remaining usage, reset times, a floating indicator, and configurable alerts.
- **Accounts**: browser or device-code sign-in, local account storage, and switching.
- **Insights**: Token activity calendar, usage trends, session distribution, and topic cloud.
- **Sessions**: title search, pinning, message history, file diffs, and `codex resume` commands. Message search covers loaded history.
- **Settings**: connection, alerts, privacy, and reading preferences with a live preview.
- **Codex config**: file credentials, direct HTTP connections, and common preferences with copyable TOML examples.
- **Desktop**: collapsible sidebar, light/dark themes, tray controls, and five interface languages.

Requires **Codex CLI ≥ 0.157.0** ([installation guide](https://github.com/openai/codex)).

## Download

Download the latest installer from [Releases](https://github.com/xiaotao-xiaotao/codex-desk/releases):

- **Windows**: download the `.exe` installer for a standard Windows 10/11 installation, or the `.msi` package for enterprise or managed deployment.
- **macOS**: download the `.dmg` installer that matches your Mac's chip.
- **Linux**: download `.deb` for Debian/Ubuntu, `.rpm` for Fedora and other compatible RPM-based distributions, or `.AppImage` for other desktop distributions.

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

## Screenshots

Screenshots use sample data and masked emails. The animation demonstrates navigation, without performing a real account switch.

<details>
<summary>Brand preview</summary>

![Codex Desk 2.0 — your local companion for Codex CLI: quota, accounts, sessions, and insights](docs/screenshots/social-preview-1280x640.jpg)

</details>

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

### Codex config

Reference settings for file-based account switching, direct HTTP connections, and common preferences. Copy examples into `config.toml` as needed; the app does not edit your configuration.

![Codex config: direct HTTP connection and copyable example](docs/screenshots/codex-config-http-en.png)

<details>
<summary>File credentials and common preferences</summary>

![File credential storage and current mode detection](docs/screenshots/codex-config-accounts-en.png)

![Reasoning effort, web search, response detail, and terminal notifications](docs/screenshots/codex-config-preferences-en.png)

</details>

<details>
<summary>Data insights, session topics, local history, and file comparisons</summary>

![Activity trends and Token insights](docs/screenshots/insights-en.png)

![Session topic cloud](docs/screenshots/topics-en.png)

![Searchable local session history](docs/screenshots/history-en.png)

![Session details with messages and recorded file activity](docs/screenshots/session-details-en.png)

![Recorded file changes in a side-by-side comparison](docs/screenshots/file-changes-en.png)

</details>

## Languages

Simplified Chinese, Traditional Chinese, English, Japanese, and Korean. Select a language in the title bar, or follow the system language.

## Data and accounts

Quota and session data come from the local Codex service and files. Account credentials stay on this device and are not sent to the frontend, logs, or remote services. Update checks request public release information from GitHub.

Saved credentials are plaintext in `.codex-desk/saved-accounts.json`, alongside the Codex directory. Keep this file private. Old account storage is not migrated.

Account switching requires `cli_auth_credentials_store = "file"`. Restart your client after switching to verify the active account. An optional shared-service restart may interrupt other clients; removing a saved account does not log out the current account.

## Import and export

Select sessions in **Local history** to export, or import a Codex Desk v1 bundle. Each imported conversation creates a new session; repeating an import creates duplicates.

Bundles contain conversation text, not credentials, tools, file diffs, or complete runtime state. Files are unencrypted JSON. Limits: 64 MB per file and 5,000 sessions per operation; raw Codex JSONL is not supported.

## Requirements

- Node.js 24 or later (only required for Codex Desk development and packaging; Codex CLI dependencies depend on its installation method)
- Rust stable toolchain (only required for development and packaging), installed with `rustup`
- **Codex CLI ≥ 0.157.0**, installed and signed in
- WebView2 on Windows (normally included with Windows 10/11)

### Local service

Desk starts or reuses the shared Codex daemon. Quitting Desk or changing the CLI path leaves the daemon running.

Check the CLI with `codex --version`; upgrade with `npm install -g @openai/codex@latest` if needed.

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

- Navigate with the sidebar; open Settings at the bottom.
- Use Account management to sign in, save, or switch accounts.
- Search local sessions and copy `codex resume <session ID>` from the details page.
- Use the title bar to refresh, pin the window, or collapse it into the floating orb.
- Auto-refresh defaults to 60 seconds. The status bar shows its countdown; the tray menu can reopen or quit the app.

## License

See [LICENSE](LICENSE).
