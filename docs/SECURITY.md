# Security & Transparency

> A comprehensive look at how RugPlay Manager handles your data, why we're open source, and how you can verify everything yourself.

[Back to Main README](../README.md)

---

## Table of Contents

- [Our Security Philosophy](#our-security-philosophy)
- [What the App Does](#what-the-app-does)
- [What the App Does NOT Do](#what-the-app-does-not-do)
- [Session Token Handling](#session-token-handling)
- [Network Activity](#network-activity)
- [Local Data Storage](#local-data-storage)
- [How to Audit Us](#how-to-audit-us)
- [Mobile Access Security](#mobile-access-security)
- [Responsible Disclosure](#responsible-disclosure)

---

## Our Security Philosophy

We understand the concern: "Why should I give my session token to a third-party app?"

It's a valid question, and it's exactly the reason we made RugPlay Manager **100% open source**. We believe that trust should be earned through transparency, not demanded through marketing. Every single line of code in this application is here in this repository for anyone to read, audit, and verify.

We don't ask you to trust us. We ask you to verify us.

---

## What the App Does

RugPlay Manager performs the following actions, and **only** these actions:

1. **Sends HTTP requests to `rugplay.com`** — The same GET and POST requests your browser makes when you use Rugplay normally. These include:
   - Fetching your portfolio (`/api/portfolio`)
   - Fetching market data (`/api/market`)
   - Fetching recent trades (`/api/trades/recent`)
   - Executing buy orders (`/api/coins/{symbol}/buy`)
   - Executing sell orders (`/api/coins/{symbol}/sell`)
   - Claiming rewards (`/api/rewards/claim`)
   - Fetching user profiles (`/api/users/{id}`)

2. **Stores data locally in SQLite** — Your holdings, transaction history, module settings, and encrypted session token are stored in a local `rugplay.db` file on your machine.

3. **Encrypts your session token** — Before storing, your token is encrypted using AES-256-GCM with a machine-specific key derived via Argon2.

---

## What the App Does NOT Do

- **Does NOT send your token to any external server** — The token is used exclusively in HTTP headers to `rugplay.com`. Search the codebase yourself: `grep -r "token" crates/networking/`

- **Does NOT collect telemetry or analytics** — No usage tracking, no crash reporting, no "phone home" behavior. Zero.

- **Does NOT access any website other than `rugplay.com`** — The only exception is `trycloudflare.com` if and only if you explicitly enable Mobile Remote Access. This uses Cloudflare Quick Tunnels to make the mobile dashboard accessible outside your LAN.

- **Does NOT store your Rugplay password** — We never ask for it. We don't need it. The session token is all that's required.

- **Does NOT modify your Rugplay account** — No profile changes, no settings changes, no email changes. Only trading actions and reward claims.

- **Does NOT run background processes after you close it** — When you close the app, it stops. No hidden services, no startup entries, no tray icons.

---

## Session Token Handling

### What is a session token?

When you log into Rugplay.com, the server creates a session and stores a token in your browser's cookies. This token proves you're logged in. RugPlay Manager uses this same token — nothing more.

### How we store it

```
Your Token (plaintext)
       |
       v
  AES-256-GCM Encryption
  (Key derived from machine UID via Argon2)
       |
       v
  Encrypted blob stored in SQLite
  (rugplay.db → auth table)
```

1. When you enter your token, it's immediately encrypted using AES-256-GCM
2. The encryption key is derived from your machine's unique hardware ID using Argon2 (a password hashing algorithm)
3. The encrypted token and its initialization vector (IV) are stored in the local SQLite database
4. When the app needs to make API requests, it decrypts the token in memory, uses it, and never writes the plaintext to disk

### Why machine-bound encryption?

Even if someone copies your `rugplay.db` file, they cannot decrypt the token without access to your specific machine's hardware ID. The token is effectively bound to your computer.

### Relevant source files

- `crates/persistence/src/encryption/` — Encryption/decryption implementation
- `crates/persistence/src/sqlite/` — Database storage layer
- `crates/networking/src/http/` — Where the token is used in HTTP requests

---

## Network Activity

### Outbound connections

RugPlay Manager connects to exactly **two** destinations:

| Destination   | Purpose                                            | When                               |
| ------------- | -------------------------------------------------- | ---------------------------------- |
| `rugplay.com` | All API requests (portfolio, trading, market data) | Always                             |
| `bore.pub`    | Tunnel for Mobile Remote Access                    | Only when Mobile Access is enabled |

That's it. No analytics servers. No CDNs. No third-party APIs. No telemetry endpoints.

### How to verify

**Method 1: F12 Developer Tools**

RugPlay Manager is built on Tauri, which uses a web view. You can open Developer Tools just like in a browser:

1. While the app is running, the Tauri dev build allows DevTools access
2. Go to the **Network** tab
3. Watch every single request the app makes
4. You'll see they all go to `rugplay.com`

**Method 2: Firewall monitoring**

Use Windows Firewall, Wireshark, or any network monitoring tool to observe outbound connections from the `RugPlay Manager.exe` process.

**Method 3: Source code search**

```powershell
# Find every URL or HTTP call in the codebase
grep -r "https://" crates/
grep -r "reqwest" crates/
grep -r "Client::" crates/
```

Every result will point to `rugplay.com`.

---

## Local Data Storage

All data is stored in a single SQLite database file (`rugplay.db`) in the application directory. Here's what's in it:

| Table          | Contents                                           | Sensitive? |
| -------------- | -------------------------------------------------- | :--------: |
| `auth`         | Encrypted session token + IV                       | Encrypted  |
| `coins`        | Cached coin metadata (name, symbol, icon URL)      |     No     |
| `transactions` | Your trade history (buy/sell, amount, price, time) |     No     |
| `holdings`     | Current coin holdings and average entry prices     |     No     |
| `whales`       | Mirror trading watchlist (user IDs and usernames)  |     No     |

### What happens if someone gets your `rugplay.db`?

- They can see your trade history and holdings (not sensitive — this is all visible on Rugplay anyway)
- They **cannot** decrypt your session token without physical access to your machine (machine-bound encryption)
- They cannot use the database to access your Rugplay account

---

## How to Audit Us

We don't just allow auditing — we actively encourage it. Here's a structured approach:

### 1. Read the networking code

The `crates/networking/` directory contains every HTTP request the app makes. Start here:

- `crates/networking/src/http/` — The HTTP client and request building
- `crates/networking/src/api/` — API endpoint wrappers

### 2. Check for hardcoded URLs

```powershell
grep -rn "http" crates/ --include="*.rs" | grep -v "rugplay.com" | grep -v "///"
```

This will show any HTTP reference that isn't Rugplay. You should only see `bore.pub` (for Mobile Access).

### 3. Verify encryption

- `crates/persistence/src/encryption/` — Read the AES-256-GCM implementation
- Verify that `machine-uid` is used for key derivation
- Confirm that plaintext tokens are never written to disk

### 4. Build from source

The ultimate verification — compile the exact same code yourself:

```powershell
git clone <this-repo>
cd rugplay-manager/gui
npm install
cargo tauri build
```

Now you're running code you've personally compiled from source you've personally reviewed.

### 5. Compare release binaries

If you want to verify that our release `.exe` matches the source code, build from the same tagged commit and compare file hashes.

---

## Mobile Access Security

When you enable Mobile Remote Access, the app starts a local HTTP server and creates a tunnel through `bore.pub` to make it accessible from outside your network.

### Security measures

- **PIN authentication** — A random 6-digit PIN is generated each time you start the mobile server. Without this PIN, nobody can access your data.
- **Session tokens** — After PIN verification, a random session token is issued. This token expires when you stop the mobile server.
- **No persistent storage** — The mobile server stores nothing externally. All data comes from your local database.
- **One-way data** — The mobile dashboard is read-only in terms of sensitive data. It displays portfolio info but cannot execute trades or access your session token.
- **Kill switch** — You can disconnect all mobile sessions instantly from the desktop app.

### What `bore.pub` is

[Bore](https://github.com/ekzhang/bore) is an open-source tunneling tool. It creates a TCP tunnel from a random port on `bore.pub` to your local machine. It doesn't inspect, store, or log your traffic. The project is MIT-licensed and the source code is publicly auditable.

---

## Responsible Disclosure

If you discover a security vulnerability in RugPlay Manager, please report it responsibly:

1. **Do NOT open a public GitHub issue** for security vulnerabilities
2. Instead, email the maintainers or open a private security advisory on GitHub
3. Provide as much detail as possible — steps to reproduce, potential impact, suggested fix
4. We will acknowledge receipt within 48 hours and work on a fix promptly

We take security seriously and appreciate the efforts of security researchers who help keep this project safe.

---

[Back to Main README](../README.md) · [Architecture >](ARCHITECTURE.md)
