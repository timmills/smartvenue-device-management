from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # API Settings
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "SmartVenue"
    PROJECT_VERSION: str = "1.0.0"

    # Database
    DATABASE_URL: str = "sqlite:///./smartvenue.db"

    # ESPHome Discovery
    MDNS_SERVICE_TYPE: str = "_esphomelib._tcp.local."
    DEVICE_DISCOVERY_INTERVAL: int = 30  # seconds

    # ESPHome API
    ESPHOME_API_PORT: int = 6053
    ESPHOME_API_KEY: str = "uuPgF8JOAV/ZhFbDV4iS4Kwr1MV5H97p6Nk+HnpE0+g="

    # Network
    WIFI_SSID: str = "TV"

    # Scheduling
    SCHEDULER_TIMEZONE: str = "Australia/Sydney"

    class Config:
        case_sensitive = True
        env_file = ".env"


settings = Settings()