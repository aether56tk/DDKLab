# Security Policy

## Scope

DDKLab is a local-first Electron/web application for DDK assessment, waveform review, and research validation.

Security reports are welcome for:
- Electron main/preload security
- renderer isolation or sandbox escapes
- IPC authorization
- unsafe navigation or remote-content execution
- local file/data access outside the intended application data directory
- dependency or GitHub Actions supply-chain issues
- authentication/PIN bypasses

## Reporting a vulnerability

Please do **not** publish an exploit or sensitive details in a public issue.

Open a private security report through GitHub's **Report a vulnerability** feature when it is available for this repository. If private reporting is unavailable, contact the maintainer through the GitHub profile and request a private disclosure channel.

Include:
1. affected version/commit
2. reproducible steps
3. security impact
4. screenshots or logs where useful
5. a minimal proof of concept when safe

Allow reasonable time for investigation and remediation before public disclosure.

## Security limitations

DDKLab cannot guarantee that the application is impossible to compromise. Security controls are defense-in-depth measures.

The DDK detector is preliminary and is not a clinically validated diagnostic system.

Do not submit identifiable patient information, clinical records, credentials, private keys, or real participant recordings to public GitHub issues.

## Development security baseline

The Electron desktop build uses context isolation, renderer sandboxing, disabled Node integration, restricted navigation/window creation, IPC sender validation, local payload limits, OS-backed PIN storage where available, and a restrictive renderer Content Security Policy.

GitHub Actions workflows should use least-privilege permissions and immutable action references.
