from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime

from ..db.database import get_db
from ..db.seed_data import get_device_hierarchy
from ..models.device_management import (
    DeviceType, Brand, DeviceModel, ManagedDevice, IRPort, DeviceDiscovery
)
from ..services.discovery import discovery_service

router = APIRouter()


# Pydantic models for device management
class DeviceTypeResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    icon: Optional[str]

    class Config:
        from_attributes = True


class BrandResponse(BaseModel):
    id: int
    name: str
    logo_url: Optional[str]

    class Config:
        from_attributes = True


class DeviceModelResponse(BaseModel):
    id: int
    name: str
    model_number: Optional[str]
    ir_protocol: Optional[str]

    class Config:
        from_attributes = True
        protected_namespaces = ()


class IRPortRequest(BaseModel):
    port_number: int
    connected_device_name: Optional[str] = None
    device_model_id: Optional[int] = None
    is_active: bool = True
    cable_length: Optional[str] = None
    installation_notes: Optional[str] = None
    foxtel_box_number: Optional[int] = None


class IRPortResponse(BaseModel):
    id: int
    port_number: int
    port_id: Optional[str]
    gpio_pin: Optional[str]
    connected_device_name: Optional[str]
    device_model_id: Optional[int]
    is_active: bool
    cable_length: Optional[str]
    installation_notes: Optional[str]
    foxtel_box_number: Optional[int]
    device_model: Optional[DeviceModelResponse]

    class Config:
        from_attributes = True


class ManagedDeviceRequest(BaseModel):
    device_name: Optional[str] = None
    api_key: Optional[str] = None
    venue_name: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    ir_ports: List[IRPortRequest] = []


class ManagedDeviceResponse(BaseModel):
    id: int
    hostname: str
    mac_address: str
    current_ip_address: str
    device_name: Optional[str]
    api_key: Optional[str]
    venue_name: Optional[str]
    location: Optional[str]
    total_ir_ports: int
    firmware_version: Optional[str]
    device_type: str
    is_online: bool
    last_seen: datetime
    last_ip_address: Optional[str]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    ir_ports: List[IRPortResponse]

    class Config:
        from_attributes = True


class DiscoveredDeviceResponse(BaseModel):
    id: int
    hostname: str
    mac_address: str
    ip_address: str
    friendly_name: Optional[str]
    device_type: Optional[str]
    firmware_version: Optional[str]
    is_managed: bool
    first_discovered: datetime
    last_seen: datetime

    class Config:
        from_attributes = True


# Device Type/Brand/Model endpoints
@router.get("/hierarchy")
async def get_device_hierarchy_api(db: Session = Depends(get_db)):
    """Get the complete device type/brand/model hierarchy"""
    return get_device_hierarchy(db)


@router.get("/types", response_model=List[DeviceTypeResponse])
async def get_device_types(db: Session = Depends(get_db)):
    """Get all device types"""
    return db.query(DeviceType).all()


@router.get("/types/{type_id}/brands", response_model=List[BrandResponse])
async def get_brands_by_type(type_id: int, db: Session = Depends(get_db)):
    """Get all brands for a specific device type"""
    return db.query(Brand).filter(Brand.device_type_id == type_id).all()


@router.get("/brands/{brand_id}/models", response_model=List[DeviceModelResponse])
async def get_models_by_brand(brand_id: int, db: Session = Depends(get_db)):
    """Get all models for a specific brand"""
    return db.query(DeviceModel).filter(DeviceModel.brand_id == brand_id).all()


# Discovered devices endpoints
@router.get("/discovered", response_model=List[DiscoveredDeviceResponse])
async def get_discovered_devices(db: Session = Depends(get_db)):
    """Get all discovered devices (including unmanaged ones)"""
    return db.query(DeviceDiscovery).all()


