import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.routes import auth, resumes, settings, resume_mail_imports, knowledge_assets, business_workbench
from app.config.database import engine, SessionLocal
from app.models.models import Base, User, UserRole
from app.core.security import get_password_hash
from app.services.resume_mail_import_scheduler import resume_mail_import_scheduler
from app.services.resume_service import requeue_processing_resumes

# Create tables
Base.metadata.create_all(bind=engine)

# Seed initial user if not exists
def seed_db():
    db = SessionLocal()
    try:
        admin_email = os.getenv("INITIAL_ADMIN_EMAIL", "admin@example.com")
        admin_password = os.getenv("INITIAL_ADMIN_PASSWORD")
        admin_name = os.getenv("INITIAL_ADMIN_NAME", "System Admin")
        app_env = os.getenv("APP_ENV", "development")

        if not admin_password and app_env == "development":
            admin_password = "admin123"

        user = db.query(User).filter(User.email == admin_email).first()
        if not user:
            if not admin_password:
                print("Skipping initial admin user. Set INITIAL_ADMIN_PASSWORD to seed one.")
                return
            print("Seeding initial admin user...")
            admin_user = User(
                email=admin_email,
                hashed_password=get_password_hash(admin_password),
                full_name=admin_name,
                role=UserRole.ADMIN
            )
            db.add(admin_user)
            db.commit()
            print(f"Admin user created: {admin_email}")
        else:
            if app_env == "development" and admin_password:
                user.hashed_password = get_password_hash(admin_password)
                user.full_name = user.full_name or admin_name
                user.role = UserRole.ADMIN
                db.commit()
    except Exception as e:
        print(f"Error seeding DB: {e}")
    finally:
        db.close()

seed_db()

app = FastAPI(
    title="AI Interview Assistant",
    description="API for AI Interview Assistant System",
    version="1.0.0"
)

# Ensure uploads directory exists
os.makedirs("uploads", exist_ok=True)

# Mount static files
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

origins = os.getenv("CORS_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(resumes.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(resume_mail_imports.router, prefix="/api")
app.include_router(knowledge_assets.router, prefix="/api")
app.include_router(business_workbench.router, prefix="/api")


@app.on_event("startup")
def start_resume_mail_import_scheduler():
    try:
        result = requeue_processing_resumes()
        if result["queued_count"] or result["skipped_count"]:
            print(
                "[ResumeRecovery] processing resumes checked: "
                f"queued={result['queued_count']}, skipped={result['skipped_count']}"
            )
    except Exception as e:
        print(f"[ResumeRecovery] Failed to requeue processing resumes: {e}")
    resume_mail_import_scheduler.start()


@app.on_event("shutdown")
def stop_resume_mail_import_scheduler():
    resume_mail_import_scheduler.stop()


@app.get("/")
def read_root():
    return {"message": "Welcome to AI Interview Assistant API"}
