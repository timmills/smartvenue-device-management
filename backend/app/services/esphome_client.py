import asyncio
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
import aioesphomeapi
from aioesphomeapi import APIClient, APIConnectionError

from ..core.config import settings

logger = logging.getLogger(__name__)


class ESPHomeClient:
    def __init__(self, hostname: str, ip_address: str, port: int = None):
        self.hostname = hostname
        self.ip_address = ip_address
        self.port = port or settings.ESPHOME_API_PORT
        self.api_key = settings.ESPHOME_API_KEY
        self.client: Optional[APIClient] = None
        self.connected = False
        self.last_connection_attempt = None

    async def connect(self) -> bool:
        """Connect to the ESPHome device"""
        try:
            self.client = APIClient(
                address=self.ip_address,
                port=self.port,
                password="",
                noise_psk=self.api_key
            )

            await self.client.connect(login=True)
            self.connected = True
            self.last_connection_attempt = datetime.now()
            logger.info(f"Connected to ESPHome device: {self.hostname}")
            return True

        except (APIConnectionError, Exception) as e:
            logger.error(f"Failed to connect to {self.hostname}: {e}")
            self.connected = False
            self.last_connection_attempt = datetime.now()
            return False

    async def disconnect(self):
        """Disconnect from the ESPHome device"""
        if self.client:
            await self.client.disconnect()
            self.connected = False
            logger.info(f"Disconnected from ESPHome device: {self.hostname}")

    async def call_service(self, service_name: str, data: Dict[str, Any] = None) -> bool:
        """Call a service on the ESPHome device"""
        if not self.connected or not self.client:
            if not await self.connect():
                return False

        try:
            # Get device info and services
            device_info = await self.client.device_info()
            services = await self.client.list_entities_services()

            # Find the service
            target_service = None
            for service in services:
                if service.name == service_name:
                    target_service = service
                    break

            if not target_service:
                logger.error(f"Service '{service_name}' not found on device {self.hostname}")
                return False

            # Prepare service data
            service_data = data or {}

            # Call the service
            await self.client.execute_service(target_service, service_data)
            logger.info(f"Called service '{service_name}' on {self.hostname} with data: {service_data}")
            return True

        except Exception as e:
            logger.error(f"Error calling service '{service_name}' on {self.hostname}: {e}")
            self.connected = False
            return False

    async def get_device_info(self) -> Optional[Dict[str, Any]]:
        """Get device information"""
        if not self.connected or not self.client:
            if not await self.connect():
                return None

        try:
            device_info = await self.client.device_info()
            return {
                "name": device_info.name,
                "friendly_name": device_info.friendly_name,
                "esphome_version": device_info.esphome_version,
                "compilation_time": device_info.compilation_time,
                "model": device_info.model,
                "mac_address": device_info.mac_address,
                "manufacturer": device_info.manufacturer,
                "project_name": device_info.project_name,
                "project_version": device_info.project_version
            }

        except Exception as e:
            logger.error(f"Error getting device info from {self.hostname}: {e}")
            return None

    async def health_check(self) -> bool:
        """Perform a health check on the device"""
        try:
            if not self.connected:
                return await self.connect()

            # Try to get device info as a health check
            device_info = await self.client.device_info()
            return device_info is not None

        except Exception as e:
            logger.debug(f"Health check failed for {self.hostname}: {e}")
            self.connected = False
            return False


class ESPHomeManager:
    def __init__(self):
        self.clients: Dict[str, ESPHomeClient] = {}

    def get_client(self, hostname: str, ip_address: str) -> ESPHomeClient:
        """Get or create an ESPHome client for a device"""
        if hostname not in self.clients:
            self.clients[hostname] = ESPHomeClient(hostname, ip_address)
        else:
            # Update IP address in case it changed
            self.clients[hostname].ip_address = ip_address

        return self.clients[hostname]

    async def send_tv_command(self, hostname: str, ip_address: str, command: str, **kwargs) -> bool:
        """Send a TV command to a specific device"""
        client = self.get_client(hostname, ip_address)

        # Map command types to ESPHome service names
        service_map = {
            "power": "tv_power",
            "mute": "tv_mute",
            "volume_up": "tv_volume_up",
            "volume_down": "tv_volume_down",
            "channel_up": "tv_channel_up",
            "channel_down": "tv_channel_down",
            "channel": "tv_channel",
            "number": "tv_number"
        }

        service_name = service_map.get(command)
        if not service_name:
            logger.error(f"Unknown command: {command}")
            return False

        # Prepare service data
        service_data = {}
        if command == "channel":
            if "channel" in kwargs:
                service_data["channel"] = kwargs["channel"]
            else:
                logger.error("Channel command requires 'channel' parameter")
                return False
        elif command == "number":
            if "digit" in kwargs:
                service_data["digit"] = kwargs["digit"]
            else:
                logger.error("Number command requires 'digit' parameter")
                return False

        return await client.call_service(service_name, service_data)

    async def send_foxtel_command(self, hostname: str, ip_address: str, command: str, box: int = 0, **kwargs) -> bool:
        """Send a Foxtel command to a specific device and box"""
        client = self.get_client(hostname, ip_address)

        # Map command types to ESPHome service names for Foxtel
        service_map = {
            "power": "tv_power",
            "mute": "tv_mute",
            "channel_up": "tv_channel_up",
            "channel_down": "tv_channel_down",
            "channel": "tv_channel"
        }

        service_name = service_map.get(command)
        if not service_name:
            logger.error(f"Unknown Foxtel command: {command}")
            return False

        # Prepare service data
        service_data = {"box": box}
        if command == "channel":
            if "channel" in kwargs:
                # Format as "box-channel" for Foxtel devices
                channel_str = f"{box}-{kwargs['channel']}" if box > 0 else str(kwargs["channel"])
                service_data = {"channel": channel_str}
            else:
                logger.error("Channel command requires 'channel' parameter")
                return False

        return await client.call_service(service_name, service_data)

    async def health_check_all(self) -> Dict[str, bool]:
        """Perform health checks on all connected devices"""
        results = {}
        for hostname, client in self.clients.items():
            results[hostname] = await client.health_check()
        return results

    async def disconnect_all(self):
        """Disconnect all clients"""
        for client in self.clients.values():
            await client.disconnect()


# Global ESPHome manager instance
esphome_manager = ESPHomeManager()