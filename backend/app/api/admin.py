from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.device_management import DeviceType, Brand, DeviceModel, ManagedDevice, IRPort, DeviceDiscovery
from typing import List, Dict, Any

router = APIRouter(tags=["admin"])

@router.get("/database-overview")
async def get_database_overview(db: Session = Depends(get_db)):
    """Get overview of all database tables for debugging"""

    overview = {}

    # Device Types
    device_types = db.query(DeviceType).all()
    overview["device_types"] = [
        {
            "id": dt.id,
            "name": dt.name,
            "description": dt.description,
            "icon": dt.icon,
            "brand_count": len(dt.brands)
        }
        for dt in device_types
    ]

    # Brands
    brands = db.query(Brand).all()
    overview["brands"] = [
        {
            "id": b.id,
            "name": b.name,
            "device_type_id": b.device_type_id,
            "model_count": len(b.models)
        }
        for b in brands
    ]

    # Device Models
    models = db.query(DeviceModel).all()
    overview["device_models"] = [
        {
            "id": m.id,
            "name": m.name,
            "model_number": m.model_number,
            "brand_id": m.brand_id,
            "ir_protocol": m.ir_protocol
        }
        for m in models
    ]

    # Discovered Devices
    discovered = db.query(DeviceDiscovery).all()
    overview["discovered_devices"] = [
        {
            "id": d.id,
            "hostname": d.hostname,
            "ip_address": d.ip_address,
            "device_type": d.device_type,
            "is_managed": d.is_managed,
            "first_discovered": d.first_discovered.isoformat(),
            "last_seen": d.last_seen.isoformat()
        }
        for d in discovered
    ]

    # Managed Devices
    managed = db.query(ManagedDevice).all()
    overview["managed_devices"] = [
        {
            "id": m.id,
            "hostname": m.hostname,
            "device_name": m.device_name,
            "location": m.location,
            "total_ir_ports": m.total_ir_ports,
            "is_online": m.is_online,
            "device_type": m.device_type
        }
        for m in managed
    ]

    # IR Ports
    ir_ports = db.query(IRPort).all()
    overview["ir_ports"] = [
        {
            "id": p.id,
            "device_id": p.device_id,
            "port_number": p.port_number,
            "port_id": p.port_id,
            "gpio_pin": p.gpio_pin,
            "connected_device_name": p.connected_device_name,
            "device_model_id": p.device_model_id,
            "is_active": p.is_active,
            "foxtel_box_number": p.foxtel_box_number
        }
        for p in ir_ports
    ]

    # Statistics
    overview["statistics"] = {
        "total_device_types": len(device_types),
        "total_brands": len(brands),
        "total_models": len(models),
        "discovered_devices": len(discovered),
        "managed_devices": len(managed),
        "ir_ports": len(ir_ports)
    }

    return overview

@router.get("/device-hierarchy-debug")
async def get_device_hierarchy_debug(db: Session = Depends(get_db)):
    """Debug the device hierarchy structure"""

    device_types = db.query(DeviceType).all()
    hierarchy = []

    for device_type in device_types:
        dt_data = {
            "id": device_type.id,
            "name": device_type.name,
            "description": device_type.description,
            "icon": device_type.icon,
            "brands": []
        }

        for brand in device_type.brands:
            brand_data = {
                "id": brand.id,
                "name": brand.name,
                "logo_url": brand.logo_url,
                "models": []
            }

            for model in brand.models:
                model_data = {
                    "id": model.id,
                    "name": model.name,
                    "model_number": model.model_number,
                    "ir_protocol": model.ir_protocol
                }
                brand_data["models"].append(model_data)

            dt_data["brands"].append(brand_data)

        hierarchy.append(dt_data)

    return hierarchy


