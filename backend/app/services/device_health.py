"""
Device Health Monitoring Service

Provides robust online/offline status checking for managed devices by:
1. Direct API calls to verify device connectivity
2. MAC address verification to handle IP changes
3. Network scanning for device discovery on IP changes
4. Background scheduled health checks every 5 minutes
5. Immediate health checks on demand

This service is designed to handle up to 100 devices efficiently without
network thrashing through smart batching and timeout management.
"""

import asyncio
import logging
import socket
import ipaddress
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
import subprocess

from sqlalchemy.orm import Session

from ..models.device_management import ManagedDevice
from ..services.esphome_client import esphome_manager
from ..services.discovery import discovery_service

logger = logging.getLogger(__name__)


@dataclass
class HealthCheckResult:
    """Result of a device health check"""
    hostname: str
    is_online: bool
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    api_reachable: bool = False
    response_time_ms: Optional[int] = None
    error_message: Optional[str] = None
    check_timestamp: datetime = None

    def __post_init__(self):
        if self.check_timestamp is None:
            self.check_timestamp = datetime.now()


class DeviceHealthChecker:
    """Robust device health monitoring service"""

    def __init__(self):
        self.check_interval = 300  # 5 minutes
        self.api_timeout = 10  # 10 seconds for API calls
        self.ping_timeout = 3  # 3 seconds for ping
        self.max_concurrent_checks = 10  # Limit concurrent operations
        self.executor = ThreadPoolExecutor(max_workers=self.max_concurrent_checks)
        self.last_full_check: Optional[datetime] = None
        self.running = False
        self._background_task: Optional[asyncio.Task] = None

    async def start_health_monitoring(self):
        """Start the background health monitoring service"""
        if self.running:
            logger.warning("Health monitoring already running")
            return

        self.running = True
        logger.info("Starting device health monitoring service")

        if getattr(self.executor, "_shutdown", False):
            self.executor = ThreadPoolExecutor(max_workers=self.max_concurrent_checks)

        # Start background task
        self._background_task = asyncio.create_task(self._health_check_loop())

    async def stop_health_monitoring(self):
        """Stop the background health monitoring service"""
        self.running = False
        logger.info("Stopping device health monitoring service")

        if self._background_task:
            self._background_task.cancel()
            try:
                await self._background_task
            except asyncio.CancelledError:
                pass
            finally:
                self._background_task = None

        self.executor.shutdown(wait=False)

    async def _health_check_loop(self):
        """Background loop for periodic health checks"""
        while self.running:
            try:
                await asyncio.sleep(self.check_interval)
                if self.running:
                    logger.info("Starting scheduled device health check")
                    await self.check_all_devices()

            except Exception as e:
                logger.error(f"Error in health check loop: {e}")
                await asyncio.sleep(60)  # Wait 1 minute before retrying

    async def check_all_devices(self, db: Optional[Session] = None) -> Dict[str, HealthCheckResult]:
        """Check health of all managed devices"""
        from ..db.database import get_db

        created_session = False
        if db is None:
            db = next(get_db())
            created_session = True

        try:
            devices = db.query(ManagedDevice).all()
            if not devices:
                logger.info("No managed devices to check")
                return {}

            logger.info(f"Checking health of {len(devices)} managed devices")

            # Batch process devices to avoid overwhelming the network
            results = {}
            batch_size = min(self.max_concurrent_checks, len(devices))

            for i in range(0, len(devices), batch_size):
                batch = devices[i:i + batch_size]
                batch_results = await self._check_device_batch(batch)
                results.update(batch_results)

                # Update database with results
                for device in batch:
                    result = batch_results.get(device.hostname)
                    if result:
                        await self._update_device_status(device, result, db)

                # Small delay between batches to be network-friendly
                if i + batch_size < len(devices):
                    await asyncio.sleep(1)

            db.commit()
            self.last_full_check = datetime.now()

            online_count = sum(1 for r in results.values() if r.is_online)
            logger.info(f"Health check complete: {online_count}/{len(devices)} devices online")

            return results

        except Exception as e:
            logger.error(f"Error during health check: {e}")
            db.rollback()
            return {}
        finally:
            if created_session:
                db.close()

    async def _check_device_batch(self, devices: List[ManagedDevice]) -> Dict[str, HealthCheckResult]:
        """Check a batch of devices concurrently"""
        tasks = [self.check_device_health(device) for device in devices]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        batch_results = {}
        for device, result in zip(devices, results):
            if isinstance(result, Exception):
                logger.error(f"Error checking {device.hostname}: {result}")
                batch_results[device.hostname] = HealthCheckResult(
                    hostname=device.hostname,
                    is_online=False,
                    error_message=str(result)
                )
            else:
                batch_results[device.hostname] = result

        return batch_results

    async def check_device_health(self, device: ManagedDevice) -> HealthCheckResult:
        """Comprehensive health check for a single device"""
        start_time = datetime.now()

        # Step 1: Try direct API call to current IP
        result = await self._check_device_api(device.hostname, device.current_ip_address)

        if result.is_online and result.mac_address == device.mac_address:
            # Device is online and MAC matches - all good
            response_time = (datetime.now() - start_time).total_seconds() * 1000
            result.response_time_ms = int(response_time)
            return result

        # Step 2: Check if device is in discovery service (mDNS)
        discovered = discovery_service.get_device_by_hostname(device.hostname)
        if discovered and discovered.ip_address != device.current_ip_address:
            logger.info(f"Device {device.hostname} found at new IP: {discovered.ip_address}")
            result = await self._check_device_api(device.hostname, discovered.ip_address)
            if result.is_online:
                result.ip_address = discovered.ip_address
                return result

        # Step 3: Network scan for device if not found (last resort)
        if not result.is_online:
            result = await self._scan_for_device(device)

        response_time = (datetime.now() - start_time).total_seconds() * 1000
        result.response_time_ms = int(response_time)
        return result

    async def _check_device_api(self, hostname: str, ip_address: Optional[str]) -> HealthCheckResult:
        """Check device via ESPHome API call"""
        if not ip_address:
            return HealthCheckResult(
                hostname=hostname,
                is_online=False,
                error_message="No IP address available",
            )

        try:
            # Try to get device info via ESPHome API
            client = esphome_manager.get_client(hostname, ip_address)
            device_info = await asyncio.wait_for(
                client.device_info(),
                timeout=self.api_timeout
            )

            if device_info:
                return HealthCheckResult(
                    hostname=hostname,
                    is_online=True,
                    ip_address=ip_address,
                    mac_address=device_info.get('mac_address'),
                    api_reachable=True
                )
            else:
                return HealthCheckResult(
                    hostname=hostname,
                    is_online=False,
                    ip_address=ip_address,
                    error_message="No device info received"
                )

        except asyncio.TimeoutError:
            return HealthCheckResult(
                hostname=hostname,
                is_online=False,
                ip_address=ip_address,
                error_message="API timeout"
            )
        except Exception as e:
            # Fallback to ping test
            ping_result = await self._ping_device(ip_address)
            return HealthCheckResult(
                hostname=hostname,
                is_online=ping_result,
                ip_address=ip_address if ping_result else None,
                api_reachable=False,
                error_message=f"API error: {str(e)}"
            )

    async def _ping_device(self, ip_address: str) -> bool:
        """Simple ping test as fallback"""
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                self.executor,
                self._ping_sync,
                ip_address
            )
            return result
        except Exception:
            return False

    def _ping_sync(self, ip_address: str) -> bool:
        """Synchronous ping implementation"""
        try:
            result = subprocess.run(
                ['ping', '-c', '1', '-W', str(self.ping_timeout * 1000), ip_address],
                capture_output=True,
                timeout=self.ping_timeout + 1
            )
            return result.returncode == 0
        except (subprocess.TimeoutExpired, subprocess.SubprocessError):
            return False

    async def _scan_for_device(self, device: ManagedDevice) -> HealthCheckResult:
        """Scan local network for device by MAC address"""
        try:
            # Get current network subnet
            current_ip = device.current_ip_address
            if not current_ip:
                return HealthCheckResult(
                    hostname=device.hostname,
                    is_online=False,
                    error_message="No IP address to scan from"
                )

            # Create network object
            network = ipaddress.ip_network(f"{current_ip}/24", strict=False)

            # Scan a limited range around the current IP (to avoid network thrashing)
            base_ip = ipaddress.ip_address(current_ip)
            scan_range = []

            # Scan ±10 IPs around current address
            for offset in range(-10, 11):
                try:
                    scan_ip = base_ip + offset
                    if scan_ip in network:
                        scan_range.append(str(scan_ip))
                except (ipaddress.AddressValueError, OverflowError):
                    continue

            logger.info(f"Scanning {len(scan_range)} IPs for device {device.hostname}")

            # Test each IP in the range
            for ip in scan_range:
                result = await self._check_device_api(device.hostname, ip)
                if result.is_online and result.mac_address == device.mac_address:
                    logger.info(f"Found device {device.hostname} at new IP: {ip}")
                    return result

            return HealthCheckResult(
                hostname=device.hostname,
                is_online=False,
                error_message="Device not found in network scan"
            )

        except Exception as e:
            return HealthCheckResult(
                hostname=device.hostname,
                is_online=False,
                error_message=f"Network scan error: {str(e)}"
            )

    async def _update_device_status(self, device: ManagedDevice, result: HealthCheckResult, db: Session):
        """Update device status in database based on health check result"""
        try:
            device.is_online = result.is_online
            device.last_seen = result.check_timestamp

            if result.is_online and result.ip_address:
                # Update IP address if it changed
                if device.current_ip_address != result.ip_address:
                    logger.info(f"Updating IP for {device.hostname}: {device.current_ip_address} -> {result.ip_address}")
                    device.last_ip_address = device.current_ip_address
                    device.current_ip_address = result.ip_address

            # Log status changes
            status_change = "online" if result.is_online else "offline"
            if result.error_message:
                logger.debug(f"Device {device.hostname}: {status_change} ({result.error_message})")
            else:
                logger.debug(f"Device {device.hostname}: {status_change}")

        except Exception as e:
            logger.error(f"Error updating device {device.hostname} status: {e}")

    async def check_single_device(self, device_id: int, db: Session) -> Optional[HealthCheckResult]:
        """Check health of a single device (for manual refresh)"""
        try:
            device = db.query(ManagedDevice).filter(ManagedDevice.id == device_id).first()
            if not device:
                return None

            result = await self.check_device_health(device)
            await self._update_device_status(device, result, db)
            db.commit()

            return result

        except Exception as e:
            logger.error(f"Error checking single device {device_id}: {e}")
            db.rollback()
            return None


# Global health checker instance
health_checker = DeviceHealthChecker()
