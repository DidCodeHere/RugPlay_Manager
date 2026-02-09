# Installation Guide

> Complete step-by-step guide to downloading, installing, and configuring RugPlay Manager.

[Back to Main README](../README.md)

---

## Table of Contents

- [Quick Install (Recommended)](#quick-install-recommended)
- [Getting Your Session Token](#getting-your-session-token)
- [First-Time Setup](#first-time-setup)
- [Updating](#updating)
- [Uninstalling](#uninstalling)
- [Troubleshooting](#troubleshooting)

---

## Quick Install (Recommended)

### Step 1: Download

1. Go to the [**Releases Page**](../../releases/latest)
2. Download the latest `.zip` file (e.g., `RugPlay-Manager-v0.1.0-windows.zip`)
3. **Note:** Your browser or Windows Defender may warn you about downloading an `.exe` — this is normal for any unsigned application. See the [Security FAQ](#windows-defender--smartscreen-warning) below.

### Step 2: Extract

1. Right-click the downloaded `.zip` file
2. Select **"Extract All..."**
3. Choose a folder (e.g., `C:\Users\YourName\Desktop\RugPlay Manager`)
4. Click **Extract**

### Step 3: Run

1. Open the extracted folder
2. Double-click **`RugPlay Manager.exe`**
3. The application will launch with the authentication screen

> **Tip:** Pin the app to your taskbar for quick access — right-click the taskbar icon while running and select "Pin to taskbar."

---

## Getting Your Session Token

RugPlay Manager authenticates with Rugplay.com using your session cookie. This is the same token your browser uses — the app simply reuses it to make requests on your behalf.

### Chrome / Edge / Brave

1. Open [rugplay.com](https://rugplay.com) and **log in**
2. Press `F12` to open Developer Tools
3. Click the **Application** tab (top bar)
4. In the left sidebar, expand **Cookies** > click `https://rugplay.com`
5. Find the row named `__Secure-better-auth.session_token`
6. Double-click the **Value** column to select the full token
7. Press `Ctrl+C` to copy

<div align="center">

_The token is a long string that looks like:_

```
aBcDeFgHiJkLmNoPqRsTuVwXyZ012345.AbCdEfGhIjKlMnOpQr...
```

</div>

### Firefox

1. Open [rugplay.com](https://rugplay.com) and **log in**
2. Press `F12` to open Developer Tools
3. Click the **Storage** tab
4. Expand **Cookies** > `https://rugplay.com`
5. Find `__Secure-better-auth.session_token`
6. Copy the value

### Important Notes About Your Token

|                 Safe                 |             Unsafe              |
| :----------------------------------: | :-----------------------------: |
|      Paste into RugPlay Manager      |     Share with anyone else      |
| Store in RugPlay Manager (encrypted) |  Paste into Discord / websites  |
|     Get a new one if it expires      | Use tokens from unknown sources |

> **Your token is encrypted with AES-256-GCM before being stored locally.** It never leaves your machine. See [SECURITY.md](SECURITY.md) for technical details.

---

## First-Time Setup

### 1. Enter Your Token

When you first launch RugPlay Manager, you'll see the authentication screen:

1. Paste your session token into the input field
2. Click **"Authenticate"**
3. The app will verify your token against Rugplay.com
4. Once verified, you'll see your username and balance appear

### 2. Explore the Dashboard

After authenticating, you'll land on the **Dashboard** — your command center:

- **Balance** — Your current Rugplay cash balance
- **Portfolio Value** — Total value of all your coin holdings
- **Net Worth** — Balance + Portfolio combined
- **Module Status** — Quick view of which modules are active

### 3. Configure Your First Module

We recommend starting with **Sentinel** (portfolio protection):

1. Click **Sentinel** in the sidebar
2. Select a coin from your holdings
3. Set a **Stop-Loss** percentage (e.g., -15%)
4. Set a **Take-Profit** percentage (e.g., +50%)
5. Enable the sentinel — it will now auto-sell if prices hit your targets

### 4. Explore Other Features

- **Live Feed** — Watch real-time trades across the platform
- **Market** — Browse all coins with live prices
- **Sniper** — Set up auto-buying for new coin launches
- **Mirror** — Start copying whale traders

---

## Updating

### From Release Downloads

1. Download the latest release from the [Releases Page](../../releases/latest)
2. Extract and replace your existing files
3. Your settings and database (`rugplay.db`) are preserved automatically

### What's Preserved on Update

- Your authenticated session
- All module configurations (Sentinel targets, Sniper settings, etc.)
- Transaction history
- Whale watchlist

---

## Uninstalling

RugPlay Manager is portable — it doesn't install anything to your system. To remove it:

1. Close the application
2. Delete the application folder
3. _(Optional)_ Delete the local database file `rugplay.db` in the same directory

That's it — no registry entries, no leftover files, no background services.

---

## Troubleshooting

### Windows Defender / SmartScreen Warning

When running an unsigned `.exe`, Windows may show a SmartScreen warning:

1. Click **"More info"**
2. Click **"Run anyway"**

> **Why does this happen?** Windows SmartScreen warns about any application that isn't signed with a paid code signing certificate. Since RugPlay Manager is a free, open-source project, we don't purchase certificates. You can verify the safety of the app by [building from source](BUILDING.md) or [auditing the code](SECURITY.md).

### "Token Invalid" Error

- Make sure you copied the **entire** token value (it's very long)
- Ensure you're copying from the correct cookie: `__Secure-better-auth.session_token`
- Try logging out and back into Rugplay.com, then get a fresh token
- Make sure you include any `%3D` or special characters at the end

### Application Won't Start

- Ensure you're running Windows 10 64-bit or later
- Try running as Administrator (right-click > Run as administrator)
- Check if WebView2 Runtime is installed — [download here](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

### API Errors / Trades Not Executing

- Your session token may have expired — get a fresh one from Rugplay
- Check your internet connection
- Ensure Rugplay.com is accessible in your browser
- Check the app logs for detailed error messages

---

[Back to Main README](../README.md) · [Features Guide >](FEATURES.md)
