# Audio-Clinical Lab

**A web-based case-based clinical reasoning platform for undergraduate audiology education.**

Audio-Clinical Lab brings three connected learning domains into one structured clinical-reasoning workflow:

- 🧠 **TinniSense** — tinnitus assessment and management
- ♿ **RehabMind** — audiological rehabilitation and person-centred care
- 🦻 **HearWise** — hearing-aid assessment, verification and troubleshooting

## Research project

**Proposed title:** Development and Pilot Evaluation of a Web-Based Case-Based Clinical Reasoning Platform for Undergraduate Audiology Education: A Multi-Domain Study of Tinnitus, Audiological Rehabilitation, and Hearing-Aid Management.

The platform is designed as an educational/research prototype. It is **not a diagnostic or patient-management system** and must not be used for real clinical decision-making.

## Clinical reasoning workflow

Each simulated case follows a standardized sequence:

1. Patient profile and case history
2. Diagnostic findings
3. Clinical interpretation
4. Red-flag recognition / referral
5. Management or device decision
6. Evidence-based written justification
7. Follow-up, verification and outcome planning

## Current MVP scope

The research protocol specifies expansion to **16–20 simulated cases**. Fourteen cases are currently explicitly specified in the supplied protocol (6 tinnitus, 4 rehabilitation, 4 hearing-aid). The remaining cases will be added after case-development and expert review rather than being invented without validation.

## Research outcomes

Planned measures include:

- Clinical reasoning score
- Diagnostic/management knowledge
- Self-reported clinical confidence (1–5)
- Decision latency
- System Usability Scale (SUS)
- Perceived educational value

The planned design is a quasi-experimental pre-test/post-test study, with an optional conventional-teaching comparison group if feasible and approved.

## Technology

- React
- JavaScript
- Responsive web interface
- Modular case engine
- Structured scoring and feedback
- Anonymized research-session logging

No personally identifiable participant information should be committed to this public repository.

## Repository structure

```text
AUDIO-CLINICAL-LAB/
├── research/
├── src/
│   ├── components/
│   ├── engine/
│   ├── modules/
│   │   ├── tinnitus/
│   │   ├── rehabilitation/
│   │   └── hearing-aids/
│   └── views/
├── data/
└── docs/
```

## Development status

**Phase 1 — Foundation / MVP**

- [x] Repository initialized
- [x] Research structure defined
- [ ] Case engine
- [ ] TinniSense MVP
- [ ] RehabMind MVP
- [ ] HearWise MVP
- [ ] Pre-test/post-test flow
- [ ] Scoring and feedback
- [ ] Usability evaluation
- [ ] Expert validation

## Ethics and data governance

The research protocol requires institutional ethics review/approval before participant recruitment and data collection. The public repository contains educational simulation material only. Research data should use participant codes and secure institutional storage rather than identifiable information.

## License

This project is intended for educational and research development. See `LICENSE` for the repository license.
