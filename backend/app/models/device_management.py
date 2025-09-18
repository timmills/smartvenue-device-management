from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, JSON, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from typing import Optional, Dict, Any

Base = declarative_base()


class DeviceType(Base):
    """Device types: TV, STB (Set Top Box), AC (Air Conditioner), etc."""
    __tablename__ = "device_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)  # "TV", "STB", "AC"
    description = Column(String, nullable=True)
    icon = Column(String, nullable=True)  # Font Awesome icon name
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    brands = relationship("Brand", back_populates="device_type")


class Brand(Base):
    """Brands for each device type: Samsung, LG, Panasonic, etc."""
    __tablename__ = "brands"

    id = Column(Integer, primary_key=True, index=True)
    device_type_id = Column(Integer, ForeignKey("device_types.id"), nullable=False)
    name = Column(String, nullable=False)  # "Samsung", "LG", "Panasonic"
    logo_url = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    device_type = relationship("DeviceType", back_populates="brands")
    models = relationship("DeviceModel", back_populates="brand")

    # Unique constraint on device_type + brand name
    __table_args__ = (
        {'sqlite_autoincrement': True},
    )


class DeviceModel(Base):
    """Specific models for each brand"""
    __tablename__ = "device_models"

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("brands.id"), nullable=False)
    name = Column(String, nullable=False)  # "Series 7", "OLED CX", "iQ4"
    model_number = Column(String, nullable=True)  # "QN85A", "OLED55CX"
    ir_protocol = Column(String, nullable=True)  # "samsung", "lg", "nec"
    ir_codes = Column(JSON, nullable=True)  # Custom IR codes if needed
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    brand = relationship("Brand", back_populates="models")


class ManagedDevice(Base):
    """Enhanced device management with IR port mapping"""
    __tablename__ = "managed_devices"

    id = Column(Integer, primary_key=True, index=True)

    # Core device identification
    hostname = Column(String, unique=True, index=True, nullable=False)  # ir-dc4516
    mac_address = Column(String, unique=True, index=True, nullable=False)
    current_ip_address = Column(String, nullable=False)

    # User-configurable settings
    device_name = Column(String, nullable=True)  # "Main Bar IR Controller"
    api_key = Column(String, nullable=True)  # ESPHome API encryption key
    venue_name = Column(String, nullable=True)  # "The Crown Hotel"
    location = Column(String, nullable=True)  # "Main Bar"

    # Device capabilities
    total_ir_ports = Column(Integer, default=5)
    firmware_version = Column(String, nullable=True)
    device_type = Column(String, nullable=False, default="universal")  # "foxtel", "universal"

    # Network status
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime(timezone=True), server_default=func.now())
    last_ip_address = Column(String, nullable=True)  # Previous IP for tracking

    # Metadata
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    ir_ports = relationship("IRPort", back_populates="device", cascade="all, delete-orphan")


class IRPort(Base):
    """Individual IR port configuration on each device"""
    __tablename__ = "ir_ports"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("managed_devices.id"), nullable=False)

    # Port identification
    port_number = Column(Integer, nullable=False)  # 0-4 for 5-port devices
    port_id = Column(String, nullable=True, index=True)  # "dc4516-1", "dc4516-2", etc. - unique identifier using last 6 digits of MAC + port number
    gpio_pin = Column(String, nullable=True)  # "GPIO14", "GPIO12", etc.

    # Connected device information
    connected_device_name = Column(String, nullable=True)  # "Main Bar TV", "Foxtel Box 2"
    device_model_id = Column(Integer, ForeignKey("device_models.id"), nullable=True)

    # Physical connection
    is_active = Column(Boolean, default=True)
    cable_length = Column(String, nullable=True)  # "2m", "5m"
    installation_notes = Column(Text, nullable=True)

    # For Foxtel devices - which box number this port controls
    foxtel_box_number = Column(Integer, nullable=True)  # 0-4

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    device = relationship("ManagedDevice", back_populates="ir_ports")
    device_model = relationship("DeviceModel")

    # Unique constraint: one port number per device
    __table_args__ = (
        {'sqlite_autoincrement': True},
    )


class DeviceDiscovery(Base):
    """Track discovered devices that haven't been added to management yet"""
    __tablename__ = "device_discoveries"

    id = Column(Integer, primary_key=True, index=True)
    hostname = Column(String, unique=True, index=True, nullable=False)
    mac_address = Column(String, nullable=False)
    ip_address = Column(String, nullable=False)

    # Discovery information
    friendly_name = Column(String, nullable=True)
    device_type = Column(String, nullable=True)
    firmware_version = Column(String, nullable=True)
    discovery_properties = Column(JSON, nullable=True)

    # Status
    is_managed = Column(Boolean, default=False)  # True if added to managed_devices
    first_discovered = Column(DateTime(timezone=True), server_default=func.now())
    last_seen = Column(DateTime(timezone=True), server_default=func.now())

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())