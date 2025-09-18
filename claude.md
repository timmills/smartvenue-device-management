# SmartVenue Development Plan

## Project Overview
Commercial hospitality display management system for pubs/restaurants. Replace 75+ minutes of daily manual TV control with centralized automation. Target: <5 minutes via touchscreen interface.

**ROI**: $11,400+ annual savings per venue

## Current Assets
- ✅ ESPHome firmware (Foxtel multi-box + Samsung/LG universal)
- ✅ Hardware: Raspberry Pi 4 hub + ESP8266 IR blasters (5 outputs each)
- ✅ Network: Hidden "TV" WiFi with MAC-based device identification
- ✅ Working IR commands for power, channels, volume, mute

## Architecture
```
Raspberry Pi 4 Hub (FastAPI + SQLite + React UI)
         ↓ (Hidden "TV" WiFi Network)
ESP8266 IR Blasters → Foxtel Boxes/Samsung/LG TVs
         ↑ (Tailscale VPN for remote management)
```

## Development Status

### ✅ Phase 1: Foundation - COMPLETE!
- ✅ **Project Structure**: FastAPI + SQLAlchemy + Alembic
- ✅ **Database Schema**: devices, venues, schedules, logs
- ✅ **mDNS Discovery**: Auto-detect ESPHome devices
- ✅ **ESPHome API Client**: Async device communication
- ✅ **Basic REST API**: Device CRUD operations

### ✅ Phase 2: Core Features - COMPLETE!
- ✅ **Command System**: Send IR to specific device/output
- ✅ **Bulk Operations**: "Mute all", "Power off all"
- ✅ **Device Health**: Status monitoring, connectivity checks
- ✅ **Web UI**: React frontend for device management
- ✅ **Enhanced Database**: Device hierarchy with brands/models
- ✅ **Device Management**: Full CRUD interface with 5-port IR mapping

### Phase 3: Automation
- [ ] **Schedule Engine**: Cron-style automation
- [ ] **Event Queue**: Reliable command execution
- [ ] **Staff Interface**: Touchscreen-friendly controls
- [ ] **Channel Presets**: "Sky Sports", "BBC News" shortcuts

### Phase 4: Production
- [ ] **Tailscale Integration**: Multi-venue management
- [ ] **Config Deployment**: Push settings to venues
- [ ] **Analytics**: Usage tracking and reporting
- [ ] **Hardening**: Error handling, offline operation

## 🚀 Current Status: FULL STACK OPERATIONAL!

**Backend Server**: `100.93.158.19:8000` (Tailscale)
**Frontend Ready**: React TypeScript with Tailwind CSS
**Discovered Device**: `ir-dc4516` (192.168.101.146)
**API Documentation**: `http://100.93.158.19:8000/docs`
**Device Management**: Complete with 5-port IR mapping

### 🎯 What We Built Today:
- **Enhanced Database Schema**: Device types, brands, models hierarchy
- **70+ Device Models**: Samsung, LG, Sony, Foxtel, AC units, audio systems
- **Device Discovery**: Auto-detect and track ESP devices on network
- **5-Port IR Mapping**: Configure each GPIO port with connected devices
- **User-Friendly Interface**: React frontend with device configuration modals
- **Real-time Status**: Online/offline tracking with IP monitoring

## Technology Stack
- **Backend**: FastAPI, SQLAlchemy, AsyncIO, APScheduler
- **Database**: SQLite (production-ready for 10-20 devices)
- **Frontend**: React + Tailwind CSS (mobile-first)
- **Discovery**: python-zeroconf (mDNS)
- **Device Control**: aioesphomeapi
- **Deployment**: Docker + systemd services

## Key Features

### Device Management
- Auto-discovery via mDNS (`ir-*.local`)
- Device registration with friendly names
- Health monitoring (online/offline status)
- Firmware version tracking

### Command System
- Direct commands: `Box 2 Power`, `Channel 2-501`
- Bulk operations: `Power off all displays`
- Scheduled events: `Every Saturday 3pm → Sky Sports 1`
- Command queuing with retry logic

### Staff Interface
- Touchscreen-optimized controls
- Channel shortcuts (Sky Sports, BBC News, etc.)
- Emergency "Mute All" button
- Simple status indicators

### Multi-Venue Support
- Tailscale VPN connectivity
- Central configuration management
- Per-venue customization
- Remote troubleshooting tools

## Next Steps
1. **Start with Phase 1** - Build solid foundation
2. **MVP Focus** - Working device discovery + basic commands
3. **Iterative Development** - Weekly deployments
4. **Real-world Testing** - Deploy to test venue early

## File Structure (Planned)
```
smartvenue/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── db/
│   │   ├── models/
│   │   └── services/
│   ├── migrations/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/
│   └── package.json
├── esphome/
│   ├── foxtel-5output.yaml
│   └── universal-ir.yaml
└── docker-compose.yml
```

## Quick Start Commands

Start the backend server:
```bash
cd backend
source ../venv/bin/activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Test with your discovered device:

```bash
# Start discovery
curl -X GET "http://100.93.158.19:8000/api/v1/devices/discovery/start"

# Register the device
curl -X POST "http://100.93.158.19:8000/api/v1/devices/register/ir-dc4516" \
  -H "Content-Type: application/json" \
  -d '{"friendly_name": "Main Bar TV Controller", "venue_name": "Test Venue"}'

# Send a power command
curl -X POST "http://100.93.158.19:8000/api/v1/devices/ir-dc4516/command" \
  -H "Content-Type: application/json" \
  -d '{"command": "power"}'

# Change channel to Sky Sports 1
curl -X POST "http://100.93.158.19:8000/api/v1/devices/ir-dc4516/command" \
  -H "Content-Type: application/json" \
  -d '{"command": "channel", "channel": "501"}'

# Bulk command (power off all devices)
curl -X POST "http://100.93.158.19:8000/api/v1/devices/bulk-command" \
  -H "Content-Type: application/json" \
  -d '{"command": "power", "devices": ["ir-dc4516"]}'
```

## Next Steps
Ready for Phase 2 - React frontend development!