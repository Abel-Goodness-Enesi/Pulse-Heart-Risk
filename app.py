"""Pulse: live ten-year heart risk, served from the saved model bundle."""
import math
import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory

BASE = Path(__file__).parent
MODEL_PATH = Path(os.environ.get("MODEL_PATH", BASE / "model" / "heart_risk_bundle.joblib"))

if not MODEL_PATH.exists():
    raise SystemExit(
        f"Model bundle not found at {MODEL_PATH}. "
        "Copy heart_risk_bundle.joblib into the model/ folder and redeploy."
    )

bundle = joblib.load(MODEL_PATH)
SCALER = bundle["ss"]
MODEL = bundle["model"]
MEDIANS = bundle["train_median"]
COLS = list(bundle["column_order"])
THRESHOLD = float(bundle["threshold"])

COEF = MODEL.coef_[0]
BASE_PROB = 1 / (1 + math.exp(-float(MODEL.intercept_[0])))  # a person exactly average on every input

TEST = pd.read_csv(BASE / "data" / "test_patients.csv")

app = Flask(__name__, static_folder="static", static_url_path="/static")


def clean(payload):
    row = {}
    for c in COLS:
        try:
            v = float(payload.get(c))
            if math.isnan(v) or math.isinf(v):
                raise ValueError
        except (TypeError, ValueError):
            v = float(MEDIANS[c])  # blank inputs fall back to the training median
        row[c] = v
    return pd.DataFrame([row], columns=COLS)


@app.get("/")
def index():
    return send_from_directory("static", "index.html")


@app.get("/api/meta")
def meta():
    return jsonify(
        threshold=THRESHOLD,
        base_prob=BASE_PROB,
        columns=COLS,
        defaults={c: float(MEDIANS[c]) for c in COLS},
        n_test=int(len(TEST)),
    )


@app.get("/api/test-patients")
def test_patients():
    return jsonify(columns=list(TEST.columns), rows=TEST.values.tolist())


@app.post("/api/predict")
def predict():
    payload = request.get_json(silent=True) or {}
    X = clean(payload)
    Z = SCALER.transform(X)
    prob = float(MODEL.predict_proba(Z)[0, 1])
    contrib = (COEF * Z[0]).tolist()
    return jsonify(
        prob=prob,
        flagged=prob >= THRESHOLD,
        threshold=THRESHOLD,
        base_prob=BASE_PROB,
        contributions=[{"feature": c, "value": float(X[c].iloc[0]), "push": float(p)} for c, p in zip(COLS, contrib)],
    )


@app.get("/healthz")
def health():
    return "ok"


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5000)))
