# Security Policy

## Reporting a vulnerability

Please report security issues **privately** through GitHub's private vulnerability
reporting: go to the [Security tab](https://github.com/efaware/efa_sdk/security)
and choose *Report a vulnerability*. That opens a private advisory visible only to
the maintainers.

Please do **not** open a public issue or pull request for a suspected vulnerability.

We are a small team, so we cannot promise a fixed response window — but reports go
to the maintainers directly and we treat them ahead of feature work. Please include
what you can: affected version, a minimal reproduction, and the impact you see.

## Scope

This repository ships two things, and both are in scope:

- **`@efa-one/sdk`** — the published npm package (sources under `src/`). Auth and
  session handling, service discovery, the gateway client and the frontend IPC layer
  are the parts where a defect has the widest blast radius.
- **`template/`** — the application scaffold. It is copied into every new efa-one app,
  so an insecure default there propagates.

Out of scope: findings that require an attacker to already control the Converge
kernel, the gateway, or the host — those are not a boundary the SDK defends.

## Supported versions

Fixes go into the latest release of the current major line. Older majors are not
patched; consuming apps update with `npm update @efa-one/sdk`.

## What runs on every change

| Check | Scope |
|---|---|
| `npm audit` (fail on HIGH/CRITICAL) | SDK + both scaffold directories |
| License gate (no GPL/AGPL/LGPL) | SDK + both scaffold directories |
| Trivy filesystem scan (incl. devDependencies) | whole repository |
| Trivy misconfig & secret scan | whole repository (report-only) |
| CodeQL | JavaScript/TypeScript + GitHub Actions |
| Secret scanning + push protection | whole repository |
| Dependabot (version + security updates) | npm, Docker base images, GitHub Actions |

Third-party GitHub Actions are pinned to a commit SHA, and the npm package is
published from a tag via OIDC trusted publishing — there is no long-lived npm token
in this repository.
