# Security Policy

## Supported versions

Security fixes are applied to the latest release and the `main` branch. Older binaries may contain known issues; users should update to the newest release.

## Report a vulnerability

Please **do not open a public issue** for a suspected vulnerability.

Use GitHub's [private vulnerability reporting form](https://github.com/leonardoxr/dsh-native/security/advisories/new). Include:

- the affected version and operating system;
- a clear description of the impact;
- reproduction steps or a proof of concept;
- any suggested mitigation, if known.

The maintainer will acknowledge reports on a best-effort basis, investigate, and coordinate disclosure and a fix with the reporter. Avoid accessing data or systems you do not own while testing.

## Security model

DSH Native intentionally renders user-configured remote web apps. The main trust boundary is between those remote pages and Electron's privileged main process. Remote content must not gain Node.js or host-management IPC access. Saved server entry points and in-app navigation are restricted to HTTPS on the selected origin. Cross-origin HTTPS destinations open in the system browser, where the address is visible. Users remain responsible for trusting the servers they add and their content.

Unsigned release binaries may trigger operating-system warnings. Validate downloads with the release's `SHA256SUMS.txt` and obtain artifacts only from this repository's [Releases page](https://github.com/leonardoxr/dsh-native/releases).
