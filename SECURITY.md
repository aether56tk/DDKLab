# Security Policy

## Scope

DDKLab is a **browser-based, local-first** web application for DDK assessment, waveform review, and research validation.

Security reports are welcome for:
- unsafe handling of browser-originated data
- cross-origin or injection issues
- unsafe DOM operations
- unintended remote-content execution
- unauthorized access to data exposed by the web application
- GitHub Actions supply-chain issues
- privacy or data-leakage issues

## Reporting a vulnerability

Please do not publish an exploit or sensitive details in a public issue.

Open a private security report through GitHub's **Report a vulnerability** feature when it is available for this repository. If private reporting is unavailable, contact the maintainer through the GitHub profile and request a private disclosure channel.

Include:
1. affected version/commit
2. reproducible steps
3. security impact
4. screenshots or logs where useful
5. a minimal proof of concept when safe

## Security limitations

DDKLab cannot guarantee that a browser application is impossible to compromise. Security controls are defense-in-depth measures.

Browser microphone access is controlled by the browser and operating system. Users should only grant microphone permission to the intended DDKLab web origin.

The DDK detector is preliminary and is not a clinically validated diagnostic system.

Do not submit identifiable patient information, clinical records, credentials, private keys, or real participant recordings to public GitHub issues.

## Browser security baseline

The application is designed as a static browser application with local-first processing and storage. It does not require a cloud database for the core DDK workflow.

GitHub Actions workflows should use least-privilege permissions and immutable action references where practical.
