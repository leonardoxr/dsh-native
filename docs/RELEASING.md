# Releasing DSH Native

This guide is for maintainers. Release artifacts are built on GitHub-hosted runners; do not commit files from `dist/`.

## Release outputs

A version tag builds these unsigned targets:

- Windows x64: NSIS installer and portable executable
- macOS x64 and arm64: DMG and ZIP
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

The [Release workflow](../.github/workflows/release.yml) validates the version, builds each platform independently, computes checksums, and publishes a GitHub release with generated notes.

## Verify publication

- Confirm all nine release files are present: two Windows, four macOS, two Linux, plus the checksum file.
- Download at least one artifact and verify its digest against `SHA256SUMS.txt`.
- Smoke-test launch, adding an HTTPS server, connecting, and returning with **App → Servers…**.
- If any platform failed, fix the cause and create a new patch release. Do not replace binaries silently after publication.

## Signing roadmap

The workflow deliberately sets `CSC_IDENTITY_AUTO_DISCOVERY=false`; current binaries are unsigned. Before enabling signing:

- store certificates, passwords, and notarization credentials only as GitHub Actions secrets;
- use environment protection for release secrets;
- sign on the native platform runner;
- add notarization for macOS and trusted code signing for Windows;
- update the README and security policy only after signatures are verified in a published release.
