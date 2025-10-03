from typing import List, Dict, Any, Optional, Set, Tuple
import re
from datetime import datetime
import json
from dataclasses import dataclass
from textwrap import dedent
from pathlib import Path
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..models.ir_codes import ESPTemplate, IRLibrary, IRCommand
from ..services.firmware_builder import get_firmware_builder

router = APIRouter(prefix="/api/v1/templates", tags=["templates"])


class ESPTemplateSummary(BaseModel):
    id: int
    name: str
    board: str
    description: Optional[str]
    version: str
    revision: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


def increment_version(current_version: str, increment_type: str) -> str:
    """Increment version number based on type (major, minor, patch)"""
    try:
        # Parse version in format "major.minor.patch"
        parts = current_version.split(".")
        if len(parts) != 3:
            # Default to 1.0.0 if invalid format
            parts = ["1", "0", "0"]

        major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])

        if increment_type == "major":
            major += 1
            minor = 0
            patch = 0
        elif increment_type == "minor":
            minor += 1
            patch = 0
        else:  # patch (default)
            patch += 1

        return f"{major}.{minor}.{patch}"
    except (ValueError, IndexError):
        # Fallback to default version
        return "1.0.0"


def update_yaml_version_and_date(yaml_content: str, version: str) -> str:
    """Update version and date in YAML content"""
    current_date = datetime.now().strftime("%Y-%m-%d")

    # Update version in project section
    yaml_content = re.sub(
        r'(\s+version:\s*")[^"]*(")',
        f'\\g<1>{version}\\g<2>',
        yaml_content
    )

    # Remove any existing version comments first
    lines = yaml_content.split('\n')
    cleaned_lines = []

    for line in lines:
        # Skip existing version comments
        if not re.match(r'\s*#\s*Version\s+\d+\.\d+\.\d+\s*-\s*Saved on', line):
            cleaned_lines.append(line)

    # Add new version comment right before project section
    updated_lines = []
    for line in cleaned_lines:
        if line.strip() == 'project:' and not any('Version' in prev_line for prev_line in updated_lines[-3:]):
            updated_lines.append(f'  # Version {version} - Saved on {current_date}')
        updated_lines.append(line)

    return '\n'.join(updated_lines)

NATIVE_IR_PROFILES = {
    '*Samsung': {
        'protocol': 'samsung',
        'commands': {
            'power': {'data': '0xE0E040BF', 'label': 'Power'},
            'volume_up': {'data': '0xE0E0E01F', 'label': 'Volume Up'},
            'volume_down': {'data': '0xE0E0D02F', 'label': 'Volume Down'},
            'mute': {'data': '0xE0E0F00F', 'label': 'Mute'},
            'channel_up': {'data': '0xE0E048B7', 'label': 'Channel Up'},
            'channel_down': {'data': '0xE0E008F7', 'label': 'Channel Down'},
            'number_0': {'data': '0xE0E08877', 'label': '0'},
            'number_1': {'data': '0xE0E020DF', 'label': '1'},
            'number_2': {'data': '0xE0E0A05F', 'label': '2'},
            'number_3': {'data': '0xE0E0609F', 'label': '3'},
            'number_4': {'data': '0xE0E010EF', 'label': '4'},
            'number_5': {'data': '0xE0E0906F', 'label': '5'},
            'number_6': {'data': '0xE0E050AF', 'label': '6'},
            'number_7': {'data': '0xE0E030CF', 'label': '7'},
            'number_8': {'data': '0xE0E0B04F', 'label': '8'},
            'number_9': {'data': '0xE0E0708F', 'label': '9'},
        },
    },
    '*LG': {
        'protocol': 'nec',
        'address': '0x04',
        'commands': {
            'power': {'command': '0x08', 'label': 'Power'},
            'volume_up': {'command': '0x02', 'label': 'Volume Up'},
            'volume_down': {'command': '0x03', 'label': 'Volume Down'},
            'mute': {'command': '0x09', 'label': 'Mute'},
            'channel_up': {'command': '0x00', 'label': 'Channel Up'},
            'channel_down': {'command': '0x01', 'label': 'Channel Down'},
            'number_0': {'command': '0x10', 'label': '0'},
            'number_1': {'command': '0x11', 'label': '1'},
            'number_2': {'command': '0x12', 'label': '2'},
            'number_3': {'command': '0x13', 'label': '3'},
            'number_4': {'command': '0x14', 'label': '4'},
            'number_5': {'command': '0x15', 'label': '5'},
            'number_6': {'command': '0x16', 'label': '6'},
            'number_7': {'command': '0x17', 'label': '7'},
            'number_8': {'command': '0x18', 'label': '8'},
            'number_9': {'command': '0x19', 'label': '9'},
        },
    },
}

COMMAND_LABELS = {
    'power': 'Power',
    'volume_up': 'Volume Up',
    'volume_down': 'Volume Down',
    'mute': 'Mute',
    'channel_up': 'Channel Up',
    'channel_down': 'Channel Down',
    'number_0': '0',
    'number_1': '1',
    'number_2': '2',
    'number_3': '3',
    'number_4': '4',
    'number_5': '5',
    'number_6': '6',
    'number_7': '7',
    'number_8': '8',
    'number_9': '9',
}


CANONICAL_COMMANDS: Tuple[str, ...] = (
    'power',
    'mute',
    'volume_up',
    'volume_down',
    'channel_up',
    'channel_down',
    'number_0',
    'number_1',
    'number_2',
    'number_3',
    'number_4',
    'number_5',
    'number_6',
    'number_7',
    'number_8',
    'number_9',
)


PORT_FUNCTION_DISPLAY = {
    'power': 'Power',
    'mute': 'Mute',
    'volume_up': 'Volume Up',
    'volume_down': 'Volume Down',
    'channel_up': 'Channel Up',
    'channel_down': 'Channel Down',
    'number_0': 'Digit 0',
    'number_1': 'Digit 1',
    'number_2': 'Digit 2',
    'number_3': 'Digit 3',
    'number_4': 'Digit 4',
    'number_5': 'Digit 5',
    'number_6': 'Digit 6',
    'number_7': 'Digit 7',
    'number_8': 'Digit 8',
    'number_9': 'Digit 9',
}


