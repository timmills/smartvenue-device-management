import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime

from ..db.database import get_db
from ..models.device_management import ManagedDevice, IRPort, DeviceDiscovery
from ..services.discovery import discovery_service
from ..services.esphome_client import esphome_manager
from ..services.device_health import health_checker

router = APIRouter()

logger = logging.getLogger(__name__)


class IRPortRequest(BaseModel):
    port_number: int
    connected_device_name: Optional[str] = None
    is_active: bool = True
    cable_length: Optional[str] = None
    installation_notes: Optional[str] = None
    tag_ids: Optional[List[int]] = None
    default_channel: Optional[str] = None
    device_number: Optional[int] = None


class IRPortResponse(BaseModel):
    id: int
    port_number: int
    port_id: Optional[str]
    gpio_pin: Optional[str]
    connected_device_name: Optional[str]
    is_active: bool
    cable_length: Optional[str]
    installation_notes: Optional[str]
    tag_ids: Optional[List[int]]
    default_channel: Optional[str]
    device_number: Optional[int]

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
    discovery_properties: Optional[Dict[str, Any]] = None
    is_managed: bool
    first_discovered: datetime
    last_seen: datetime

    class Config:
        from_attributes = True


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

    # Attempt to capture capabilities from the ESPHome device
    capabilities_snapshot: Optional[Dict[str, Any]] = None
    try:
        capabilities_snapshot = await esphome_manager.fetch_capabilities(
            discovered.hostname,
            discovered.ip_address
        )
    except Exception as exc:
        logger.warning(f"Failed to retrieve capabilities from {discovered.hostname}: {exc}")

    if capabilities_snapshot:
        merged_properties = discovered.discovery_properties or {}
        merged_properties["capabilities"] = capabilities_snapshot
        discovered.discovery_properties = merged_properties
        if capabilities_snapshot.get("firmware_version"):
            discovered.firmware_version = capabilities_snapshot["firmware_version"]

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
                is_active=port_req.is_active,
                cable_length=port_req.cable_length,
                installation_notes=port_req.installation_notes,
                tag_ids=port_req.tag_ids,
                default_channel=port_req.default_channel,
                device_number=port_req.device_number
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
                device_number=i
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
                is_active=port_req.is_active,
                cable_length=port_req.cable_length,
                installation_notes=port_req.installation_notes,
                tag_ids=port_req.tag_ids,
                default_channel=port_req.default_channel,
                device_number=port_req.device_number
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


@router.post("/managed/{device_id}/health-check")
async def check_device_health(device_id: int, db: Session = Depends(get_db)):
    """Perform comprehensive health check on a specific device"""
    try:
        result = await health_checker.check_single_device(device_id, db)

        if not result:
            raise HTTPException(status_code=404, detail="Device not found")

        # Update last_seen to now for clarity
        device = db.query(ManagedDevice).filter(ManagedDevice.id == device_id).first()
        if device:
            device.last_seen = datetime.now()
            device.is_online = result.is_online
            db.commit()

        return {
            "hostname": result.hostname,
            "is_online": result.is_online,
            "current_ip": result.ip_address,
            "mac_address": result.mac_address,
            "api_reachable": result.api_reachable,
            "response_time_ms": result.response_time_ms,
            "error_message": result.error_message,
            "check_timestamp": result.check_timestamp.isoformat()
        }
    except Exception as e:
        logger.error(f"Health check failed for device {device_id}: {e}")
        raise HTTPException(status_code=500, detail="Health check failed")


@router.post("/managed/health-check-all")
async def check_all_devices_health(db: Session = Depends(get_db)):
    """Perform health check on all managed devices"""
    try:
        results = await health_checker.check_all_devices(db)

        return {
            "total_devices": len(results),
            "online_devices": sum(1 for r in results.values() if r.is_online),
            "offline_devices": sum(1 for r in results.values() if not r.is_online),
            "check_timestamp": datetime.now().isoformat(),
            "devices": [
                {
                    "hostname": result.hostname,
                    "is_online": result.is_online,
                    "current_ip": result.ip_address,
                    "mac_address": result.mac_address,
                    "api_reachable": result.api_reachable,
                    "response_time_ms": result.response_time_ms,
                    "error_message": result.error_message
                }
                for result in results.values()
            ]
        }
    except Exception as e:
        logger.error(f"Bulk health check failed: {e}")
        raise HTTPException(status_code=500, detail="Bulk health check failed")


@router.get("/health-status")
async def get_health_status():
    """Get health monitoring service status"""
    return {
        "service_running": health_checker.running,
        "check_interval_seconds": health_checker.check_interval,
        "last_full_check": health_checker.last_full_check.isoformat() if health_checker.last_full_check else None,
        "max_concurrent_checks": health_checker.max_concurrent_checks
    }


@router.delete("/discovered/{hostname}")
async def forget_discovered_device(hostname: str, db: Session = Depends(get_db)):
    """Remove a device from the discovered devices database"""
    # Check if device exists in discovery
    discovered = db.query(DeviceDiscovery).filter(
        DeviceDiscovery.hostname == hostname
    ).first()

    if not discovered:
        raise HTTPException(status_code=404, detail="Device not found in discovery")

    # Check if device is currently managed
    if discovered.is_managed:
        raise HTTPException(
            status_code=400,
            detail="Cannot forget a managed device. Unmanage it first."
        )

    # Delete the discovered device
    db.delete(discovered)
    db.commit()

    return {"message": f"Device {hostname} removed from discovery"}


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
