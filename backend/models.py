from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user") # 'admin', 'user'
    created_at = Column(DateTime, default=datetime.utcnow)

class GeospatialData(Base):
    __tablename__ = "geospatial_data"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    table_name = Column(String, unique=True, nullable=False)
    description = Column(String, nullable=True)
    status = Column(String, default="pending") # 'pending', 'processing', 'completed', 'failed'
    progress = Column(Integer, default=0)
    owner_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User")
