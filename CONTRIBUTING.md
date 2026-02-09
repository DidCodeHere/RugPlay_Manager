# Contributing to RugPlay Manager

Thank you for considering contributing to RugPlay Manager. Whether it's a bug report, feature request, code audit, or pull request — every contribution helps.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)
- [Code Contributions](#code-contributions)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)

---

## Code of Conduct

Be respectful, constructive, and professional. We're all here because we enjoy Rugplay and want to build something useful for the community.

---

## How Can I Contribute?

### Bug Reports

Found something broken? [Open a bug report](../../issues/new?template=bug_report.md) with steps to reproduce.

### Feature Requests

Have an idea for a new feature or improvement? [Open a feature request](../../issues/new?template=feature_request.md).

### Code Audits

Review the source code — especially the networking and encryption layers — and share your findings. Security audits are particularly valuable.

### Documentation

Help improve guides, fix typos, clarify instructions, or add examples.

### Code Changes

Fix bugs, implement features, or improve performance. See [Code Contributions](#code-contributions) below.

---

## Reporting Bugs

When filing a bug report, please include:

1. **What happened** — Describe the unexpected behavior
2. **What you expected** — Describe what should have happened
3. **Steps to reproduce** — Minimal steps to trigger the bug
4. **Environment** — Windows version, app version, any relevant system details
5. **Screenshots** — If applicable, screenshots help immensely
6. **Logs** — Any error messages or console output

---

## Requesting Features

When requesting a feature, please include:

1. **Problem statement** — What problem does this feature solve?
2. **Proposed solution** — How do you envision it working?
3. **Alternatives considered** — Have you thought about other approaches?
4. **Priority** — Is this a nice-to-have or a blocker?

---

## Code Contributions

### Getting Started

1. Fork the repository
2. Clone your fork locally
3. Create a branch for your changes: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test thoroughly
6. Commit with clear, descriptive messages
7. Push to your fork and open a Pull Request

### Development Setup

See [docs/BUILDING.md](docs/BUILDING.md) for complete build instructions.

Quick start:

```powershell
git clone https://github.com/YOUR_USERNAME/rugplay-manager.git
cd rugplay-manager/gui
npm install
cargo tauri dev
```

---

## Code Style

### Rust

- Follow standard Rust conventions (`cargo fmt`, `cargo clippy`)
- Use `thiserror` for error types, `anyhow` for application errors
- Prefer `async/await` over blocking operations
- Add comments for non-obvious logic
- Use descriptive variable and function names

### TypeScript / React

- Functional components with hooks
- Tailwind CSS for styling (no inline styles, no CSS modules)
- Shadcn UI components where applicable
- TypeScript strict mode — no `any` types unless absolutely necessary

### Commit Messages

- Use present tense: "Add feature" not "Added feature"
- Be specific: "Fix sentinel trailing stop calculation" not "Fix bug"
- Keep the first line under 72 characters

---

## Pull Request Process

1. **Ensure your code compiles** — `cargo build` must succeed with no errors
2. **Run clippy** — `cargo clippy` should produce no warnings
3. **Format code** — `cargo fmt` for Rust, Prettier for TypeScript
4. **Update documentation** — If your change affects user-facing behavior, update the relevant docs
5. **Describe your changes** — The PR description should explain what changed and why
6. **Link to issues** — Reference any related issue numbers (e.g., "Fixes #42")

### Review Process

- PRs are reviewed by maintainers
- We may ask for changes or clarifications
- Once approved, your PR will be merged into the main branch
- You'll be credited as a contributor

---

Thank you for helping make RugPlay Manager better.