@dataclass
class TransmissionSpec:
    protocol: str
    payload: Dict[str, Any]


@dataclass
class PortProfile:
    port_number: int
    library: Optional[IRLibrary]
    commands: Dict[str, TransmissionSpec]

    @property
    def brand(self) -> str:
        if not self.library:
            return "Unassigned"
        return (self.library.brand or "Unknown").strip() or "Unknown"

    @property
    def description(self) -> str:
        if not self.library:
            return "Unassigned"
        display_name = self.library.name or self.library.model or self.library.brand or "Unnamed"
        model = f" • {self.library.model}" if self.library.model else ""
        return f"{display_name} ({self.library.brand}{model})"


def _indent(lines: List[str], spaces: int) -> List[str]:
    prefix = " " * spaces
    return [f"{prefix}{line}" if line else "" for line in lines]


def _normalize_command_name(command: IRCommand) -> Optional[str]:
    name = (command.name or "").strip().lower()
    if not name:
        return None

    simple = re.sub(r"[^a-z0-9]", "", name)
    category = (command.category or "").lower()

    if "power" in name or simple in {"pwr", "poweron", "poweroff", "onoff"}:
        return "power"

    if "mute" in name or simple.endswith("mut"):
        return "mute"

    if "volume" in name or "vol" in name or category == "volume":
        if any(token in name for token in ["down", "-", "dec", "lower", "min", "dn"]):
            return "volume_down"
        return "volume_up"

    if any(token in name for token in ["channel", "ch", "prog", "prg"]):
        if any(token in name for token in ["down", "prev", "back", "-", "min"]):
            return "channel_down"
        return "channel_up"

    if category == "audio" and "mute" in name:
        return "mute"

    # Numeric buttons
    digit_match = re.search(r"(\d)", simple)
    if digit_match and category in {"number", "channel"} or simple.isdigit():
        digit = digit_match.group(1)
        return f"number_{digit}"

    if simple in {"ok", "enter"}:
        return None

    # Explicit name like "num1"
    num_match = re.match(r"num(\d)", simple)
    if num_match:
        return f"number_{num_match.group(1)}"

    return None


def _build_native_transmissions(library: IRLibrary) -> Dict[str, TransmissionSpec]:
    transmissions: Dict[str, TransmissionSpec] = {}
    profile = NATIVE_IR_PROFILES.get(library.brand)
    if not profile:
        return transmissions

    protocol = profile.get('protocol', '').lower()

    for command_name, spec in profile.get('commands', {}).items():
        payload = dict(spec)
        transmissions[command_name] = TransmissionSpec(protocol=protocol, payload=payload)

    return transmissions


