"""
Hybrid Command Routing System

Implements class-based routing:
- Class A (Immediate): Direct only - diagnostic, health checks
- Class B (Interactive): Smart routing (direct first, queue fallback) - single device control
- Class C (Bulk): Queue only - multi-device operations
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime
import asyncio
import time

from ..db.database import get_db
from ..models.device import Device
from ..models.device_management import ManagedDevice
from ..services.esphome_client import esphome_manager
from ..services.command_queue import CommandQueueService
from ..services.settings_service import settings_service
from ..services.history_cleanup import get_cleanup_service

router = APIRouter(prefix="/commands", tags=["commands"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CommandRequest(BaseModel):
    command: str
    box: Optional[int] = 0
    channel: Optional[str] = None
    digit: Optional[int] = None


class CommandResponse(BaseModel):
    success: bool
    method: str  # 'direct', 'queued', 'direct_failed_queued'
    message: Optional[str] = None
    execution_time_ms: Optional[int] = None
    queue_id: Optional[int] = None


class BulkTarget(BaseModel):
    hostname: str
    port: int = 0


class BulkCommandRequest(BaseModel):
    targets: List[BulkTarget]
    command: str
    channel: Optional[str] = None
    digit: Optional[int] = None
    priority: Optional[int] = 5


class BulkCommandResponse(BaseModel):
    success: bool
    batch_id: str
    queued_count: int
    command_ids: List[int]


# ============================================================================
# Helper Functions
# ============================================================================

async def get_device_with_api_key(hostname: str, db: Session):
    """Get device and its API key"""
    device = db.query(Device).filter(Device.hostname == hostname).first()
    if not device:
        raise HTTPException(status_code=404, detail=f"Device {hostname} not found")

    api_key = None
    managed = db.query(ManagedDevice).filter(ManagedDevice.hostname == hostname).first()
    if managed and managed.api_key:
        api_key = managed.api_key
    if not api_key:
        api_key = settings_service.get_setting("esphome_api_key")

    return device, api_key


async def send_command_direct(
    hostname: str,
    ip_address: str,
    command: str,
    box: int,
    channel: Optional[str],
    digit: Optional[int],
    api_key: Optional[str],
    timeout: float = 5.0
) -> tuple[bool, int]:
    """
    Send command directly to device

    Returns:
        (success, execution_time_ms)
    """
    start_time = time.time()

    try:
        success = await asyncio.wait_for(
            esphome_manager.send_tv_command(
                hostname=hostname,
                ip_address=ip_address,
                command=command,
                box=box,
                channel=channel,
                digit=digit,
                api_key=api_key
            ),
            timeout=timeout
        )

        execution_time_ms = int((time.time() - start_time) * 1000)
        return success, execution_time_ms

    except asyncio.TimeoutError:
        execution_time_ms = int((time.time() - start_time) * 1000)
        return False, execution_time_ms


# ============================================================================
# Class A: IMMEDIATE (Direct Only)
# ============================================================================

@router.post("/{hostname}/diagnostic")
async def diagnostic_signal(hostname: str, db: Session = Depends(get_db)) -> CommandResponse:
    """
    Class A: Immediate - Diagnostic signal (ID button)

    Direct routing only, no queue fallback.
    User is waiting to see LED flash.
    """
    device, api_key = await get_device_with_api_key(hostname, db)

    success, execution_time_ms = await send_command_direct(
        hostname=device.hostname,
        ip_address=device.ip_address,
        command="diagnostic_signal",
        box=0,
        channel=None,
        digit=1,
        api_key=api_key,
        timeout=5.0
    )

    return CommandResponse(
        success=success,
        method="direct",
        message="Diagnostic signal sent" if success else "Failed to send diagnostic signal",
        execution_time_ms=execution_time_ms
    )


@router.get("/{hostname}/health")
async def health_check(hostname: str, db: Session = Depends(get_db)):
    """
    Class A: Immediate - Health check

    Direct routing only, no queue fallback.
    Quick connectivity test.
    """
    device, api_key = await get_device_with_api_key(hostname, db)

    client = esphome_manager.get_client(device.hostname, device.ip_address)
    if api_key:
        client.set_api_key(api_key)

    start_time = time.time()
    is_healthy = await client.health_check()
    execution_time_ms = int((time.time() - start_time) * 1000)

    return {
        "hostname": hostname,
        "healthy": is_healthy,
        "method": "direct",
        "execution_time_ms": execution_time_ms
    }


# ============================================================================
# Class B: INTERACTIVE (Smart Routing - Direct with Queue Fallback)
# ============================================================================

@router.post("/{hostname}/command")
async def send_command(
    hostname: str,
    command_request: CommandRequest,
    request: Request,
    db: Session = Depends(get_db)
) -> CommandResponse:
    """
    Class B: Interactive - Single device control

    Smart routing:
    1. Try direct execution first (fast path)
    2. If direct fails or times out, queue for retry

    Provides immediate feedback when possible, reliability when needed.
    """
    device, api_key = await get_device_with_api_key(hostname, db)

    # Try direct execution first (fast path)
    success, execution_time_ms = await send_command_direct(
        hostname=device.hostname,
        ip_address=device.ip_address,
        command=command_request.command,
        box=command_request.box or 0,
        channel=command_request.channel,
        digit=command_request.digit,
        api_key=api_key,
        timeout=3.0  # Short timeout for interactive commands
    )

    if success:
        # Direct execution succeeded - log to history and update port status
        port = command_request.box or 0
        if command_request.command == "channel" and command_request.channel and port != 0:
            # Update port status for channel changes (exclude port 0 - diagnostic only)
            CommandQueueService.update_port_status(
                db, device.hostname, port, command_request.channel
            )

        # Log successful direct execution to history
        from ..models.command_queue import CommandHistory
        history = CommandHistory(
            queue_id=None,  # Not queued
            hostname=device.hostname,
            command=command_request.command,
            port=command_request.box or 0,
            channel=command_request.channel,
            success=True,
            execution_time_ms=execution_time_ms,
            routing_method="direct"
        )
        db.add(history)
        db.commit()

        return CommandResponse(
            success=True,
            method="direct",
            message=f"Command '{command_request.command}' executed successfully",
            execution_time_ms=execution_time_ms
        )

    # Direct failed - fallback to queue for retry
    queue_id = await CommandQueueService.enqueue(
        db=db,
        hostname=device.hostname,
        command=command_request.command,
        command_class="interactive",
        port=command_request.box or 0,
        channel=command_request.channel,
        digit=command_request.digit,
        priority=10,  # High priority for user-initiated commands
        max_attempts=3,
        user_ip=request.client.host if request.client else None,
        routing_method="direct_failed_queued"
    )

    return CommandResponse(
        success=True,
        method="direct_failed_queued",
        message=f"Device busy or offline. Command queued for retry (ID: {queue_id})",
        execution_time_ms=execution_time_ms,
        queue_id=queue_id
    )


# ============================================================================
# Class C: BULK (Queue Only)
# ============================================================================

@router.post("/bulk")
async def bulk_command(
    bulk_request: BulkCommandRequest,
    request: Request,
    db: Session = Depends(get_db)
) -> BulkCommandResponse:
    """
    Class C: Bulk - Multi-device operations

    Always queued. User expects progress tracking, not immediate completion.
    Provides reliability and coordination across multiple devices.
    """
    # Generate batch ID to group related commands
    batch_id = CommandQueueService.generate_batch_id()
    command_ids = []

    for target in bulk_request.targets:
        # Verify device exists
        device = db.query(Device).filter(Device.hostname == target.hostname).first()
        if not device:
            # Skip non-existent devices but continue with others
            continue

        # Enqueue command
        queue_id = await CommandQueueService.enqueue(
            db=db,
            hostname=target.hostname,
            command=bulk_request.command,
            command_class="bulk",
            port=target.port,
            channel=bulk_request.channel,
            digit=bulk_request.digit,
            batch_id=batch_id,
            priority=bulk_request.priority or 5,
            max_attempts=3,
            user_ip=request.client.host if request.client else None,
            routing_method="queued"
        )
        command_ids.append(queue_id)

    return BulkCommandResponse(
        success=True,
        batch_id=batch_id,
        queued_count=len(command_ids),
        command_ids=command_ids
    )


@router.get("/bulk/{batch_id}/status")
async def bulk_status(batch_id: str, db: Session = Depends(get_db)):
    """
    Get status of a bulk operation

    Returns progress information for all commands in the batch.
    """
    status = CommandQueueService.get_batch_status(db, batch_id)
    return status


# ============================================================================
# Queue Status & Monitoring
# ============================================================================

@router.get("/queue/metrics")
async def queue_metrics(db: Session = Depends(get_db)):
    """Get queue health metrics"""
    metrics = CommandQueueService.get_queue_metrics(db)
    return metrics


@router.get("/{hostname}/port-status")
async def get_port_status(hostname: str, db: Session = Depends(get_db)):
    """
    Get last channel status for all ports of a device

    Returns format like: [{"port": 1, "last_channel": "500"}, ...]
    Displays as "1-500" in UI (port 1, channel 500)
    """
    device = db.query(Device).filter(Device.hostname == hostname).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    statuses = CommandQueueService.get_port_status(db, hostname)
    return {
        "hostname": hostname,
        "port_statuses": statuses
    }


@router.post("/maintenance/cleanup-history")
async def cleanup_history_now():
    """
    Manually trigger history cleanup

    Useful for testing or immediate cleanup needs.
    Normally runs automatically at 3:00 AM daily.
    """
    cleanup_service = get_cleanup_service()
    result = await cleanup_service.cleanup_now()

    return {
        "success": True,
        "message": "History cleanup completed",
        "history_deleted": result["history_deleted"],
        "queue_deleted": result["queue_deleted"]
    }
