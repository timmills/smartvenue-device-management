"""Database seeding helpers.

Device type/brand data has moved to imported IR libraries, but we keep
this module to ensure default ESPHome templates are present.
"""

from pathlib import Path
from datetime import datetime
from sqlalchemy.orm import Session

from ..models.ir_codes import ESPTemplate, IRLibrary


TEMPLATE_PATH = Path(__file__).resolve().parents[3] / "esphome" / "templates" / "d1_mini_base.yaml"


def _ensure_default_template(db: Session) -> None:
    existing = db.query(ESPTemplate).filter(ESPTemplate.name == "D1 Mini Base").first()
    try:
        content = TEMPLATE_PATH.read_text()
    except FileNotFoundError:
        print(f"Default template not found at {TEMPLATE_PATH}; skipping seed.")
        return

    if existing:
        return

    template = ESPTemplate(
        name="D1 Mini Base",
        board="d1_mini",
        description="Base ESPHome profile for D1 Mini with YAML builder metadata.",
        template_yaml=content,
    )
    db.add(template)
    db.commit()
    print("Seeded default D1 Mini ESPHome template.")


def _ensure_native_libraries(db: Session) -> None:
    defaults = [
        {
            "brand": "*Samsung",
            "device_category": "TV",
            "description": "ESPHome native Samsung TV codes",
            "source_path": "esp_native/samsung",
        },
        {
            "brand": "*LG",
            "device_category": "TV",
            "description": "ESPHome native LG TV codes",
            "source_path": "esp_native/lg",
        },
        {
            "brand": "*Hisense",
            "device_category": "TV",
            "description": "ESPHome native Hisense TV codes",
            "source_path": "esp_native/hisense",
        },
    ]

    for entry in defaults:
        library = db.query(IRLibrary).filter(
            IRLibrary.brand == entry["brand"],
            IRLibrary.source == "esp_native",
        ).first()

        if not library:
            library = IRLibrary(
                source="esp_native",
                source_path=entry["source_path"],
                device_category=entry["device_category"],
                brand=entry["brand"],
                model="Native",
                name=f"{entry['brand']} ESPHome Native",
                description=entry["description"],
                version="1.0.0",
                file_hash=f"esp_native_{entry['brand'][1:].lower()}",
                last_updated=datetime.utcnow(),
                import_status="imported",
                esp_native=True,
            )
            db.add(library)
        else:
            library.source = "esp_native"
            library.source_path = entry["source_path"]
            library.device_category = entry["device_category"]
            library.model = "Native"
            library.name = f"{entry['brand']} ESPHome Native"
            library.description = entry["description"]
            library.version = "1.0.0"
            library.file_hash = f"esp_native_{entry['brand'][1:].lower()}"
            library.last_updated = datetime.utcnow()
            library.import_status = "imported"
            library.esp_native = True

    db.commit()


def seed_database(db: Session):
    """Seed default ESPHome templates and report legacy status."""

    _ensure_default_template(db)
    _ensure_native_libraries(db)
    print("Device type/brand seeding is deprecated; only templates ensured.")
