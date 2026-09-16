# Audio-Clinical Lab

**A web-based case-based clinical reasoning platform for undergraduate audiology education.**

Audio-Clinical Lab brings three connected learning domains into one structured clinical-reasoning workflow:

- 🧠 **TinniSense** — tinnitus assessment and management
- ♿ **RehabMind** — audiological rehabilitation and person-centred care
- 🦻 **HearWise** — hearing-aid assessment, verification and troubleshooting

## Research project

**Proposed title:** Development and Pilot Evaluation of a Web-Based Case-Based Clinical Reasoning Platform for Undergraduate Audiology Education: A Multi-Domain Study of Tinnitus, Audiological Rehabilitation, and Hearing-Aid Management.

The platform is an educational/research prototype. It is **not a diagnostic or patient-management system** and must not be used for real clinical decision-making.

The supplied protocol describes a quasi-experimental pre-test/post-test evaluation and measures clinical reasoning, management planning, confidence, usability and decision latency. fileciteturn15file2L87-L102

## What you can do now

The current MVP is directly usable as a student practice app:

1. Open the home page.
2. Choose **TinniSense**, **RehabMind** or **HearWise**.
3. Open a simulated case.
4. Work through the seven-stage reasoning workflow.
5. Review provisional feedback.
6. Complete the 1–5 confidence check.
7. Save the case and view **My Progress**.

Progress is stored locally in the browser for this MVP. No participant research database is connected yet.

## Clinical reasoning workflow

Each case follows the protocol's seven-stage structure:

1. Case history review
2. Feature extraction
3. Diagnostic interpretation
4. Red-flag / safety screening
5. Management selection
6. Clinical justification
7. Follow-up and outcome measurement

The protocol explicitly defines these stages and the three modules. fileciteturn15file4L157-L179

## Current case library

**14 cases are playable in the current MVP:**

- TinniSense: A1–A6 — 6 cases
- RehabMind: B1–B4 — 4 cases
- HearWise: C1–C4 — 4 cases

The supplied research protocol specifies expansion to **16–20 simulated cases**, while explicitly describing 14 cases. The remaining cases should be added after case development and expert review rather than invented as research-valid cases.

## Scoring and research metrics

The protocol defines these module totals:

| Module | Maximum | Main scoring focus |
|---|---:|---|
| TinniSense | 18 | History/red flags, assessment/interpretation, management/justification/follow-up |
| RehabMind | 16 | Functional needs, COSI/GAS goal structuring, individualization/counselling |
| HearWise | 19 | Audiogram/needs synthesis, fitting/verification, troubleshooting/counselling |

The protocol also specifies confidence on a 1–5 scale, SUS on a 0–100 scale and decision latency in seconds. fileciteturn15file1L20-L45

**Important:** the case keys and feedback in this MVP are provisional. They require expert validation before participant research or publication.

## Run locally

Install Node.js, then from the repository folder:

```bash
npm install
npm run dev
```

Open the local Vite address shown in the terminal.

To test a production build:

```bash
npm run build
npm run preview
```

## GitHub Pages deployment

The repository now contains a GitHub Actions deployment workflow and Vite project-base configuration for the repository site. Vite's documented GitHub Pages flow uses the repository base path, a Pages Actions workflow, and a build step. citeturn1search1turn1search3

One GitHub account setting remains necessary: in **Repository → Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**. After that, pushes to `main` can publish the built site automatically. GitHub documents the project-site URL pattern as `https://<username>.github.io/<repository>/`. citeturn1search0turn1search2

Expected site address:

`https://aether56tk.github.io/audio-clinical-lab/`

## Technology

- React
- Vite
- JavaScript
- Responsive web interface
- Modular case engine
- SVG audiogram visualization
- Provisional scoring and feedback
- Local progress tracking
- GitHub Actions / GitHub Pages deployment

## Research data governance

The research protocol requires informed consent, voluntary participation, separation from academic grading, no personally identifiable information in the research database, unique participant codes and secure HTTPS transmission. fileciteturn15file1L46-L76

**Do not place real participant data, names, student IDs, clinical records or identifiable case material in this public repository.**

## Repository structure

```text
AUDIO-CLINICAL-LAB/
├── research/
├── .github/workflows/deploy.yml
├── src/
│   ├── components/
│   │   └── CaseEngine.jsx
│   ├── engine/
│   ├── modules/
│   │   ├── tinnitus/
│   │   ├── rehabilitation/
│   │   └── hearing-aids/
│   └── main.jsx
├── data/
└── docs/
```

## Development status

**Phase 1 — Functional research MVP**

- [x] Repository initialized
- [x] Research structure defined
- [x] Seven-stage case workflow
- [x] TinniSense A1–A6 playable
- [x] RehabMind B1–B4 playable
- [x] HearWise C1–C4 playable
- [x] Provisional scoring and feedback
- [x] Confidence capture
- [x] Local progress dashboard
- [x] Responsive clinical-education UI/UX
- [x] GitHub Pages workflow
- [ ] Pre-test/post-test research mode
- [ ] Expert validation
- [ ] Institutional ethics approval
- [ ] Secure research database
- [ ] SUS instrument
- [ ] Formal pilot study and statistical analysis

## Ethics and scope

The research protocol requires institutional ethics review/approval before participant recruitment and research data collection. The public application is an educational simulation only and does not provide clinical diagnosis or patient-management advice.

## License

See `LICENSE` for the repository license.
