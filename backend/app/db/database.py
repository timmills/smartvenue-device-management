from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from ..core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Session:
    """Dependency to get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Create all tables"""
    from ..models.device import Base as DeviceBase
    from ..models.device_management import Base as ManagementBase

    DeviceBase.metadata.create_all(bind=engine)
    ManagementBase.metadata.create_all(bind=engine)


def init_database():
    """Initialize database with seed data"""
    from .seed_data import seed_database

    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()