@router.get("/", response_class=HTMLResponse)
async def admin_dashboard(db: Session = Depends(get_db)):
    """Admin dashboard web GUI"""

    # Get database overview
    overview = await get_database_overview(db)

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>SmartVenue Database Admin</title>
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; margin: 20px; background: #f8fafc; }}
            .container {{ max-width: 1200px; margin: 0 auto; }}
            .header {{ background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
            .card {{ background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
            .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }}
            .stat {{ text-align: center; padding: 15px; background: #f1f5f9; border-radius: 6px; }}
            .stat-number {{ font-size: 24px; font-weight: bold; color: #1e293b; }}
            .stat-label {{ font-size: 12px; color: #64748b; text-transform: uppercase; margin-top: 5px; }}
            table {{ width: 100%; border-collapse: collapse; margin-top: 15px; }}
            th, td {{ padding: 8px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }}
            th {{ background: #f8fafc; font-weight: 600; color: #374151; }}
            .refresh-btn {{ background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; }}
            .refresh-btn:hover {{ background: #2563eb; }}
            .online {{ color: #10b981; }}
            .offline {{ color: #ef4444; }}
            .managed {{ color: #3b82f6; }}
        </style>
        <script>
            function refreshData() {{
                window.location.reload();
            }}

            function formatTimestamp(ts) {{
                return new Date(ts).toLocaleString();
            }}
        </script>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>SmartVenue Database Administration</h1>
                <p>Real-time database monitoring and device management overview</p>
                <button class="refresh-btn" onclick="refreshData()">🔄 Refresh Data</button>
            </div>

            <div class="card">
                <h2>Database Statistics</h2>
                <div class="stats">
                    <div class="stat">
                        <div class="stat-number">{overview['statistics']['total_device_types']}</div>
                        <div class="stat-label">Device Types</div>
                    </div>
                    <div class="stat">
                        <div class="stat-number">{overview['statistics']['total_brands']}</div>
                        <div class="stat-label">Brands</div>
                    </div>
                    <div class="stat">
                        <div class="stat-number">{overview['statistics']['total_models']}</div>
                        <div class="stat-label">Models</div>
                    </div>
                    <div class="stat">
                        <div class="stat-number">{overview['statistics']['discovered_devices']}</div>
                        <div class="stat-label">Discovered</div>
                    </div>
                    <div class="stat">
                        <div class="stat-number">{overview['statistics']['managed_devices']}</div>
                        <div class="stat-label">IR Senders</div>
                    </div>
                    <div class="stat">
                        <div class="stat-number">{overview['statistics']['ir_ports']}</div>
                        <div class="stat-label">Devices</div>
                    </div>
                </div>
            </div>

            <div class="card">
                <h2>Discovered Devices</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Hostname</th>
                            <th>IP Address</th>
                            <th>Device Type</th>
                            <th>Status</th>
                            <th>First Discovered</th>
                            <th>Last Seen</th>
                        </tr>
                    </thead>
                    <tbody>"""

    for device in overview['discovered_devices']:
        status_class = 'managed' if device['is_managed'] else 'offline'
        status_text = 'Managed' if device['is_managed'] else 'Unmanaged'
        html_content += f"""
                        <tr>
                            <td>{device['hostname']}</td>
                            <td>{device['ip_address']}</td>
                            <td>{device['device_type']}</td>
                            <td class="{status_class}">{status_text}</td>
                            <td>{device['first_discovered']}</td>
                            <td>{device['last_seen']}</td>
                        </tr>"""

    html_content += """
                    </tbody>
                </table>
            </div>

            <div class="card">
                <h2>IR Senders</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Hostname</th>
                            <th>Device Name</th>
                            <th>Location</th>
                            <th>Device Type</th>
                            <th>IR Ports</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>"""

    for device in overview['managed_devices']:
        status_class = 'online' if device['is_online'] else 'offline'
        status_text = 'Online' if device['is_online'] else 'Offline'
        html_content += f"""
                        <tr>
                            <td>{device['hostname']}</td>
                            <td>{device['device_name']}</td>
                            <td>{device['location'] or 'Not set'}</td>
                            <td>{device['device_type']}</td>
                            <td>{device['total_ir_ports']}</td>
                            <td class="{status_class}">{status_text}</td>
                        </tr>"""

    html_content += """
                    </tbody>
                </table>
            </div>

            <div class="card">
                <h2>Connected Devices</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Port ID</th>
                            <th>Port #</th>
                            <th>IR Sender</th>
                            <th>GPIO Pin</th>
                            <th>Connected Device</th>
                            <th>Device Model</th>
                            <th>Status</th>
                            <th>Foxtel Box</th>
                        </tr>
                    </thead>
                    <tbody>"""

    for port in overview['ir_ports']:
        status_class = 'online' if port['is_active'] else 'offline'
        status_text = 'Active' if port['is_active'] else 'Inactive'
        html_content += f"""
                        <tr>
                            <td><strong>{port['port_id'] or 'Not set'}</strong></td>
                            <td>Port {port['port_number']}</td>
                            <td>IR Sender {port['device_id']}</td>
                            <td>{port['gpio_pin']}</td>
                            <td>{port['connected_device_name'] or 'Not configured'}</td>
                            <td>{port['device_model_id'] or 'Not set'}</td>
                            <td class="{status_class}">{status_text}</td>
                            <td>{port['foxtel_box_number'] or 'N/A'}</td>
                        </tr>"""

    html_content += """
                    </tbody>
                </table>
            </div>

            <div class="card">
                <h2>Quick Links</h2>
                <p>
                    <a href="/api/v1/admin/database-overview" target="_blank">📊 Raw Database Overview JSON</a> |
                    <a href="/api/v1/admin/device-hierarchy-debug" target="_blank">🌳 Device Hierarchy JSON</a> |
                    <a href="/docs" target="_blank">📖 API Documentation</a> |
                    <a href="http://100.93.158.19:3000" target="_blank">🖥️ Frontend Application</a>
                </p>
            </div>
        </div>
    </body>
    </html>
    """

    return html_content