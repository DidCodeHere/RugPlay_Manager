# Build From Source

> Complete guide to building RugPlay Manager from source code, including prerequisites, build steps, and troubleshooting.

[Back to Main README](../README.md)

---

## Table of Contents

- [Why Build From Source?](#why-build-from-source)
- [Prerequisites](#prerequisites)
- [Build Steps](#build-steps)
- [Development Mode](#development-mode)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Why Build From Source?

- **Verify the code** — Read every line, confirm there's nothing malicious, then compile it yourself
- **Modify behavior** — Customize the bot for your own trading style
- **Contribute** — Fix bugs or add features and submit a pull request
- **Learn** — Study a real-world Rust + Tauri + React application

---

## Prerequisites

### 1. Rust Toolchain

Install Rust via [rustup](https://rustup.rs/):

```powershell
# Download and run the rustup installer from https://rustup.rs
# Then verify installation:
rustc --version
cargo --version
```

Required: Rust stable (1.70+)

### 2. Node.js

Install Node.js from [nodejs.org](https://nodejs.org/):

```powershell
# Verify installation:
node --version    # v18+ required
npm --version
```

### 3. Tauri Prerequisites

Tauri 2.0 requires several system dependencies:

**Windows:**

- **Microsoft Visual Studio C++ Build Tools** — Install from [Visual Studio Downloads](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  - Select "Desktop development with C++" workload
- **WebView2** — Usually pre-installed on Windows 10/11. If not, [download here](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

**Linux (Debian/Ubuntu):**

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev patchelf libxdo-dev libssl-dev build-essential curl wget
```

### 4. Tauri CLI

```powershell
cargo install tauri-cli
```

---

## Build Steps

### Clone the Repository

```powershell
git clone https://github.com/DidCodeHere/RugPlay_Manager.git
cd RugPlay_Manager
```

### Install Frontend Dependencies

```powershell
cd gui
npm install
```

### Build Release Binary

```powershell
# Windows (builds NSIS + MSI installers)
cargo tauri build
```

```bash
# Linux (builds deb + AppImage)
cargo tauri build --bundles deb,appimage
```

This will:

1. Compile all Rust crates (core, networking, engine, persistence, gui)
2. Build the React frontend (via Vite)
3. Bundle everything into a native executable with platform installers

The output will be at:

```
# Windows
target/release/rugplay-gui.exe
target/release/bundle/nsis/RugPlay Manager_<version>_x64-setup.exe
target/release/bundle/msi/RugPlay Manager_<version>_x64_en-US.msi

# Linux
target/release/rugplay-gui
target/release/bundle/deb/RugPlay Manager_<version>_amd64.deb
target/release/bundle/appimage/RugPlay Manager_<version>_amd64.AppImage
```

Build time is typically 3-8 minutes on a modern machine (first build). Subsequent builds are faster due to caching.

---

## Development Mode

For active development with hot-reload:

```powershell
cd gui
cargo tauri dev
```

This starts:

- The Vite dev server (frontend hot-reload on file changes)
- The Rust backend in debug mode
- A native window pointing to the dev server

Changes to `.tsx`, `.ts`, or `.css` files will hot-reload instantly. Changes to Rust files will trigger a recompile (typically 5-15 seconds for incremental builds).

---

## Project Structure

```
rugplay-manager/
├── Cargo.toml              # Workspace root — defines all crates
├── Cargo.lock              # Locked dependency versions
├── crates/
│   ├── core/               # Data models, shared types, error definitions
│   │   └── src/
│   │       ├── models/     # Coin, Trade, User, Portfolio structs
│   │       ├── types/      # Type aliases, enums
│   │       └── errors/     # Error types and Result aliases
│   ├── networking/          # HTTP client and API wrappers
│   │   └── src/
│   │       ├── http/       # reqwest client, cookie handling, headers
│   │       └── api/        # Endpoint wrappers (buy, sell, portfolio, etc.)
│   ├── engine/              # Trading logic and strategy execution
│   │   └── src/
│   │       ├── strategies/ # Sniper, Mirror, Sentinel implementations
│   │       ├── risk/       # Stop-loss, take-profit, trailing stop logic
│   │       └── executor/   # Trade queue and order execution
│   └── persistence/         # Data storage and encryption
│       └── src/
│           ├── sqlite/     # SQLx queries, migrations, connection pool
│           ├── encryption/ # AES-256-GCM token encryption
│           └── cache/      # In-memory caching layer
├── gui/
│   ├── src-tauri/           # Tauri backend (Rust)
│   │   ├── src/
│   │   │   ├── main.rs     # Application entry point
│   │   │   ├── lib.rs      # Tauri command registration
│   │   │   ├── commands/   # Tauri IPC command handlers (auth, trading, research, etc.)
│   │   │   ├── mobile_server.rs  # Embedded HTTP server for mobile access
│   │   │   ├── mobile_dashboard.html  # Mobile web UI
│   │   │   └── mobile_app.js     # Mobile web JavaScript
│   │   ├── Cargo.toml      # GUI crate dependencies
│   │   └── tauri.conf.json # Tauri configuration
│   ├── src/                 # React frontend (TypeScript)
│   │   ├── components/     # React components organized by feature
│   │   │   ├── auth/       # Authentication screen, profile management
│   │   │   ├── dashboard/  # Dashboard overview
│   │   │   ├── portfolio/  # Holdings view
│   │   │   ├── market/     # Market browser
│   │   │   ├── coin/       # Coin detail pages
│   │   │   ├── feed/       # Live trade feed
│   │   │   ├── sniper/     # Sniper configuration
│   │   │   ├── sentinel/   # Sentinel management
│   │   │   ├── mirror/     # Mirror trading setup
│   │   │   ├── dipbuyer/   # Dip buyer coin tiers, signals & history
│   │   │   ├── automation/ # Automation log viewer
│   │   │   ├── user/       # User profile pages
│   │   │   ├── leaderboard/# Leaderboard tabs
│   │   │   ├── mobile/     # Mobile access control
│   │   │   ├── settings/   # Settings pages with reset-to-defaults
│   │   │   ├── about/      # About & Guides page (research data, doc viewer)
│   │   │   └── layout/     # Sidebar, Dashboard shell
│   │   ├── hooks/          # Custom React hooks (research manifest, etc.)
│   │   ├── stores/         # State management
│   │   └── lib/            # Utilities and type definitions
│   ├── package.json        # Frontend dependencies
│   ├── vite.config.ts      # Vite bundler configuration
│   └── tailwind.config.js  # Tailwind CSS configuration
└── DemoImages/              # Screenshots for documentation
```

### Crate Dependency Graph

```
gui (src-tauri)
 ├── rugplay-engine
 │    ├── rugplay-core
 │    └── rugplay-networking
 │         └── rugplay-core
 └── rugplay-persistence
      └── rugplay-core
```

---

## Troubleshooting

### `cargo tauri dev` fails with "port already in use"

The Vite dev server (port 5173) may still be running from a previous session:

```powershell
# Kill any lingering Node processes
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
```

### Rust compilation errors

Make sure you're on the latest stable Rust:

```powershell
rustup update stable
```

### `npm install` fails

Try deleting `node_modules` and reinstalling:

```powershell
cd gui
Remove-Item -Recurse -Force node_modules
npm install
```

### WebView2 not found

Download and install the WebView2 Runtime from [Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

### Build is very slow

First builds compile all dependencies from scratch (200+ crates). This is normal. Incremental builds will be much faster. For faster full builds, consider:

```powershell
# Use more parallel jobs
$env:CARGO_BUILD_JOBS = "8"
cargo tauri build
```

### SQLx "database not found" errors

The database is created at runtime. SQLx compile-time checking may fail if no database file exists. This is handled by the SQLx offline mode — ensure the `.sqlx/` directory is present in the persistence crate.

---

[Back to Main README](../README.md) · [Architecture >](ARCHITECTURE.md)