@router.post("/sync-discovered")
async def sync_discovered_devices(db: Session = Depends(get_db)):
    """Sync current discovery service data with database"""
    discovered_devices = discovery_service.get_discovered_devices()

    for device in discovered_devices:
        # Check if device already exists in discovery table
        existing = db.query(DeviceDiscovery).filter(
            DeviceDiscovery.hostname == device.hostname
        ).first()

        if existing:
            # Update existing entry
            existing.ip_address = device.ip_address
            existing.last_seen = datetime.now()
            existing.firmware_version = device.version
            existing.discovery_properties = device.properties
        else:
            # Create new entry
            discovery_entry = DeviceDiscovery(
                hostname=device.hostname,
                mac_address=device.mac_address,
                ip_address=device.ip_address,
                friendly_name=device.friendly_name,
                device_type=device.device_type,
                firmware_version=device.version,
                discovery_properties=device.properties,
                is_managed=False
            )
            db.add(discovery_entry)

    db.commit()
    return {"message": f"Synced {len(discovered_devices)} discovered devices"}


# Managed devices endpoints
@router.get("/managed", response_model=List[ManagedDeviceResponse])
async def get_managed_devices(db: Session = Depends(get_db)):
    """Get all managed devices"""
    return db.query(ManagedDevice).all()