def _parse_raw_signal(signal_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    data = signal_data.get('data') or signal_data.get('code')
    if not data:
        return None

    if isinstance(data, list):
        values = data
    else:
        # Split on whitespace and commas
        chunks = re.split(r"[\s,]+", str(data).strip())
        values = []
        for chunk in chunks:
            if not chunk:
                continue
            try:
                values.append(int(float(chunk)))
            except ValueError:
                try:
                    values.append(int(chunk, 16))
                except ValueError:
                    return None

    if not values:
        return None

    # Ensure alternating positive/negative durations
    formatted: List[int] = []
    for idx, value in enumerate(values):
        if idx % 2 == 0:
            formatted.append(int(value))
        else:
            formatted.append(-int(value))

    frequency = signal_data.get('frequency')
    duty_cycle = signal_data.get('duty_cycle')

    return {
        'code': formatted,
        'frequency': frequency,
        'duty_cycle': duty_cycle,
    }


def _build_command_transmissions(library: IRLibrary, commands: List[IRCommand]) -> Dict[str, TransmissionSpec]:
    transmissions: Dict[str, TransmissionSpec] = {}

    for command in commands:
        canonical = _normalize_command_name(command)
        if not canonical or canonical in transmissions:
            continue

        protocol = (command.protocol or '').lower()
        signal = command.signal_data or {}

        if protocol.startswith('nec'):
            address = signal.get('address')
            cmd = signal.get('command')
            if address and cmd:
                transmissions[canonical] = TransmissionSpec(
                    protocol='nec',
                    payload={'address': address, 'command': cmd}
                )
            continue

        if protocol.startswith('pronto'):
            pronto_data = signal.get('data')
            if pronto_data:
                transmissions[canonical] = TransmissionSpec(
                    protocol='pronto',
                    payload={'data': pronto_data}
                )
            continue

        raw_payload = _parse_raw_signal(signal)
        if raw_payload:
            transmissions[canonical] = TransmissionSpec(
                protocol='raw',
                payload=raw_payload
            )

    return transmissions


def _escape_cpp_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')




def _render_transmit_lines(spec: TransmissionSpec, port_number: int) -> List[str]:
    protocol = spec.protocol
    payload = spec.payload

    if protocol == 'samsung':
        data = payload.get('data')
        if not data:
            return []
        return [
            "- remote_transmitter.transmit_samsung:",
            f"    transmitter_id: ir_transmitter_port{port_number}",
            f"    data: {data}",
        ]

    if protocol == 'nec':
        address = payload.get('address')
        command = payload.get('command')
        if not address or not command:
            return []

        # Convert hex values like "20 00 00 00" to proper 16-bit format
        def convert_hex_value(hex_str):
            if isinstance(hex_str, str) and ' ' in hex_str:
                # Convert "20 00 00 00" to 0x0020 (use first two bytes as 16-bit value)
                hex_parts = hex_str.split()
                if len(hex_parts) >= 2:
                    # Take first two bytes and combine them as 16-bit value
                    high_byte = hex_parts[0]
                    low_byte = hex_parts[1]
                    hex_value = f"0x{high_byte}{low_byte}"
                    return hex_value
                elif len(hex_parts) == 1:
                    # Single byte, pad with zero
                    return f"0x{hex_parts[0]}00"
            return hex_str

        formatted_address = convert_hex_value(address)
        formatted_command = convert_hex_value(command)

        return [
            "- remote_transmitter.transmit_nec:",
            f"    transmitter_id: ir_transmitter_port{port_number}",
            f"    address: {formatted_address}",
            f"    command: {formatted_command}",
        ]

    if protocol == 'pronto':
        data = payload.get('data')
        if not data:
            return []
        return [
            "- remote_transmitter.transmit_pronto:",
            f"    transmitter_id: ir_transmitter_port{port_number}",
            f"    data: \"{_escape_cpp_string(str(data))}\"",
        ]

    if protocol == 'raw':
        code = payload.get('code') or []
        if not code:
            return []

        def _format_frequency(freq: Any) -> Optional[str]:
            if freq is None:
                return None
            try:
                value = float(freq)
            except (TypeError, ValueError):
                return None
            if value >= 1000 and abs(value % 1000) < 1e-6:
                return f"{int(value / 1000)}kHz"
            return str(int(value))

        frequency = _format_frequency(payload.get('frequency'))
        duty_cycle = payload.get('duty_cycle')
        if duty_cycle is not None:
            try:
                duty_cycle = float(duty_cycle) * 100
            except (TypeError, ValueError):
                duty_cycle = None

        code_literal = ', '.join(str(int(v)) for v in code)

        lines = [
            "- remote_transmitter.transmit_raw:",
            f"    transmitter_id: ir_transmitter_port{port_number}",
        ]

        if frequency:
            lines.append(f"    carrier_frequency: {frequency}")
        if duty_cycle is not None:
            lines.append(f"    duty_percent: {round(duty_cycle, 1)}")
        lines.append(f"    code: [{code_literal}]")
        return lines

    return []


def _render_missing_command_lines(port_number: int, command_key: str) -> List[str]:
    label = COMMAND_LABELS.get(command_key, command_key.replace('_', ' ').title())
    return [
        "- logger.log:",
        "    level: WARN",
        f"    format: \"Port {port_number} is missing command '{label}'\"",
    ]


def _build_capabilities_payload_cpp(port_profiles: List[PortProfile]) -> List[str]:
    lines: List[str] = []
    lines.append('std::string payload = "{\\"device_id\\":\\"";')
    lines.append('payload += std::string(App.get_name());')
    lines.append('payload += "\\",\\"project\\":\\"smartvenue.dynamic_ir\\",\\"firmware_version\\":\\"0.1.0\\"";')
    lines.append('payload += ",\\"ports\\":[";')

    port_entries = []
    for profile in port_profiles:
        brand = _escape_cpp_string(profile.brand)
        functions = [key for key in CANONICAL_COMMANDS if key in profile.commands]
        function_literals = ','.join(f'\\"{fn}\\"' for fn in functions)
        description = _escape_cpp_string(profile.description)
        entry = (
            f'{{\\"port\\":{profile.port_number},\\"brand\\":\\"{brand}\\",'
            f'\\"description\\":\\"{description}\\",\\"functions\\":[{function_literals}]}}'
        )
        port_entries.append(entry)

    if port_entries:
        for idx, entry in enumerate(port_entries):
            prefix = 'payload += ",";' if idx > 0 else ''
            if prefix:
                lines.append(prefix)
            lines.append(f'payload += "{entry}";')

    lines.append('payload += "]";')
    lines.append('payload += ",\\"metadata\\":{\\"ip\\":\\"";')
    lines.append('payload += WiFi.localIP().toString();')
    lines.append('payload += "\\",\\"mac\\":\\"";')
    lines.append('payload += WiFi.macAddress();')
    lines.append('payload += "\\",\\"hostname\\":\\"";')
    lines.append('payload += std::string(App.get_name());')
    lines.append('payload += "\\",\\"reported_at_ms\\":";')
    lines.append('payload += std::to_string(millis());')
    lines.append('payload += "}";')
    return lines


def _build_publish_capabilities_script(port_profiles: List[PortProfile]) -> List[str]:
    lines: List[str] = [
        "- id: publish_capabilities",
        "  mode: queued",
        "  then:",
        "    - lambda: |-",
    ]

    cpp_lines = _build_capabilities_payload_cpp(port_profiles)
    lines.extend(_indent(cpp_lines, 8))
    lines.append("        id(ir_capabilities_payload).publish_state(payload);")
    lines.append("")
    return lines


def _build_digit_support_scripts(port_profile: PortProfile) -> List[str]:
    lines: List[str] = []
    port = port_profile.port_number
    digit_transmissions = {
        key: value
        for key, value in port_profile.commands.items()
        if key.startswith('number_')
    }

    # Individual digit scripts
    for digit in range(10):
        key = f"number_{digit}"
        transmission = digit_transmissions.get(key)
        if not transmission:
            continue

        lines.append(f"- id: send_port{port}_digit_{digit}")
        lines.append("  then:")
        tx_lines = _render_transmit_lines(transmission, port)
        if tx_lines:
            lines.extend(_indent(tx_lines, 4))
        else:
            lines.extend(_indent(_render_missing_command_lines(port, key), 4))
        lines.append("")

    # Dispatcher script for digits
    lines.append(f"- id: send_port{port}_digit")
    lines.append("  parameters:")
    lines.append("    digit: int")
    lines.append("  then:")
    lines.append("    - lambda: |-")
    lines.append("        switch (digit) {")

    available_digits = sorted(int(key.split('_')[1]) for key in digit_transmissions.keys())
    for digit in available_digits:
        lines.append(f"          case {digit}:")
        lines.append(f"            id(send_port{port}_digit_{digit}).execute();")
        lines.append("            break;")

    lines.append("          default:")
    lines.append(
        f"            ESP_LOGW(\"digits\", \"Port {port} digit %d unsupported\", digit);")
    lines.append("            break;")
    lines.append("        }")
    lines.append("")

    return lines


def _build_port_command_scripts(port_profile: PortProfile) -> List[str]:
    port = port_profile.port_number
    lines: List[str] = []

    for command_key in CANONICAL_COMMANDS:
        if command_key.startswith('number_'):
            continue

        script_id = f"send_port{port}_{command_key}"
        lines.append(f"- id: {script_id}")
        lines.append("  then:")
        transmission = port_profile.commands.get(command_key)
        if transmission:
            tx_lines = _render_transmit_lines(transmission, port)
            if tx_lines:
                lines.extend(_indent(tx_lines, 4))
            else:
                lines.extend(_indent(_render_missing_command_lines(port, command_key), 4))
        else:
            lines.extend(_indent(_render_missing_command_lines(port, command_key), 4))
        lines.append("")

    lines.extend(_build_digit_support_scripts(port_profile))
    return lines


def _build_shared_scripts(port_profiles: List[PortProfile]) -> List[str]:
    lines: List[str] = []

    # No port switching needed - using 5 separate IR transmitters
    # Get assigned port numbers (only ports with actual device assignments)
    assigned_port_profiles = [p for p in port_profiles if p.library is not None]
    assigned_ports = sorted(set(profile.port_number for profile in assigned_port_profiles))

    def _dispatch_script(script_name: str, target_script: str) -> List[str]:
        block: List[str] = [
            f"- id: {script_name}",
            "  parameters:",
            "    target_port: int",
            "  then:",
        ]

        # Build nested if-else chain only for assigned ports
        if not assigned_ports:
            block.extend([
                "    - logger.log:",
                "        level: WARN",
                f"        format: \"No ports configured for {target_script}\"",
                "",
            ])
            return block

        # Build the nested conditions
        current_indent = 4
        for i, port in enumerate(assigned_ports):
            if i == 0:
                # First condition
                block.extend([
                    f"    - if:",
                    f"        condition:",
                    f"          lambda: 'return target_port == {port};'",
                    f"        then:",
                    f"          - script.execute: send_port{port}_{target_script}",
                ])
                if len(assigned_ports) > 1:
                    block.append(f"        else:")
                    current_indent = 8
            else:
                # Nested conditions
                spaces = " " * current_indent
                block.extend([
                    f"{spaces}- if:",
                    f"{spaces}    condition:",
                    f"{spaces}      lambda: 'return target_port == {port};'",
                    f"{spaces}    then:",
                    f"{spaces}      - script.execute: send_port{port}_{target_script}",
                ])
                if i < len(assigned_ports) - 1:
                    block.append(f"{spaces}    else:")
                    current_indent += 4
                else:
                    # Last condition - add unsupported port logger
                    block.extend([
                        f"{spaces}    else:",
                        f"{spaces}      - logger.log:",
                        f"{spaces}          level: WARN",
                        f"{spaces}          format: \"Port %d unsupported for {target_script}\"",
                        f"{spaces}          args: ['target_port']",
                    ])

        block.append("")
        return block

    for name in [
        ("dispatch_power", "power"),
        ("dispatch_mute", "mute"),
        ("dispatch_volume_up", "volume_up"),
        ("dispatch_volume_down", "volume_down"),
        ("dispatch_channel_up", "channel_up"),
        ("dispatch_channel_down", "channel_down"),
    ]:
        lines.extend(_dispatch_script(*name))

    # Dispatch digit requires digit parameter
    def _generate_dispatch_digit() -> List[str]:
        block: List[str] = [
            "- id: dispatch_digit",
            "  parameters:",
            "    target_port: int",
            "    digit: int",
            "  then:",
        ]

        # Build nested if-else chain only for assigned ports
        if not assigned_ports:
            block.extend([
                "    - logger.log:",
                "        level: WARN",
                "        format: \"No ports configured for digit command\"",
                "",
            ])
            return block

        # Build the nested conditions for digit dispatch
        current_indent = 4
        for i, port in enumerate(assigned_ports):
            if i == 0:
                # First condition
                block.extend([
                    f"    - if:",
                    f"        condition:",
                    f"          lambda: 'return target_port == {port};'",
                    f"        then:",
                    f"          - script.execute:",
                    f"              id: send_port{port}_digit",
                    f"              digit: !lambda 'return digit;'",
                ])
                if len(assigned_ports) > 1:
                    block.append(f"        else:")
                    current_indent = 8
            else:
                # Nested conditions
                spaces = " " * current_indent
                block.extend([
                    f"{spaces}- if:",
                    f"{spaces}    condition:",
                    f"{spaces}      lambda: 'return target_port == {port};'",
                    f"{spaces}    then:",
                    f"{spaces}      - script.execute:",
                    f"{spaces}          id: send_port{port}_digit",
                    f"{spaces}          digit: !lambda 'return digit;'",
                ])
                if i < len(assigned_ports) - 1:
                    block.append(f"{spaces}    else:")
                    current_indent += 4
                else:
                    # Last condition - add unsupported port logger
                    block.extend([
                        f"{spaces}    else:",
                        f"{spaces}      - logger.log:",
                        f"{spaces}          level: WARN",
                        f"{spaces}          format: \"Port %d unsupported for digit command\"",
                        f"{spaces}          args: ['target_port']",
                    ])

        block.append("")
        return block

    lines.extend(_generate_dispatch_digit())

    # Smart channel scripts
    lines.extend(
        [
            "- id: smart_channel",
            "  parameters:",
            "    target_port: int",
            "    channel: int",
            "  then:",
            "    - lambda: |-",
            "        id(target_port_store) = target_port;",
            "        id(channel_digits) = std::to_string(channel);",
            "        id(digit_index) = 0;",
            "    - script.execute: send_next_channel_digit",
            "",
            "- id: send_next_channel_digit",
            "  mode: restart",
            "  then:",
            "    - lambda: |-",
            "        if (id(digit_index) >= id(channel_digits).length()) {",
            "          ESP_LOGI(\"smart_channel\", \"Channel sequence complete\");",
            "          return;",
            "        }",
            "        int digit = id(channel_digits)[id(digit_index)] - '0';",
            "        int port = id(target_port_store);",
            "        id(current_digit) = digit;",
            "        id(digit_index) += 1;",
            "    - script.execute:",
            "        id: dispatch_digit",
            "        target_port: !lambda 'return id(target_port_store);'",
            "        digit: !lambda 'return id(current_digit);'",
            "    - if:",
            "        condition:",
            "          lambda: 'return id(digit_index) < id(channel_digits).length();'",
            "        then:",
            "          - delay: 300ms",
            "          - script.execute: send_next_channel_digit",
            "",
        ]
    )

    return lines


def _build_web_handler_lambda(port_profiles: List[PortProfile]) -> List[str]:
    lines: List[str] = []
    lines.append("          auto *web = esphome::web_server_base::global_web_server_base;")
    lines.append("          if (web == nullptr) {")
    lines.append("            ESP_LOGW(\"web_ui\", \"Web server base not initialised; skipping custom UI setup\");")
    lines.append("            return;")
    lines.append("          }")
    lines.append("          auto make_home_html = []() {")
    lines.append("            std::string html;")
    lines.append("            html.reserve(4096);")
    lines.append("            html += \"<!DOCTYPE html><html lang=\\\"en\\\"><head><meta charset=\\\"utf-8\\\"><meta name=\\\"viewport\\\" content=\\\"width=device-width, initial-scale=1\\\"><title>SmartVenue IR Prototype</title>\";")
    lines.append("            html += \"<style>body{font-family:Segoe UI,Roboto,Arial,sans-serif;margin:0;padding:2.5rem;background:#0b172a;color:#f5f8ff;}h1,h2{margin:0;font-weight:600;}h1{font-size:2rem;margin-bottom:0.75rem;}h2{font-size:1.2rem;margin-top:2rem;}ul{margin:0.75rem 0 0 1.5rem;}pre{background:#0c192f;border-radius:10px;padding:1rem;overflow:auto;}a.button{display:inline-block;margin-top:1rem;padding:0.6rem 1rem;border-radius:30px;background:#2563ff;color:#fff;text-decoration:none;font-weight:600;}</style></head><body>\";")
    lines.append("            html += \"<h1>SmartVenue Dynamic IR</h1>\";")
    lines.append("            html += \"<p>Latest capability payload published from the IR template builder.</p>\";")
    lines.append("            html += \"<h2>Port Assignments</h2><ul>\";")

    for profile in port_profiles:
        description = _escape_cpp_string(profile.description)
        functions = [PORT_FUNCTION_DISPLAY[key] for key in CANONICAL_COMMANDS if key in profile.commands]
        function_text = ', '.join(functions) if functions else 'No supported commands'
        function_text = _escape_cpp_string(function_text)
        lines.append(
            f"            html += \"<li>Port {profile.port_number}: {description} — {function_text}</li>\";"
        )

    lines.append("            html += \"</ul>\";")
    lines.append("            html += \"<h2>Capability Payload</h2><pre>\";")
    lines.append("            html += id(ir_capabilities_payload).state.c_str();")
    lines.append("            html += \"</pre>\";")
    lines.append("            html += \"<a class=\\\"button\\\" href=\\\"/report\\\">Publish Capabilities</a>\";")
    lines.append("            html += \"</body></html>\";")
    lines.append("            return html;")
    lines.append("          };")
    lines.append("          auto *root_handler = new AsyncCallbackWebHandler();")
    lines.append("          root_handler->setUri(\"/\");")
    lines.append("          root_handler->onRequest([make_home_html](AsyncWebServerRequest *request) {")
    lines.append("            std::string html = make_home_html();")
    lines.append("            request->send(200, \"text/html\", html.c_str());")
    lines.append("          });")
    lines.append("          web->add_handler(root_handler);")
    lines.append("          auto *report_handler = new AsyncCallbackWebHandler();")
    lines.append("          report_handler->setUri(\"/report\");")
    lines.append("          report_handler->onRequest([](AsyncWebServerRequest *request) {")
    lines.append("            id(publish_capabilities).execute();")
    lines.append("            request->send(200, \"text/plain\", \"Capabilities publish queued\");")
    lines.append("          });")
    lines.append("          web->add_handler(report_handler);")
    return lines


def _build_globals_section() -> str:
    lines = [
        "globals:",
        "  - id: channel_digits",
        "    type: std::string",
        "    initial_value: '\"\"'",
        "    restore_value: false",
        "  - id: digit_index",
        "    type: int",
        "    initial_value: '0'",
        "    restore_value: false",
        "  - id: target_port_store",
        "    type: int",
        "    initial_value: '1'",
        "    restore_value: false",
        "  - id: current_digit",
        "    type: int",
        "    initial_value: '0'",
        "    restore_value: false",
    ]
    return "\n".join(lines)


def _render_dynamic_yaml(
    template: ESPTemplate,
    port_profiles: List[PortProfile],
    include_comments: bool,
    port_block: str,
    device_block: str,
) -> str:
    """
    Render dynamic YAML using the stored template as a base and replacing placeholders
    """
    # Get the base template YAML
    base_yaml = template.template_yaml

    # Use the stored template as base and replace placeholders
    rendered_yaml = base_yaml

    # Build dynamic content for placeholders
    script_lines: List[str] = []
    script_lines.extend(_build_shared_scripts(port_profiles))

    for profile in port_profiles:
        if profile.port_number in (1, 2, 3, 4, 5):
            script_lines.extend(_build_port_command_scripts(profile))

    script_section = "\n".join(_indent(script_lines, 2)).rstrip()
    custom_script_block = f"\n{script_section}"

    # Build capability payload
    capability_lines = _build_capabilities_payload_cpp(port_profiles)
    capability_payload = "\n".join(_indent(capability_lines, 10))

    # Replace placeholders in the base template
    rendered_yaml = rendered_yaml.replace("{{CAPABILITY_BRAND_LINES}}", "")
    rendered_yaml = rendered_yaml.replace("{{CAPABILITY_COMMAND_LINES}}", "")
    rendered_yaml = rendered_yaml.replace("{{CUSTOM_SCRIPT_BLOCK}}", custom_script_block)
    rendered_yaml = rendered_yaml.replace("{{PORT_BLOCK}}", port_block if include_comments else "")
    rendered_yaml = rendered_yaml.replace("{{DEVICE_BLOCK}}", device_block if include_comments else "")
    rendered_yaml = rendered_yaml.replace("{{BUTTON_SECTION}}", "")

    # Build additional services for API section
    additional_services = [
        "    - service: tv_power",
        "      variables:",
        "        port: int",
        "      then:",
        "        - script.execute:",
        "            id: dispatch_power",
        "            target_port: !lambda 'return port;'",
        "    - service: tv_mute",
        "      variables:",
        "        port: int",
        "      then:",
        "        - script.execute:",
        "            id: dispatch_mute",
        "            target_port: !lambda 'return port;'",
        "    - service: tv_volume_up",
        "      variables:",
        "        port: int",
        "      then:",
        "        - script.execute:",
        "            id: dispatch_volume_up",
        "            target_port: !lambda 'return port;'",
        "    - service: tv_volume_down",
        "      variables:",
        "        port: int",
        "      then:",
        "        - script.execute:",
        "            id: dispatch_volume_down",
        "            target_port: !lambda 'return port;'",
        "    - service: tv_channel_up",
        "      variables:",
        "        port: int",
        "      then:",
        "        - script.execute:",
        "            id: dispatch_channel_up",
        "            target_port: !lambda 'return port;'",
        "    - service: tv_channel_down",
        "      variables:",
        "        port: int",
        "      then:",
        "        - script.execute:",
        "            id: dispatch_channel_down",
        "            target_port: !lambda 'return port;'",
        "    - service: tv_number",
        "      variables:",
        "        port: int",
        "        digit: int",
        "      then:",
        "        - script.execute:",
        "            id: dispatch_digit",
        "            target_port: !lambda 'return port;'",
        "            digit: !lambda 'return digit;'",
        "    - service: tv_channel",
        "      variables:",
        "        port: int",
        "        channel: int",
        "      then:",
        "        - script.execute:",
        "            id: smart_channel",
        "            target_port: !lambda 'return port;'",
        "            channel: !lambda 'return channel;'",
    ]

    # Add additional services to the API section
    if "api:" in rendered_yaml and "services:" in rendered_yaml:
        services_text = "\n".join(additional_services)
        rendered_yaml = rendered_yaml.replace(
            "      - script.execute: publish_capabilities",
            f"      - script.execute: publish_capabilities\n{services_text}"
        )

    # Add web handler lambda to on_boot if not present
    web_lambda_lines = _build_web_handler_lambda(port_profiles)
    web_lambda_section = "\n".join(_indent(web_lambda_lines, 10))

    if "on_boot:" not in rendered_yaml:
        # Add on_boot section after the project section
        project_pattern = 'version: "1.0.16"'
        if project_pattern in rendered_yaml:
            on_boot_section = f"""
  on_boot:
    priority: -10
    then:
      - logger.log: "Boot complete, web handler setup"
      - lambda: |-
{web_lambda_section}
"""
            rendered_yaml = rendered_yaml.replace(project_pattern, project_pattern + on_boot_section)

    # Update project name to dynamic_ir
    rendered_yaml = rendered_yaml.replace("smartvenue.universal_ir", "smartvenue.dynamic_ir")

    # Remove ArduinoJson.h include if present (causes compilation issues)
    rendered_yaml = rendered_yaml.replace("\n  includes:\n    - ArduinoJson.h", "")

    # No output section needed - using 5 separate IR transmitters
    output_section = ""

    # Add globals section before text_sensor section
    globals_section = _build_globals_section()
    if "text_sensor:" in rendered_yaml:
        rendered_yaml = rendered_yaml.replace(
            "text_sensor:",
            f"{output_section}{globals_section}\n\ntext_sensor:"
        )

    # Fix OTA section formatting
    rendered_yaml = rendered_yaml.replace(
        " ota:\n  - platform: esphome",
        "ota:\n  - platform: esphome"
    )

    return rendered_yaml


class TemplateLibrary(BaseModel):
    id: int
    name: str
    device_category: str
    brand: str
    model: Optional[str]
    source_path: str
    esp_native: bool


class TemplateBrand(BaseModel):
    name: str
    libraries: List[TemplateLibrary]


class TemplateCategory(BaseModel):
    name: str
    brands: List[TemplateBrand]


class PortAssignmentInput(BaseModel):
    port_number: int = Field(ge=1, le=5)
    library_id: Optional[int] = None


def _collect_port_profiles(
    assignments: List[PortAssignmentInput],
    libraries: Dict[int, IRLibrary],
    commands_by_library: Dict[int, List[IRCommand]]
) -> List[PortProfile]:
    profiles: List[PortProfile] = []

    for assignment in assignments:
        library = libraries.get(assignment.library_id) if assignment.library_id else None
        transmissions: Dict[str, TransmissionSpec] = {}

        if library:
            if getattr(library, 'esp_native', 0):
                transmissions = _build_native_transmissions(library)
            else:
                transmissions = _build_command_transmissions(
                    library,
                    commands_by_library.get(library.id, [])
                )

        profiles.append(
            PortProfile(
                port_number=assignment.port_number,
                library=library,
                commands=transmissions
            )
        )

    return profiles


class TemplatePreviewRequest(BaseModel):
    template_id: int
    assignments: List[PortAssignmentInput]
    include_comments: bool = True


class SelectedDevicePreview(BaseModel):
    library_id: int
    display_name: str
    device_category: str
    brand: str
    model: Optional[str]
    source_path: str


class TemplatePreviewResponse(BaseModel):
    yaml: str
    char_count: int
    selected_devices: List[SelectedDevicePreview]


class ESPTemplateUpdateRequest(BaseModel):
    template_yaml: str
    test_compile: bool = False
    version_increment: str = "patch"  # "major", "minor", "patch"


class FirmwareCompileRequest(BaseModel):
    yaml: str


class FirmwareCompileResponse(BaseModel):
    success: bool
    log: str
    binary_path: Optional[str]
    binary_filename: Optional[str]



class SaveYamlRequest(BaseModel):
    yaml: str
    filename: Optional[str] = None


class SaveYamlResponse(BaseModel):
    success: bool
    filename: str
    path: str


class ESPTemplateResponse(BaseModel):
    id: int
    name: str
    board: str
    description: Optional[str]
    template_yaml: str
    version: str
    revision: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=List[ESPTemplateSummary])
