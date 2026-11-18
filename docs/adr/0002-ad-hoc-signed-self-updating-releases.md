# Releases are ad-hoc signed and update themselves

Pushing a `v*` tag builds an Apple Silicon `.dmg` on GitHub Actions and publishes it as a GitHub Release. The app is ad-hoc signed and not notarized: the project has no paid Apple Developer account, and a download with no signature at all is reported as "damaged" on Apple Silicon. So the first install needs one Open Anyway in System Settings. After that, the Board updates itself through the Tauri updater, which checks the GitHub Releases at launch and once a day and asks before it installs.

## Considered Options

- **Developer ID + notarization**: opens with no warning, but costs a yearly Apple membership plus certificate secrets in CI. A drop-in change later: the workflow gains the signing secrets and nothing else moves.
- **No updater**: simpler, but every new version would mean downloading again and clicking Open Anyway again.

## Consequences

- Every installed copy carries the updater's public key. If the private key (kept outside the repo, backed up by the maintainer, and stored as a GitHub secret) is lost, those copies can never update again and have to be reinstalled by hand.
- An ad-hoc signature changes with every build, so macOS may ask again for any folder permission it guards (Documents, Desktop) after an update.
