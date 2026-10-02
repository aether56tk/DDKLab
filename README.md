# DDKLab

**Browser-based, local-first Diadochokinetic (DDK) assessment and research-validation platform.**

## 🌐 Use DDKLab

DDKLab is intentionally **browser-only**. There is no Windows EXE, Electron desktop application, Android APK, or native app packaging.

Open the web version through GitHub Pages:

**https://aether56tk.github.io/DDKLab/**

The browser can use the device microphone after permission is granted. Audio processing and session data stay in the browser/device using the current local-first implementation.

## What it does

- 15-second AMR assessment: PA, TA, KA
- 15-second SMR assessment: PATAKA
- Adult, Child, Geriatric and Dysarthria modes
- Deterministic acoustic event detection
- Waveform visualization
- Automatic candidate-event markers
- Human waveform verification workflows
- Session history
- Batch validation
- Validation analytics
- Participant longitudinal trends
- Error Explorer
- DSP Tuning Lab
- DSP Benchmark
- DSP version registry
- CSV/JSON research exports where supported
- Child reinforcement mode
- No cloud database required for the core workflow

## Measurement pipeline

```text
Microphone
  ↓
Browser audio capture
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
Browser local storage / export
```

The automatic detector is **PRELIMINARY**. It is not clinically validated and must not be represented as a diagnostic system or as 100% accurate.

## Research validation

Validation against human expert-annotated DDK recordings remains pending.

Before making research or clinical accuracy claims:

1. Obtain appropriately governed human DDK recordings.
2. Define annotation and ground-truth rules.
3. Obtain independent expert annotations.
4. Freeze a benchmark algorithm version.
5. Compare event counts and event timing.
6. Report precision, recall, F1, count error and timing error.
7. Evaluate relevant speaker groups and recording conditions.
8. Document failures and limitations.

Passing software tests or synthetic benchmarks is not evidence of clinical validity.

## Privacy

The core workflow is local-first. Do not place real participant recordings, names, clinical records, consent documents, credentials, or other identifiable information in this public repository or public issues.

## Development

The browser version is a static web application. The main entry point is `index.html`, with DSP logic in `dsp-v5.js` and supporting browser assets in the repository.

There is intentionally **no Node/Electron/Gradle build requirement for end users**.

## Feedback

For usability problems, recording issues, unexpected DDK results, waveform/marker issues, and feature requests, use the repository issue templates.

Do not upload identifiable patient information or real participant recordings to public issues.