async def list_templates(db: Session = Depends(get_db)):
    templates = db.query(ESPTemplate).order_by(ESPTemplate.name).all()
    return templates


@router.get("/base", response_model=ESPTemplateResponse)
async def get_base_template(db: Session = Depends(get_db)):
    # Get the latest version of the first template (by highest revision)
    template = db.query(ESPTemplate).order_by(ESPTemplate.id.asc(), ESPTemplate.revision.desc()).first()
    if not template:
        raise HTTPException(status_code=404, detail="No ESP templates available")
    return template


@router.get("/{template_id:int}", response_model=ESPTemplateResponse)
async def get_template(template_id: int, db: Session = Depends(get_db)):
    template = db.query(ESPTemplate).filter(ESPTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.put("/{template_id:int}", response_model=ESPTemplateResponse)
async def update_template(
    template_id: int,
    payload: ESPTemplateUpdateRequest,
    db: Session = Depends(get_db),
):
    template = db.query(ESPTemplate).filter(ESPTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if not payload.template_yaml.strip():
        raise HTTPException(status_code=400, detail="Template YAML cannot be empty")

    # Test compilation if requested
    if payload.test_compile:
        builder = get_firmware_builder()
        result = await builder.compile_yaml(payload.template_yaml)
        if not result.success:
            raise HTTPException(status_code=400, detail=f"Template compilation failed: {result.log}")

    # Increment version
    new_version = increment_version(template.version, payload.version_increment)

    # Update YAML content with new version and date
    updated_yaml = update_yaml_version_and_date(payload.template_yaml, new_version)

    # Update template
    template.template_yaml = updated_yaml
    template.version = new_version
    template.revision += 1

    db.add(template)
    db.commit()
    db.refresh(template)

    return template


@router.get("/device-hierarchy", response_model=List[TemplateCategory])
async def get_device_hierarchy(db: Session = Depends(get_db)):
    libraries = db.query(IRLibrary).order_by(IRLibrary.device_category, IRLibrary.brand, IRLibrary.name).all()

    hierarchy: Dict[str, Dict[str, List[TemplateLibrary]]] = {}

    for lib in libraries:
        category = (lib.device_category or "Uncategorized").strip() or "Uncategorized"
        brand = (lib.brand or "Unknown").strip() or "Unknown"
        name = (lib.name or lib.model or brand or "Unnamed Library").strip() or "Unnamed Library"
        source_path = (lib.source_path or "").strip()

        hierarchy.setdefault(category, {}).setdefault(brand, []).append(
            TemplateLibrary(
                id=lib.id,
                name=name,
                device_category=category,
                brand=brand,
                model=lib.model,
                source_path=source_path,
                esp_native=bool(getattr(lib, "esp_native", 0)),
            )
        )

    response: List[TemplateCategory] = []
    for category_name, brands in hierarchy.items():
        brand_entries = [TemplateBrand(name=brand_name, libraries=libs) for brand_name, libs in brands.items()]
        response.append(TemplateCategory(name=category_name, brands=brand_entries))

    response.sort(key=lambda c: c.name.lower())
    for category in response:
        category.brands.sort(key=lambda b: b.name.lower())
        for brand in category.brands:
            brand.libraries.sort(key=lambda l: l.name.lower())

    return response


@router.post("/compile", response_model=FirmwareCompileResponse)
async def compile_firmware(payload: FirmwareCompileRequest):
    builder = get_firmware_builder()
    result = await builder.compile_yaml(payload.yaml)
    return FirmwareCompileResponse(
        success=result.success,
        log=result.log,
        binary_path=result.binary_path,
        binary_filename=result.binary_filename,
    )


@router.post("/compile-stream")
async def compile_firmware_stream(payload: FirmwareCompileRequest):
    """Stream compilation output in real-time via Server-Sent Events."""
    import queue
    import asyncio
    import threading

    async def event_stream():
        builder = get_firmware_builder()

        # Send initial status
        yield f"data: {json.dumps({'type': 'status', 'message': 'Starting compilation...'})}\n\n"

        # Create a queue for streaming output
        output_queue = queue.Queue()
        compilation_complete = threading.Event()
        result_holder = {"result": None}

        def stream_callback(line: str):
            output_queue.put(('output', line))

        # Run compilation in background thread
        def run_compilation():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                result = loop.run_until_complete(
                    builder.compile_yaml_streaming(payload.yaml, stream_callback)
                )
                result_holder["result"] = result
                output_queue.put(('complete', result))
            except Exception as e:
                output_queue.put(('error', str(e)))
            finally:
                compilation_complete.set()

        compilation_thread = threading.Thread(target=run_compilation)
        compilation_thread.start()

        # Stream output as it becomes available
        while not compilation_complete.is_set() or not output_queue.empty():
            try:
                # Non-blocking get with timeout
                event_type, data = output_queue.get(timeout=0.1)

                if event_type == 'output':
                    yield f"data: {json.dumps({'type': 'output', 'message': data})}\n\n"
                elif event_type == 'complete':
                    final_data = {
                        'type': 'complete',
                        'success': data.success,
                        'binary_filename': data.binary_filename,
                        'binary_path': data.binary_path
                    }
                    yield f"data: {json.dumps(final_data)}\n\n"
                elif event_type == 'error':
                    error_data = {
                        'type': 'error',
                        'message': f"Compilation error: {data}"
                    }
                    yield f"data: {json.dumps(error_data)}\n\n"

            except queue.Empty:
                # Send keepalive
                yield f"data: {json.dumps({'type': 'keepalive'})}\n\n"
                continue

        compilation_thread.join()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )


@router.get("/download/{filename}")
async def download_binary(filename: str):
    """Download a compiled binary file."""
    builder = get_firmware_builder()
    binary_path = builder.builds_dir / filename

    if not binary_path.exists():
        raise HTTPException(status_code=404, detail="Binary file not found")

    return FileResponse(
        path=str(binary_path),
        media_type="application/octet-stream",
        filename=filename,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


def _build_port_block(assignments: List[PortAssignmentInput], libraries: Dict[int, IRLibrary]) -> str:
    lines: List[str] = []
    ports_by_number = {assignment.port_number: assignment for assignment in assignments}

    for port_number in range(1, 6):
        assignment = ports_by_number.get(port_number)
        lib = libraries.get(assignment.library_id) if assignment and assignment.library_id else None

        if lib:
            display_name = lib.name or lib.model or lib.brand
            details = f"{display_name} ({lib.brand}{f' • {lib.model}' if lib.model else ''})"
        elif assignment and assignment.library_id and assignment.library_id not in libraries:
            details = f"Unknown library #{assignment.library_id}"
        else:
            details = "Unassigned"

        lines.append(f"#   Port {port_number}: {details}")

    if not lines:
        return "#   No port assignments"

    return "\n".join(lines)


def _build_device_block(selected_libraries: List[IRLibrary]) -> str:
    if not selected_libraries:
        return "#   No devices selected"

    lines: List[str] = []
    for lib in selected_libraries:
        display_name = lib.name or lib.model or lib.brand
        metadata = f"{lib.device_category} → {lib.brand}{f' → {lib.model}' if lib.model else ''}"
        lines.append(f"#   • {display_name} [{metadata}] ({lib.source_path})")

    return "\n".join(lines)




def _remove_comments(yaml_text: str) -> str:
    filtered = [line for line in yaml_text.splitlines() if not line.lstrip().startswith("#")]
    cleaned: List[str] = []
    for line in filtered:
        if cleaned and not line.strip() and not cleaned[-1].strip():
            continue
        cleaned.append(line)
    return "\n".join(cleaned).strip("\n") + "\n"


@router.post("/preview", response_model=TemplatePreviewResponse)
async def generate_preview(payload: TemplatePreviewRequest, db: Session = Depends(get_db)):
    template = db.query(ESPTemplate).filter(ESPTemplate.id == payload.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Normalize assignments (ensure exactly 5 ports)
    assignments_map: Dict[int, PortAssignmentInput] = {a.port_number: a for a in payload.assignments}
    normalized_assignments = [assignments_map.get(i, PortAssignmentInput(port_number=i)) for i in range(1, 6)]

    selected_library_ids = [a.library_id for a in normalized_assignments if a.library_id]
    unique_library_ids = sorted(set(selected_library_ids))

    if len(unique_library_ids) > 2:
        raise HTTPException(status_code=400, detail="Please select no more than two unique devices for now.")

    # Port limitation removed - now supports ports 1-5
    # unsupported_ports = [a.port_number for a in normalized_assignments if a.library_id and a.port_number > 2]
    # if unsupported_ports:
    #     raise HTTPException(status_code=400, detail="Port numbers above 2 are not yet supported by the dynamic builder.")

    libraries: Dict[int, IRLibrary] = {}
    if unique_library_ids:
        rows = db.query(IRLibrary).filter(IRLibrary.id.in_(unique_library_ids)).all()
        libraries = {row.id: row for row in rows}

    selected_libraries = [libraries[lid] for lid in unique_library_ids if lid in libraries]

    commands_by_library: Dict[int, List[IRCommand]] = {}
    if unique_library_ids:
        command_rows = db.query(IRCommand).filter(IRCommand.library_id.in_(unique_library_ids)).all()
        for command in command_rows:
            commands_by_library.setdefault(command.library_id, []).append(command)

    port_profiles = _collect_port_profiles(normalized_assignments, libraries, commands_by_library)

    # Build blocks
    port_block = _build_port_block(normalized_assignments, libraries)
    device_block = _build_device_block(selected_libraries)

    rendered = _render_dynamic_yaml(
        template=template,
        port_profiles=port_profiles,
        include_comments=payload.include_comments,
        port_block=port_block,
        device_block=device_block,
    )

    if not payload.include_comments:
        rendered = _remove_comments(rendered)

    rendered = rendered.strip("\n") + "\n"

    preview_devices = [
        SelectedDevicePreview(
            library_id=lib.id,
            display_name=lib.name or lib.model or lib.brand,
            device_category=lib.device_category,
            brand=lib.brand,
            model=lib.model,
            source_path=lib.source_path,
        )
        for lib in selected_libraries
    ]

    return TemplatePreviewResponse(
        yaml=rendered,
        char_count=len(rendered),
        selected_devices=preview_devices,
    )


@router.post("/save-yaml", response_model=SaveYamlResponse)
async def save_yaml_to_file(payload: SaveYamlRequest):
    """Save YAML content to a file on the server with timestamp."""
    try:
        # Create the esphome directory if it doesn't exist
        esphome_dir = Path("/home/coastal/smartvenue/esphome")
        esphome_dir.mkdir(exist_ok=True)

        # Generate filename with timestamp if not provided
        if payload.filename:
            filename = payload.filename
        else:
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            filename = f"smartvenue-ir-{timestamp}.yaml"

        # Ensure .yaml extension
        if not filename.endswith('.yaml'):
            filename += '.yaml'

        # Full path to save the file
        file_path = esphome_dir / filename

        # Write the YAML content to file
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(payload.yaml)

        return SaveYamlResponse(
            success=True,
            filename=filename,
            path=str(file_path)
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save YAML file: {str(e)}")
