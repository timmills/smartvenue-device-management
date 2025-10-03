from sqlalchemy import Column, Integer, String, DateTime, Boolean, Float, Text, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from datetime import datetime
from typing import Optional, Dict, Any

Base = declarative_base()


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)

    # Device identification
    hostname = Column(String, unique=True, index=True, nullable=False)  # ir-abc123
    mac_address = Column(String, unique=True, index=True, nullable=False)
    ip_address = Column(String, nullable=False)

    # Device info
    friendly_name = Column(String, nullable=True)  # "Main Bar TV Controller"
    device_type = Column(String, nullable=False, default="universal")  # All devices are universal
    firmware_version = Column(String, nullable=True)

    # Location/venue info
    venue_name = Column(String, nullable=True)  # "The Crown Hotel"
    location = Column(String, nullable=True)  # "Main Bar"

    # Status
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime(timezone=True), server_default=func.now())

    # Capabilities (JSON field)
    capabilities = Column(JSON, nullable=True)  # {"outputs": 5, "protocols": ["samsung", "lg", "panasonic"]}

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CommandLog(Base):
    __tablename__ = "command_logs"

    id = Column(Integer, primary_key=True, index=True)

    # Command details
    device_hostname = Column(String, nullable=False, index=True)
    command_type = Column(String, nullable=False)  # "channel", "power", "mute", etc.
    command_data = Column(JSON, nullable=True)  # {"channel": "2-501", "box": 2}

    # Execution
    status = Column(String, nullable=False)  # "success", "failed", "timeout"
    error_message = Column(Text, nullable=True)
    execution_time_ms = Column(Integer, nullable=True)

    # Source
    source = Column(String, nullable=False)  # "api", "schedule", "manual"
    user_id = Column(String, nullable=True)  # For future user tracking

    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(Integer, primary_key=True, index=True)

    # Schedule info
    name = Column(String, nullable=False)  # "Saturday Sports Setup"
    description = Column(Text, nullable=True)

    # Timing (cron-style)
    cron_expression = Column(String, nullable=False)  # "0 15 * * 6"
    timezone = Column(String, nullable=False, default="Australia/Sydney")

    # Command to execute
    command_type = Column(String, nullable=False)
    command_data = Column(JSON, nullable=False)  # {"devices": ["ir-abc123"], "action": "channel", "channel": "501"}

    # Status
    is_active = Column(Boolean, default=True)
    last_run = Column(DateTime(timezone=True), nullable=True)
    next_run = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Channel(Base):
    __tablename__ = "channels"

    id = Column(Integer, primary_key=True, index=True)

    # Channel details from CSV
    platform = Column(String, nullable=False)  # FTA, Pay TV, etc.
    broadcaster_network = Column(String, nullable=False)
    channel_name = Column(String, nullable=False)
    lcn = Column(String, nullable=True)  # Logical Channel Number
    foxtel_number = Column(String, nullable=True)
    broadcast_hours = Column(String, nullable=True)
    format = Column(String, nullable=True)  # 576i SDTV, 1080i HDTV, etc.
    programming_content = Column(Text, nullable=True)
    availability = Column(String, nullable=True)  # Nationwide, etc.
    logo_url = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    # Additional fields
    internal = Column(Boolean, default=False)  # For internal channels
    disabled = Column(Boolean, default=True)  # All imported entries start disabled
    local_logo_path = Column(String, nullable=True)  # Local path to downloaded icon

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())