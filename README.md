# DDKLab

**Local-only Diadochokinetic (DDK) analysis application.**

## Current build

The repository now contains an Electron application foundation with local microphone recording, waveform rendering, preliminary deterministic envelope-based event detection, AMR/SMR result logic, local session persistence, local export, child reinforcement, and an OS-backed application PIN gate.

### Run

Install Node.js, then from the repository root:

```bash
npm install
npm start
```

The app opens as a desktop application. It does not require Firebase, Supabase, or a cloud backend.

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

DDKLab is intentionally local-only:

- No Firebase
- No Firestore
- No Supabase
- No cloud database
- No cloud audio processing
- No Gemini in the measurement path
- No browser localStorage/IndexedDB as the application data layer
- Audio and results remain on the device
- Electron context isolation and sandboxing are enabled

Session metadata and recordings are written under the operating system's application-data directory. The application PIN uses Electron's OS-backed `safeStorage` facility when available.

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

The application includes an application-level PIN and OS-backed secure storage where available. Raw PINs are not stored. No application can honestly guarantee that it is impossible to hack; the security layer is designed to reduce unauthorized local access.

## Research validation

Passing synthetic or development tests is not evidence of research-grade validity. Validation must use real human DDK recordings with expert ground-truth annotation and should evaluate count error, timing error, precision, recall, and F1 as appropriate.

Do not claim diagnostic accuracy, clinical validation, or 100% accuracy without evidence.

## Privacy

Do not place real participant recordings, names, clinical records, or other identifiable information in this public repository.
