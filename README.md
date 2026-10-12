# PULSE

**848 hearts. One equation.**

An interactive showcase of a heart-disease risk model trained on the Framingham Heart Study. The model was tested once on 848 people it had never seen, and everything on the page is computed live in your browser by that same model. No server and no backend.

## What's on the page

| Section | What it does |
|---|---|
| **Try it** | Dial in a person (age, blood pressure, smoking and more). The model re-scores instantly and 100 dots light up for the risk. You can also pull a real test patient and see what actually happened to them. |
| **Live feed** | Real test patients stream through the model without stopping. Each gets a score, a plain-language band (Low, Moderate, Elevated, High) and the two things pushing their number up. A running tally shows how each band really turned out. |
| **Replay** | All 848 test patients dropped at their risk scores. Drag the threshold line and watch recall and precision change. |
| **Equation** | The whole model on a receipt: 14 weights and an intercept, plus what each step does to the odds. |
| **Honest part** | Model comparison, limitations, and a not-medical-advice note. |

## The model

- **Data:** Framingham Heart Study, 4,240 people, about 15.2% developed heart disease within 10 years.
- **Split:** stratified 60/20/20 (train / validation / test). All fill values and scaler statistics come from the training set only.
- **Model:** logistic regression on 14 clinical columns, scaled.
- **Threshold:** 0.15, chosen on validation data and locked before the test set was touched.

### Results

| | PR-AUC |
|---|---|
| Logistic regression (validation) | **0.324** |
| Gradient boosting, tuned | 0.287 |
| Gradient boosting, default | 0.256 |
| No skill (positive rate) | 0.152 |

| Test set at threshold 0.15 | |
|---|---|
| Test PR-AUC | **0.300** |
| Recall | **0.589** (76 of 129 cases caught) |
| Precision | **0.258** (about 1.7× the base rate) |

Removing `prevalentStroke` lowered validation PR-AUC from 0.324 to 0.306, within noise for this sample size.

This is a moderate screener, not an oracle. The strongest signals are age, cigarettes per day and systolic blood pressure.

## Risk bands

| Band | Score | Meaning |
|---|---|---|
| Low risk | under 10% | |
| Moderate | 10–15% | below the flag line |
| Elevated | 15–30% | flagged |
| High | 30% or more | flagged |

Anyone at 15% or above is flagged. That is the locked threshold.

## How it runs in the browser

`index.html` is a single self-contained file: the styles, the script and the test data are all inside it. The model's weights are applied directly in JavaScript. Re-scoring all 848 test patients in the browser matches the notebook's predictions to about 1e-13, and the page shows this check in the Equation section.

## Run it

Open `index.html` in any modern browser. Nothing to install or build.

## Deploy

**GitHub Pages:** Settings → Pages → Deploy from branch → `main` / (root).

**Render:** New → Static Site → connect the repo → leave the build command empty → set the publish directory to `.`.

Keep `index.html` at the top level of the repo.

## Limitations

- **One town.** Framingham, Massachusetts, a mid-century cohort. It may not describe you.
- **Small sample.** About 129 positive cases in the test set. A single person moves recall by roughly 0.8 points.
- **Ranks, doesn't forecast.** Calibration was not tested, so "12 out of 100" is a score and not a promise.
- **Association, not cause.** The weights show what the model leans on, nothing more.
- **Rare inputs wobble.** Prior stroke appears in about 0.4% of people, so its weight rests on a handful of cases.

## Credits

- **The model:** trained, tested and validated by Alpha G.
- **The interface:** designed and built by AI.

## Disclaimer

This is a portfolio demonstration of a machine-learning project. It is **not medical advice** and must not be used to make health decisions. Talk to a clinician.