@router.get("/managed/{device_id}", response_model=ManagedDeviceResponse)
async def get_managed_device(device_id: int, db: Session = Depends(get_db)):
    """Get a specific managed device"""
    device = db.query(ManagedDevice).filter(ManagedDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.post("/manage/{hostname}")
async def manage_device(
    hostname: str,
    device_request: ManagedDeviceRequest,
    db: Session = Depends(get_db)
):
    """Convert a discovered device to a managed device"""

    # Check if device exists in discovery
    discovered = db.query(DeviceDiscovery).filter(
        DeviceDiscovery.hostname == hostname
    ).first()

    if not discovered:
        raise HTTPException(status_code=404, detail="Device not found in discovery")

    # Check if already managed
    existing_managed = db.query(ManagedDevice).filter(
        ManagedDevice.hostname == hostname
    ).first()

    if existing_managed:
        raise HTTPException(status_code=400, detail="Device is already managed")

    # Create managed device
    managed_device = ManagedDevice(
        hostname=discovered.hostname,
        mac_address=discovered.mac_address,
        current_ip_address=discovered.ip_address,
        device_name=device_request.device_name or discovered.friendly_name,
        api_key=device_request.api_key,
        venue_name=device_request.venue_name,
        location=device_request.location,
        total_ir_ports=5,  # All ESPHome devices have 5 IR ports with new firmware
        firmware_version=discovered.firmware_version,
        device_type=discovered.device_type or "universal",
        is_online=True,
        notes=device_request.notes
    )

    db.add(managed_device)
    db.flush()  # Get the ID

    # Create IR ports
    if device_request.ir_ports:
        for port_req in device_request.ir_ports:
            # Map port numbers to GPIO pins based on device type
            gpio_map = {
                0: "GPIO14",  # D5
                1: "GPIO12",  # D6
                2: "GPIO13",  # D7
                3: "GPIO15",  # D8
                4: "GPIO16"   # D0
            }

            ir_port = IRPort(
                device_id=managed_device.id,
                port_number=port_req.port_number,
                port_id=f"{managed_device.mac_address}-{port_req.port_number}",
                gpio_pin=gpio_map.get(port_req.port_number),
                connected_device_name=port_req.connected_device_name,
                device_model_id=port_req.device_model_id,
                is_active=port_req.is_active,
                cable_length=port_req.cable_length,
                installation_notes=port_req.installation_notes,
                foxtel_box_number=port_req.foxtel_box_number
            )
            db.add(ir_port)
    else:
        # Create default IR ports
        gpio_map = {
            0: "GPIO14",  # D5
            1: "GPIO12",  # D6
            2: "GPIO13",  # D7
            3: "GPIO15",  # D8
            4: "GPIO16"   # D0
        }

        port_count = managed_device.total_ir_ports
        for i in range(port_count):
            ir_port = IRPort(
                device_id=managed_device.id,
                port_number=i + 1,  # Port numbers are 1-based
                port_id=f"{managed_device.mac_address}-{i + 1}",
                gpio_pin=gpio_map.get(i),
                is_active=True,
                foxtel_box_number=i if discovered.device_type == "foxtel" else None
            )
            db.add(ir_port)

    # Mark as managed in discovery
    discovered.is_managed = True

    db.commit()
    db.refresh(managed_device)

    return managed_device


@router.put("/managed/{device_id}", response_model=ManagedDeviceResponse)
async def update_managed_device(
    device_id: int,
    device_request: ManagedDeviceRequest,
    db: Session = Depends(get_db)
):
    """Update a managed device"""
    device = db.query(ManagedDevice).filter(ManagedDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Update device fields
    if device_request.device_name is not None:
        device.device_name = device_request.device_name
    if device_request.api_key is not None:
        device.api_key = device_request.api_key
    if device_request.venue_name is not None:
        device.venue_name = device_request.venue_name
    if device_request.location is not None:
        device.location = device_request.location
    if device_request.notes is not None:
        device.notes = device_request.notes

    # Update IR ports if provided
    if device_request.ir_ports:
        # Delete existing ports
        db.query(IRPort).filter(IRPort.device_id == device_id).delete()

        # Create new ports
        for port_req in device_request.ir_ports:
            gpio_map = {
                0: "GPIO14", 1: "GPIO12", 2: "GPIO13", 3: "GPIO15", 4: "GPIO16"
            }

            ir_port = IRPort(
                device_id=device_id,
                port_number=port_req.port_number,
                port_id=f"{device.mac_address}-{port_req.port_number}",
                gpio_pin=gpio_map.get(port_req.port_number),
                connected_device_name=port_req.connected_device_name,
                device_model_id=port_req.device_model_id,
                is_active=port_req.is_active,
                cable_length=port_req.cable_length,
                installation_notes=port_req.installation_notes,
                foxtel_box_number=port_req.foxtel_box_number
            )
            db.add(ir_port)

    db.commit()
    db.refresh(device)
    return device


@router.delete("/managed/{device_id}")
async def unmanage_device(device_id: int, db: Session = Depends(get_db)):
    """Remove a device from management (but keep in discovery)"""
    device = db.query(ManagedDevice).filter(ManagedDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    hostname = device.hostname

    # Delete the managed device (will cascade delete IR ports)
    db.delete(device)

    # Mark as unmanaged in discovery
    discovered = db.query(DeviceDiscovery).filter(
        DeviceDiscovery.hostname == hostname
    ).first()
    if discovered:
        discovered.is_managed = False

    db.commit()
    return {"message": f"Device {hostname} removed from management"}


@router.post("/managed/{device_id}/sync-status")
async def sync_device_status(device_id: int, db: Session = Depends(get_db)):
    """Sync device online status with discovery service"""
    device = db.query(ManagedDevice).filter(ManagedDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Check if device is in current discovery
    discovered_device = discovery_service.get_device_by_hostname(device.hostname)

    if discovered_device:
        device.is_online = True
        device.current_ip_address = discovered_device.ip_address
        device.last_seen = datetime.now()
        if device.current_ip_address != device.last_ip_address:
            device.last_ip_address = device.current_ip_address
    else:
        device.is_online = False

    db.commit()
    return {
        "hostname": device.hostname,
        "is_online": device.is_online,
        "current_ip": device.current_ip_address
    }


@router.delete("/ir-port/{port_id}")
async def delete_ir_port(port_id: int, db: Session = Depends(get_db)):
    """Delete an IR port if it's inactive and unconfigured"""
    port = db.query(IRPort).filter(IRPort.id == port_id).first()
    if not port:
        raise HTTPException(status_code=404, detail="Port not found")

    # Only allow deletion if port is inactive and has no connected device
    if port.is_active or port.connected_device_name:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete active port or port with connected device"
        )

    db.delete(port)
    db.commit()
    return {"message": f"Port {port.port_id} deleted successfully"}