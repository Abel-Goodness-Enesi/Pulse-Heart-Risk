# Pulse: ten-year heart risk

A Flask app that loads a saved logistic regression bundle (trained on the Framingham Heart Study) and scores people live. Move the sliders, or feed the 848 held-out test patients through the model one by one.

## Put the model in place
1. In the notebook that saved the bundle, run `import sklearn; print(sklearn.__version__)`.
2. Replace the `scikit-learn` line in `requirements.txt` with that exact version, for example `scikit-learn==1.6.1`.
3. Download `heart_risk_bundle.joblib` from the notebook output and put it in `model/`.

## Run locally
```
pip install -r requirements.txt
python app.py
```
Open http://localhost:5000

## Deploy on Render
1. Push this folder to a GitHub repository (include `model/heart_risk_bundle.joblib`).
2. On render.com choose New, then Blueprint, and pick the repository. `render.yaml` sets everything up.
   Or choose New, then Web Service, with build command `pip install -r requirements.txt` and start command `gunicorn app:app --workers 1 --threads 4 --timeout 60`.
3. On the free plan the first visit after a quiet period takes about a minute while the service wakes up.

## Files
- `app.py`: API (`/api/predict`, `/api/meta`, `/api/test-patients`) and page server
- `static/`: the page (`index.html`, `style.css`, `app.js`)
- `data/test_patients.csv`: the held-out test split with the true outcome
- `model/`: put the saved bundle here

Learning project, not medical advice. Calibration was not tested.
