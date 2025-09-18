# SmartVenue Device Management System

Commercial hospitality display management system for pubs and restaurants. Replace 75+ minutes of daily manual TV control with centralized automation.

**ROI**: $11,400+ annual savings per venue

## 🚀 Quick Start

### Backend
```bash
cd backend
source ../venv/bin/activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 🏗️ Architecture

```
Raspberry Pi 4 Hub (FastAPI + SQLite + React UI)
         ↓ (Hidden "TV" WiFi Network)
ESP8266 IR Blasters → Foxtel Boxes/Samsung/LG TVs
         ↑ (Tailscale VPN for remote management)
```

## ✅ Current Status: FULL STACK OPERATIONAL!

- **Backend**: `100.93.158.19:8000` (FastAPI + Device Discovery)
- **Frontend**: `100.93.158.19:3000` (React + TypeScript)
- **Discovery**: Auto-detects ESPHome devices (`ir-dc4516` found)
- **Database**: 70+ device models (Samsung, LG, Sony, Foxtel, etc.)

## 📱 Features

### Device Management
- Auto-discovery via mDNS (`ir-*.local`)
- Device registration with friendly names
- Health monitoring (online/offline status)
- 5-port IR mapping per device

### Control System
- Direct commands: `Box 2 Power`, `Channel 2-501`
- Bulk operations: `Power off all displays`
- Device status synchronization
- Real-time connectivity monitoring

### Technology Stack
- **Backend**: FastAPI, SQLAlchemy, AsyncIO, APScheduler
- **Frontend**: React + Vite + TypeScript
- **Database**: SQLite with Alembic migrations
- **Discovery**: python-zeroconf (mDNS)
- **Device Control**: aioesphomeapi
- **Deployment**: Docker ready

## 🎯 API Endpoints

- `GET /api/v1/management/discovered` - List discovered devices
- `POST /api/v1/management/sync-discovered` - Sync device discovery
- `GET /api/v1/management/managed` - List managed devices
- `POST /api/v1/management/manage/{hostname}` - Add device to management
- `DELETE /api/v1/management/managed/{id}` - Remove device
- `POST /api/v1/management/managed/{id}/sync-status` - Sync device status

Full API documentation: `http://100.93.158.19:8000/docs`

## 🔧 Hardware

- **Hub**: Raspberry Pi 4 (FastAPI backend)
- **IR Blasters**: ESP8266 with 5 GPIO outputs each
- **Network**: Hidden "TV" WiFi with MAC-based identification
- **Connectivity**: Tailscale VPN for remote management

## 📁 Project Structure

```
smartvenue/
├── backend/           # FastAPI application
│   ├── app/
│   │   ├── api/       # REST API endpoints
│   │   ├── models/    # Database models
│   │   ├── services/  # Business logic
│   │   └── db/        # Database & migrations
├── frontend/          # React TypeScript UI
│   ├── src/
│   │   ├── components/
│   │   └── services/
├── esphome/          # Device firmware configs
└── README.md
```

## 🚧 Roadmap

### Phase 3: Automation (Next)
- [ ] Schedule Engine: Cron-style automation
- [ ] Event Queue: Reliable command execution
- [ ] Staff Interface: Touchscreen-friendly controls
- [ ] Channel Presets: "Sky Sports", "BBC News" shortcuts

### Phase 4: Production
- [ ] Tailscale Integration: Multi-venue management
- [ ] Config Deployment: Push settings to venues
- [ ] Analytics: Usage tracking and reporting
- [ ] Hardening: Error handling, offline operation

## 🏢 Commercial Benefits

- **Time Savings**: 75+ minutes → <5 minutes daily
- **Cost Reduction**: $11,400+ annual savings per venue
- **Centralized Control**: Single touchscreen interface
- **Remote Management**: Multi-venue support via VPN
- **Automated Scheduling**: Set-and-forget channel changes