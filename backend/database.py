import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Ambil dari environment variable yang ada di docker-compose.yml
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://roy:123@localhost:5432/geospatial_db")

# Jika menggunakan async, kita perlu prefix postgresql+asyncpg://
# Tapi di sini kita gunakan standard sqlalchemy dulu untuk kompatibilitas awal

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
