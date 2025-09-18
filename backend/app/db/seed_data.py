"""
Database seeding script for SmartVenue
Populates the database with common device types, brands, and models
"""

from sqlalchemy.orm import Session
from ..models.device_management import DeviceType, Brand, DeviceModel


def seed_database(db: Session):
    """Seed the database with initial data"""

    # Check if data already exists
    if db.query(DeviceType).count() > 0:
        print("Database already seeded, skipping...")
        return

    print("Seeding database with device types, brands, and models...")

    # Device Types
    device_types_data = [
        {"name": "TV", "description": "Television", "icon": "fas fa-tv"},
        {"name": "STB", "description": "Set Top Box (Foxtel, Fetch, etc.)", "icon": "fas fa-cube"},
        {"name": "AC", "description": "Air Conditioner", "icon": "fas fa-snowflake"},
        {"name": "Audio", "description": "Sound System/Amplifier", "icon": "fas fa-volume-up"},
        {"name": "Projector", "description": "Video Projector", "icon": "fas fa-video"},
        {"name": "Fan", "description": "Ceiling/Floor Fan", "icon": "fas fa-fan"},
        {"name": "Light", "description": "Smart Lighting", "icon": "fas fa-lightbulb"},
        {"name": "Other", "description": "Other IR Controlled Device", "icon": "fas fa-remote-control"}
    ]

    device_types = {}
    for dt_data in device_types_data:
        dt = DeviceType(**dt_data)
        db.add(dt)
        db.flush()  # Get the ID
        device_types[dt.name] = dt

    # TV Brands and Models
    tv_brands_data = [
        {
            "name": "Samsung",
            "models": [
                {"name": "QLED Series", "ir_protocol": "samsung"},
                {"name": "Crystal UHD", "ir_protocol": "samsung"},
                {"name": "Neo QLED", "ir_protocol": "samsung"},
                {"name": "Frame TV", "ir_protocol": "samsung"},
                {"name": "Generic Samsung", "ir_protocol": "samsung"}
            ]
        },
        {
            "name": "LG",
            "models": [
                {"name": "OLED Series", "ir_protocol": "lg"},
                {"name": "NanoCell", "ir_protocol": "lg"},
                {"name": "UltraHD", "ir_protocol": "lg"},
                {"name": "WebOS Smart TV", "ir_protocol": "lg"},
                {"name": "Generic LG", "ir_protocol": "lg"}
            ]
        },
        {
            "name": "Sony",
            "models": [
                {"name": "Bravia XR", "ir_protocol": "sony"},
                {"name": "Bravia OLED", "ir_protocol": "sony"},
                {"name": "X90J Series", "ir_protocol": "sony"},
                {"name": "Generic Sony", "ir_protocol": "sony"}
            ]
        },
        {
            "name": "Panasonic",
            "models": [
                {"name": "HZ2000 OLED", "ir_protocol": "panasonic"},
                {"name": "HX800 Series", "ir_protocol": "panasonic"},
                {"name": "Generic Panasonic", "ir_protocol": "panasonic"}
            ]
        },
        {
            "name": "TCL",
            "models": [
                {"name": "C825 Series", "ir_protocol": "nec"},
                {"name": "P815 Series", "ir_protocol": "nec"},
                {"name": "Generic TCL", "ir_protocol": "nec"}
            ]
        },
        {
            "name": "Hisense",
            "models": [
                {"name": "ULED Series", "ir_protocol": "nec"},
                {"name": "A7G OLED", "ir_protocol": "nec"},
                {"name": "Generic Hisense", "ir_protocol": "nec"}
            ]
        },
        {
            "name": "Toshiba",
            "models": [
                {"name": "Fire TV Edition", "ir_protocol": "nec"},
                {"name": "Generic Toshiba", "ir_protocol": "nec"}
            ]
        },
        {
            "name": "Kogan",
            "models": [
                {"name": "Smart TV", "ir_protocol": "nec"},
                {"name": "Generic Kogan", "ir_protocol": "nec"}
            ]
        }
    ]

    # Create TV brands and models
    for brand_data in tv_brands_data:
        brand = Brand(
            device_type_id=device_types["TV"].id,
            name=brand_data["name"]
        )
        db.add(brand)
        db.flush()

        for model_data in brand_data["models"]:
            model = DeviceModel(
                brand_id=brand.id,
                name=model_data["name"],
                ir_protocol=model_data["ir_protocol"]
            )
            db.add(model)

    # Set Top Box Brands
    stb_brands_data = [
        {
            "name": "Foxtel",
            "models": [
                {"name": "iQ4", "ir_protocol": "foxtel"},
                {"name": "iQ3", "ir_protocol": "foxtel"},
                {"name": "iQ2", "ir_protocol": "foxtel"},
                {"name": "MyStar", "ir_protocol": "foxtel"},
                {"name": "Generic Foxtel", "ir_protocol": "foxtel"}
            ]
        },
        {
            "name": "Fetch TV",
            "models": [
                {"name": "Mighty 4K", "ir_protocol": "nec"},
                {"name": "Mini 4K", "ir_protocol": "nec"},
                {"name": "Generic Fetch", "ir_protocol": "nec"}
            ]
        },
        {
            "name": "Apple TV",
            "models": [
                {"name": "Apple TV 4K", "ir_protocol": "nec"},
                {"name": "Apple TV HD", "ir_protocol": "nec"}
            ]
        },
        {
            "name": "Chromecast",
            "models": [
                {"name": "Chromecast 4K", "ir_protocol": "nec"},
                {"name": "Chromecast HD", "ir_protocol": "nec"}
            ]
        }
    ]

    for brand_data in stb_brands_data:
        brand = Brand(
            device_type_id=device_types["STB"].id,
            name=brand_data["name"]
        )
        db.add(brand)
        db.flush()

        for model_data in brand_data["models"]:
            model = DeviceModel(
                brand_id=brand.id,
                name=model_data["name"],
                ir_protocol=model_data["ir_protocol"]
            )
            db.add(model)

    # Air Conditioner Brands
    ac_brands_data = [
        {
            "name": "Daikin",
            "models": [
                {"name": "Split System", "ir_protocol": "daikin"},
                {"name": "Ducted System", "ir_protocol": "daikin"}
            ]
        },
        {
            "name": "Mitsubishi",
            "models": [
                {"name": "Electric Split", "ir_protocol": "mitsubishi"},
                {"name": "Heavy Industries", "ir_protocol": "mitsubishi"}
            ]
        },
        {
            "name": "Fujitsu",
            "models": [
                {"name": "General Split", "ir_protocol": "fujitsu"},
                {"name": "Lifestyle Series", "ir_protocol": "fujitsu"}
            ]
        },
        {
            "name": "LG",
            "models": [
                {"name": "Dual Inverter", "ir_protocol": "lg"},
                {"name": "ArtCool Series", "ir_protocol": "lg"}
            ]
        }
    ]

    for brand_data in ac_brands_data:
        brand = Brand(
            device_type_id=device_types["AC"].id,
            name=brand_data["name"]
        )
        db.add(brand)
        db.flush()

        for model_data in brand_data["models"]:
            model = DeviceModel(
                brand_id=brand.id,
                name=model_data["name"],
                ir_protocol=model_data["ir_protocol"]
            )
            db.add(model)

    # Audio Brands
    audio_brands_data = [
        {
            "name": "Yamaha",
            "models": [
                {"name": "RX Series", "ir_protocol": "nec"},
                {"name": "Soundbar", "ir_protocol": "nec"}
            ]
        },
        {
            "name": "Denon",
            "models": [
                {"name": "AVR Series", "ir_protocol": "denon"},
                {"name": "Soundbar", "ir_protocol": "denon"}
            ]
        },
        {
            "name": "Sonos",
            "models": [
                {"name": "Beam", "ir_protocol": "nec"},
                {"name": "Arc", "ir_protocol": "nec"}
            ]
        }
    ]

    for brand_data in audio_brands_data:
        brand = Brand(
            device_type_id=device_types["Audio"].id,
            name=brand_data["name"]
        )
        db.add(brand)
        db.flush()

        for model_data in brand_data["models"]:
            model = DeviceModel(
                brand_id=brand.id,
                name=model_data["name"],
                ir_protocol=model_data["ir_protocol"]
            )
            db.add(model)

    db.commit()
    print("Database seeded successfully!")


def get_device_hierarchy(db: Session):
    """Get the complete device hierarchy for frontend"""
    device_types = db.query(DeviceType).all()

    hierarchy = []
    for dt in device_types:
        dt_data = {
            "id": dt.id,
            "name": dt.name,
            "description": dt.description,
            "icon": dt.icon,
            "brands": []
        }

        for brand in dt.brands:
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