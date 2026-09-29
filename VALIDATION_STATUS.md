# Validation Status

## Current status

DDKLab software is implemented and testable. **Clinical/research validation against human expert-annotated DDK recordings remains pending.**

### Complete software work

- Local deterministic DSP pipeline
- AMR/SMR grouping
- Waveform/event visualization
- Confidence metadata
- Local session persistence
- Windows packaging
- Android packaging workflow
- Security controls
- Automated smoke/syntax checks
- Research proposal and validation documentation

### Still required before any validation claim

1. Obtain appropriately governed human DDK recordings.
2. Define annotation protocol and ground-truth rules.
3. Obtain independent expert annotations.
4. Freeze a benchmark algorithm version.
5. Compare event counts and event timing.
6. Report precision, recall, F1, count error and timing error.
7. Evaluate performance by task, speaker group and relevant recording conditions.
8. Document failures and limitations.

Passing software tests or synthetic benchmarks is **not** evidence of clinical validity.

## Public-repository rule

Never commit identifiable participant recordings, names, clinical records, consent documents or other sensitive research material.
