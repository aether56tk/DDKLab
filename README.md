# DDKLab

**Local-only Diadochokinetic (DDK) analysis application.**

## 📥 Download DDKLab

### 🪟 Windows

[⬇️ Download DDKLab for Windows — Direct `.exe`](https://github.com/aether56tk/DDKLab/releases/latest/download/DDKLab-Setup-1.1.0.exe)

**One click → download → install.**

### 📱 Android

**Android:** The CI currently produces a signed APK artifact for testing. Download the `DDKLab-Android-1.2.0` artifact from the [DDKLab Actions](https://github.com/aether56tk/DDKLab/actions) page. A Play Store-ready release requires a persistent release signing key and store configuration.

> Android may ask you to allow installation from this source. Only install APKs obtained from this official DDKLab repository/release.

### Releases

[View all DDKLab Releases](https://github.com/aether56tk/DDKLab/releases)

### 🌐 Web app

The repository includes a GitHub Pages deployment workflow for the browser version. The Pages URL is normally `https://aether56tk.github.io/DDKLab/`; verify the deployment status in the repository Actions/Pages settings before sharing it publicly.

> **Windows:** No Node.js, npm, Flutter, or development setup is required to use the installed application.

## 🧪 Tester feedback

We are currently collecting real-user feedback from BASLP/SLP students, clinicians, faculty, and researchers.

**Feedback form:** https://github.com/aether56tk/DDKLab/issues/new?template=feedback.md

Please report usability problems, recording issues, unexpected DDK results, waveform/marker issues, and requested features. Do not post identifiable patient information or real participant recordings.

## Current build

The repository contains an Electron Windows application and an Android build with local microphone recording, waveform rendering, deterministic envelope-based event detection, AMR/SMR result logic, local session persistence, local export, child reinforcement, and application security controls.

### Run from source

Install Node.js, then from the repository root:

```bash
npm install
npm start
```

The desktop app does not require Firebase, Supabase, or a cloud backend.

## DDK rules

### AMR
- PA
- TA
- KA

Each completed production counts as **one AMR event**.

### SMR
- PA-TA-KA

Each complete PA-TA-KA sequence counts as **one SMR cycle**. For example, `PA-TA-KA PA-TA-KA PA-TA-KA` = **3 cycles**, not 9.

## Architecture

DDKLab is intentionally local-first:

- No Firebase
- No Firestore
- No Supabase
- No cloud database
- No cloud audio processing
- No Gemini in the measurement path
- Audio and results remain on the device
- Windows Electron context isolation and sandboxing are enabled

Session metadata and recordings are stored locally. The Windows application PIN uses Electron's OS-backed `safeStorage` facility when available.

## Measurement pipeline

```text
Microphone
  ↓
PCM audio
  ↓
Deterministic DSP
  ↓
Amplitude / energy envelope
  ↓
Event detection
  ↓
AMR / SMR grouping
  ↓
Waveform + markers
  ↓
Human verification
  ↓
Final DDK measurements
  ↓
Local storage / export
```

The current detector is a **PRELIMINARY** envelope/temporal detector. It is not yet research-validated and must not be represented as a clinically validated or perfect peak detector.

## Workflow constraints

- One continuous take
- No pause button
- No replay button
- No manual save button
- Automatic local session storage after processing
- Waveform is shown for inspection
- Child mode provides non-clinical reinforcement only

## Security

The application includes application-level security controls and OS-backed secure storage where available. No application can honestly guarantee that it is impossible to hack; the security layer is designed to reduce unauthorized local access.

## Research validation

Passing synthetic or development tests is not evidence of research-grade validity. Validation must use real human DDK recordings with expert ground-truth annotation and should evaluate count error, timing error, precision, recall, and F1 as appropriate.

Do not claim diagnostic accuracy, clinical validation, or 100% accuracy without evidence.

## Privacy

Do not place real participant recordings, names, clinical records, or other identifiable information in this public repository.
