# Releasing DSH Native

This guide is for maintainers. Release artifacts are built on GitHub-hosted runners; do not commit files from `dist/`.

## Release outputs

A version tag builds these targets:

- Windows x64: unsigned NSIS installer and portable executable
- macOS Apple silicon: ad-hoc-signed, non-notarized DMG and ZIP
- Linux x64: AppImage and Debian package
- SHA-256 checksum manifest covering every uploaded artifact

## Prepare a release

1. Confirm `main` is green and the working tree is clean.
2. Move the relevant entries in `CHANGELOG.md` from **Unreleased** to a dated version heading.
3. Update the version without creating a tag:

   ```sh
   npm version <major|minor|patch> --no-git-tag-version
   ```

4. Run the full local verification:

   ```sh
   npm ci
   npm run check
   npm test
   npm run package
   ```

5. Commit the version and changelog, then create an annotated tag whose name exactly matches `v<package version>`:

   ```sh
   git tag -a vX.Y.Z -m "DSH Native vX.Y.Z"
   git push origin main
   git push origin vX.Y.Z
   ```

The [Release workflow](../.github/workflows/release.yml) validates the version, builds each platform independently with electron-builder publishing disabled, verifies the complete artifact set (binaries **and** updater manifests — a release without them silently breaks self-updates for installed users), computes checksums, and publishes a GitHub release with generated notes.

## Self-updates

The desktop app checks GitHub releases through electron-updater. Checks run automatically shortly after launch and then on a 30-minute cadence; downloading and installing only ever happen on an explicit user action from the Workspaces home card or **App → Check for Updates…**.

Support matrix:

| Package | Auto-update |
| --- | --- |
| Windows NSIS setup | Supported (silent install + relaunch) |
| Windows portable | Disabled by design — no install location to update in place |
| macOS DMG/ZIP | Disabled until Developer ID signing ships (see roadmap below); ad-hoc signatures cannot pass updater verification |
| Linux AppImage | Supported |
| Linux .deb | Disabled — update through your package manager |

Channels mirror the release practice above: `stable` tracks full releases, `prerelease` opts into versions tagged with a prerelease segment (published as pre-releases). The choice persists in `update-settings.json` under the user data directory. Set `DSH_NATIVE_DISABLE_AUTO_UPDATE=1` to disable the engine entirely, and `DSH_NATIVE_UPDATE_FEED_URL` pointing at a local generic server to exercise updates during development.

## Verify publication

- Confirm all eleven release files are present: two Windows binaries, the Windows blockmap, three feed manifests, two macOS, two Linux, plus the checksum file.
- Download at least one artifact and verify its digest against `SHA256SUMS.txt`.
- Confirm the Apple silicon macOS build passed strict `codesign` verification and detected an ad-hoc signature.
- Smoke-test launch, adding an HTTPS server, connecting, and returning with **App → Servers…**.
- If any platform failed, fix the cause and create a new patch release. Do not replace binaries silently after publication.

## Signing roadmap

The workflow deliberately disables certificate discovery. macOS apps use explicit ad-hoc signing (`identity: "-"`) with hardened runtime disabled; this provides bundle integrity but not Developer ID trust or notarization. Windows binaries remain unsigned.

Before enabling trusted signing:

- store certificates, passwords, and notarization credentials only as GitHub Actions secrets;
- use environment protection for release secrets;
- replace ad-hoc macOS signing with a Developer ID Application certificate, re-enable hardened runtime, and notarize the result;
- add trusted Authenticode signing for Windows;
- retain native-runner signature checks and update public documentation only after a published release is verified.
