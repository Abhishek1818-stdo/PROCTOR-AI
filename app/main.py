
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.test_cases import router as test_case_router
from app.api.attempts import router as attempt_router
from app.api.coding_submissions import router as coding_submission_router
from app.api.auth import router as auth_router
from app.api.assessments import router as assessment_router
from app.api.questions import router as question_router
from app.api.answers import router as answer_router
from app.api.proctoring_events import router as proctoring_events_router
from app.api.admin_dashboard import router as admin_dashboard_router

app = FastAPI(
    title="Candidate Test Engine & Proctoring API",
    description="Backend for the Candidate Test Engine and AI-assisted Proctoring Platform",
    version="1.0.0",
)


# Allow the React/Vite frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://proctor-ai-xi.vercel.app",
],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Register API routers
app.include_router(attempt_router)
app.include_router(coding_submission_router)
app.include_router(test_case_router)
app.include_router(auth_router)
app.include_router(assessment_router)
app.include_router(question_router)
app.include_router(answer_router)
app.include_router(proctoring_events_router)
app.include_router(admin_dashboard_router)


@app.get("/")
def root():
    return {"message": "Candidate Test Engine API is running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
