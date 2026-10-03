# DDKLab Empirical Validation Protocol

## Purpose
Establish performance of the DDK event detector against expert-annotated recordings without treating synthetic tests as clinical evidence.

## Frozen evaluation unit
Each recording must have:
- speaker/session identifier replaced by a study code
- task: PA, TA, KA or PATAKA
- recording duration
- sampling rate and microphone/recording context
- algorithm version and DSP configuration
- expert event annotations

## Reference annotation
Use at least two independent trained annotators for the benchmark subset. Define:
- event onset rule
- event inclusion/exclusion rule
- uncertain/ambiguous event handling
- treatment of missed or extra events

Resolve disagreements using a predefined adjudication rule.

## Primary outcomes
Compare detector output with the reference annotations using:
- event precision
- event recall
- F1
- total-count error
- absolute timing error
- failure rate

Define matching tolerance before inspecting results.

## Secondary analysis
Where sample size permits, report results by:
- AMR vs SMR
- age group
- dysarthria/clinical status category
- recording condition
- speech rate

Do not silently remove difficult recordings.

## Reproducibility record
Every benchmark run should retain:
- Git commit SHA
- browser and operating system
- sample rate
- microphone/recording context
- DSP version and parameters
- dataset version
- annotation protocol version

## Human-in-the-loop boundary
Automatic markers remain candidate annotations until verified by a human. Passing synthetic benchmarks or browser tests does not establish clinical validity.
