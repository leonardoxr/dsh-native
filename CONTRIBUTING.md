# Contributing to DSH Native

Thank you for helping improve DSH Native. Bug reports, documentation fixes, tests, and focused feature contributions are welcome.

## Before you start

- Search [existing issues](https://github.com/leonardoxr/dsh-native/issues) before filing a duplicate.
- Use the bug or feature issue form so maintainers have enough context.
- For a substantial behavior or architecture change, open an issue first and describe the problem and proposed direction.
- Keep pull requests focused. Unrelated cleanup should be a separate change.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Local setup

You need Node.js 22.12 or newer and npm.

```sh
git clone https://github.com/leonardoxr/dsh-native.git
cd dsh-native
npm ci
npm start
```

The server picker starts empty on a new profile. Add an HTTPS endpoint you control for manual testing.

For iOS work, install Xcode 26 and XcodeGen on an Apple-silicon Mac. Run `ios/scripts/build.sh` on that Mac, or use `./scripts/build-ios-remote.ps1` from Windows with a configured SSH host. The iOS-specific architecture and signing notes are in [`ios/README.md`](ios/README.md).

## Project checks

Run these commands before submitting a pull request:

```sh
npm run check
npm test
npm run package
```

- `npm run check` validates JavaScript syntax.
- `npm test` runs the Node.js test suite.
- `npm run package` creates an unpacked app for the current platform and catches packaging errors.

CI repeats these checks. Maintainers build all release targets from version tags.

## Code guidelines

- Desktop code follows the existing CommonJS style: two-space indentation, single quotes, and no semicolons.
- iOS code follows standard Swift API naming, four-space indentation, and SwiftUI composition.
- Prefer small functions and platform APIs over new runtime dependencies.
- Add or update tests when behavior can be exercised outside Electron.
- Explain non-obvious Electron lifecycle or security decisions in comments.
- Do not commit `node_modules/`, `dist/`, credentials, server lists, or application profile data.

### Security boundary

Connected sites are untrusted renderer content. Changes must preserve these invariants:

- `contextIsolation` stays enabled.
- `nodeIntegration` stays disabled for renderers.
- Privileged IPC is exposed only to the bundled local server picker.
- Saved entry points and in-app navigation stay on the selected HTTPS origin.
- New external-window behavior must default to denying in-app windows and use the system browser only when appropriate.

If a change affects that boundary, explain the threat model and manual verification in the pull request. Report discovered vulnerabilities using [SECURITY.md](SECURITY.md), not a public issue.

## Pull requests

1. Branch from `main`.
2. Make the smallest complete change.
3. Update documentation and `CHANGELOG.md` for user-visible behavior.
4. Run all project checks.
5. Fill in the pull request template, including testing and screenshots when the picker UI changes.

Use a clear, imperative title such as `Fix server picker preload bridge`. Pull requests are squash-merged unless maintainers request another strategy.

## Releases

Release builds and checksums are created by GitHub Actions. Maintainers should follow [docs/RELEASING.md](docs/RELEASING.md); contributors should not commit generated artifacts.

## License

By contributing, you agree that your contribution is licensed under the repository's [MIT License](LICENSE).
