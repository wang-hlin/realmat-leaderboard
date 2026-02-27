import csv
import io
import os
from pathlib import Path
from statistics import pstdev
from typing import Dict, List, Tuple

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[1]
GROUNDTRUTH_PATH = Path(os.getenv("GROUNDTRUTH_PATH", ROOT / "fine_tune" / "test_groundtruth.csv"))
LEADERBOARD_PATH = Path(os.getenv("LEADERBOARD_PATH", ROOT / "data" / "metrics_agg_filtered.csv"))
EPS = 1e-8

app = FastAPI(title="RealMat Leaderboard API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_groundtruth(path: Path) -> Dict[str, float]:
    if not path.exists():
        raise RuntimeError(f"Groundtruth file not found: {path}")
    gt: Dict[str, float] = {}
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or "id" not in reader.fieldnames or "bg" not in reader.fieldnames:
            raise RuntimeError("Groundtruth CSV must contain columns: id,bg")
        for row in reader:
            mid = (row.get("id") or "").strip()
            if not mid:
                continue
            try:
                gt[mid] = float(row["bg"])
            except (TypeError, ValueError):
                raise RuntimeError(f"Invalid bg value for id={mid!r}")
    if not gt:
        raise RuntimeError("Groundtruth CSV is empty")
    return gt


GROUNDTRUTH = load_groundtruth(GROUNDTRUTH_PATH)
GT_IDS = list(GROUNDTRUTH.keys())


def parse_prediction_csv(content: str) -> Dict[str, float]:
    reader = csv.DictReader(io.StringIO(content))
    fields = [x.strip().lower() for x in (reader.fieldnames or [])]
    if "id" not in fields or "prediction" not in fields:
        raise HTTPException(status_code=400, detail="Prediction CSV must contain columns: id,prediction")

    preds: Dict[str, float] = {}
    for row in reader:
        mid = (row.get("id") or "").strip()
        if not mid:
            continue
        if mid in preds:
            raise HTTPException(status_code=400, detail=f"Duplicate id in prediction file: {mid}")
        raw = (row.get("prediction") or "").strip()
        if raw == "":
            raise HTTPException(status_code=400, detail=f"Missing prediction for id: {mid}")
        try:
            preds[mid] = float(raw)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid prediction value for id={mid}")
    return preds


def validate_alignment(preds: Dict[str, float]) -> None:
    pred_ids = set(preds.keys())
    gt_ids = set(GROUNDTRUTH.keys())
    missing = sorted(gt_ids - pred_ids)
    extra = sorted(pred_ids - gt_ids)
    if missing:
        sample = ", ".join(missing[:8])
        raise HTTPException(status_code=400, detail=f"Missing {len(missing)} ids. Examples: {sample}")
    if extra:
        sample = ", ".join(extra[:8])
        raise HTTPException(status_code=400, detail=f"Found {len(extra)} unknown ids. Examples: {sample}")


def compute_metrics(preds: Dict[str, float]) -> Dict[str, float]:
    y_true = [GROUNDTRUTH[mid] for mid in GT_IDS]
    y_pred = [preds[mid] for mid in GT_IDS]

    abs_err = [abs(p - y) for p, y in zip(y_pred, y_true)]
    rel_err = [ae / max(abs(y), EPS) for ae, y in zip(abs_err, y_true)]

    mae_mean = sum(abs_err) / len(abs_err)
    mrae_mean = sum(rel_err) / len(rel_err)
    mae_std = pstdev(abs_err) if len(abs_err) > 1 else 0.0
    mrae_std = pstdev(rel_err) if len(rel_err) > 1 else 0.0

    y_bar = sum(y_true) / len(y_true)
    ss_res = sum((y - p) ** 2 for y, p in zip(y_true, y_pred))
    ss_tot = sum((y - y_bar) ** 2 for y in y_true)
    r2_mean = 1.0 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
    r2_std = 0.0

    return {
        "mrae_mean": mrae_mean,
        "mrae_std": mrae_std,
        "mae_mean": mae_mean,
        "mae_std": mae_std,
        "r2_mean": r2_mean,
        "r2_std": r2_std,
    }


def estimate_rank(mrae_mean: float, train_mode: str) -> int:
    split_dir = "finetune" if train_mode == "pretrain" else "train_from_scratch"
    vals: List[float] = []
    with LEADERBOARD_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if (row.get("split_dir") or "").strip() != split_dir:
                continue
            if (row.get("split_name") or "").strip() != "":
                continue
            raw = (row.get("test_mrae_mean") or "").strip()
            try:
                vals.append(float(raw))
            except ValueError:
                continue
    if not vals:
        return 1
    better = sum(1 for v in vals if v < mrae_mean)
    return better + 1


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/api/leaderboard/evaluate-temp")
async def evaluate_temp(
    model_name: str = Form(...),
    train_mode: str = Form(...),
    prediction_file: UploadFile = File(...),
) -> Dict[str, object]:
    if train_mode not in {"pretrain", "no_pretrain"}:
        raise HTTPException(status_code=400, detail="train_mode must be one of: pretrain, no_pretrain")
    if not model_name.strip():
        raise HTTPException(status_code=400, detail="model_name is required")

    raw = await prediction_file.read()
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Prediction file must be UTF-8 CSV")

    preds = parse_prediction_csv(content)
    validate_alignment(preds)
    metrics = compute_metrics(preds)
    rank = estimate_rank(metrics["mrae_mean"], train_mode)
    return {
        "message": "Temporary evaluation completed.",
        "model_name": model_name.strip(),
        "train_mode": train_mode,
        "metrics": metrics,
        "rank": rank,
    }


app.mount("/", StaticFiles(directory=str(ROOT), html=True), name="static")
