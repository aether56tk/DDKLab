# DDKLab

**Local-only Diadochokinetic (DDK) analysis application.**

## Scope

DDKLab is focused exclusively on DDK recording, waveform inspection, deterministic event detection, human verification, local storage, and research-oriented export.

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

The target is a packaged application using the native/local persistence mechanisms of its target platform.

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

The detector must distinguish multiple acoustic maxima belonging to one production from genuinely separate productions. Uncertain events must be flagged for review rather than guessed.

## Important validation status

The initial automatic detector is **PRELIMINARY**. Passing synthetic development tests does not establish research-grade validity. Research-grade validation requires real human DDK recordings with expert annotation and comparison against ground truth.

Do not claim diagnostic accuracy, clinical validation, or 100% accuracy without evidence.

## Security

The application includes an application-level lock/PIN and platform-supported secure key protection where available. Raw PINs must never be stored. The application must not claim to be impossible to hack; security controls are intended to reduce unauthorized local access.

## Core workflow

```text
START
 ↓
RECORD ONE CONTINUOUS TAKE
 ↓
STOP
 ↓
PROCESS
 ↓
ANALYZE
 ↓
WAVEFORM REVIEW
 ↓
VALID / REVIEW / INVALID
 ↓
LOCAL SESSION STORAGE
```

There is intentionally no pause, replay, or manual save control in the recording workflow.

## Child reinforcement mode

Child mode may provide simple reinforcement such as a car moving forward when valid target productions/cycles are detected. Reinforcement must never alter the measurement result or fabricate events.

## Research data

Session records should include coded participant/session identifiers, task, target, original recording, automatic events, human annotations, final measurements, validity status, and detector/DSP version information.

Exports should support WAV, CSV, and JSON without uploading participant data.

## Development principle

Measurement correctness takes priority over visual features. Do not replace deterministic DSP with an LLM or speech-analysis API.

The public repository must not contain real participant recordings, names, clinical records, or other identifiable data.
