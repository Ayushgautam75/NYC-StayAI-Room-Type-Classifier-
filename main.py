from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import pandas as pd
import joblib
import os


# =========================================================
# FastAPI App
# =========================================================

app = FastAPI(
    title="NYC Airbnb Room Type Classifier",
    description="ML API for predicting Airbnb room type",
    version="1.0.0"
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# Model Path
# =========================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "Model_Pipeline.pkl")


if not os.path.exists(MODEL_PATH):
    raise FileNotFoundError(
        f"Model file not found: {MODEL_PATH}"
    )


# =========================================================
# Load Model Pipeline
# =========================================================

model = joblib.load(MODEL_PATH)


# =========================================================
# Feature Columns
# =========================================================

COLUMNS = [
    "latitude",
    "longitude",
    "price",
    "minimum_nights",
    "number_of_reviews",
    "reviews_per_month",
    "calculated_host_listings_count",
    "availability_365",
    "neighbourhood_group",
    "neighbourhood"
]


# =========================================================
# Pydantic Input Model
# =========================================================

class Features(BaseModel):

    latitude: float = Field(
        ...,
        ge=-90,
        le=90,
        description="Latitude coordinate"
    )

    longitude: float = Field(
        ...,
        ge=-180,
        le=180,
        description="Longitude coordinate"
    )

    price: float = Field(
        ...,
        gt=0,
        description="Price per night"
    )

    minimum_nights: int = Field(
        ...,
        ge=1,
        le=365,
        description="Minimum nights required"
    )

    number_of_reviews: int = Field(
        ...,
        ge=0,
        description="Total number of reviews"
    )

    reviews_per_month: float = Field(
        ...,
        ge=0,
        description="Average reviews per month"
    )

    calculated_host_listings_count: int = Field(
        ...,
        ge=0,
        description="Number of listings owned by host"
    )

    availability_365: int = Field(
        ...,
        ge=0,
        le=365,
        description="Availability in days"
    )

    neighbourhood_group: str = Field(
        ...,
        min_length=1,
        description="Borough"
    )

    neighbourhood: str = Field(
        ...,
        min_length=1,
        description="Neighbourhood"
    )


# =========================================================
# Home Route
# =========================================================

@app.get("/")
def home():
    return {
        "message": "NYC Airbnb Room Type Classifier API is running",
        "status": "success",
        "endpoint": "/predict"
    }


# =========================================================
# Health Check
# =========================================================

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "model_loaded": model is not None
    }


# =========================================================
# Prediction Route
# =========================================================

@app.post("/predict")
def predict(features: Features):

    # Convert Pydantic object into dictionary
    data = features.model_dump()

    # Create DataFrame
    row = pd.DataFrame(
        [data],
        columns=COLUMNS
    )

    # Prediction
    prediction = model.predict(row)[0]

    # Probability
    probabilities = model.predict_proba(row)[0]

    # Model classes
    classes = model.classes_

    # Convert probabilities into dictionary
    probability_dict = {
        str(cls): round(float(prob) * 100, 2)
        for cls, prob in zip(classes, probabilities)
    }

    return {
        "status": "success",
        "predicted_room_type": str(prediction),
        "probabilities": probability_dict
    }


# =========================================================
# Run:
#
# python main.py
# uvicorn main:app --reload
#
# =========================================================


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    print(f"Starting API on http://127.0.0.1:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port, reload=False)