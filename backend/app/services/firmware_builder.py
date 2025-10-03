import asyncio
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, AsyncGenerator, Callable
import shutil
import os


@dataclass
class FirmwareBuildResult:
    success: bool
    log: str
    binary_path: Optional[str] = None
    binary_filename: Optional[str] = None


class FirmwareBuilder:
    def __init__(self, workspace: Path):
        self.workspace = workspace
        self.compile_timeout = 600  # seconds
        self.builds_dir = self.workspace / "builds"
        self.builds_dir.mkdir(parents=True, exist_ok=True)

    async def compile_yaml(self, yaml_content: str) -> FirmwareBuildResult:
        """Compile the provided YAML and return the result."""
        temp_dir = Path(tempfile.mkdtemp(prefix="smartvenue-esphome-", dir=self.workspace))
        yaml_path = temp_dir / "firmware.yaml"
        yaml_path.write_text(yaml_content)

        process = await asyncio.create_subprocess_exec(
            "esphome",
            "compile",
            str(yaml_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        try:
            stdout, _ = await asyncio.wait_for(process.communicate(), timeout=self.compile_timeout)
        except asyncio.TimeoutError:
            process.kill()
            return FirmwareBuildResult(success=False, log="Compilation timed out after 10 minutes.")

        log = stdout.decode()
        success = process.returncode == 0

        binary_path = None
        binary_filename = None
        if success:
            build_dir = temp_dir / ".esphome" / "build"
            if build_dir.exists():
                binaries = list(build_dir.glob("**/*.bin"))
                if binaries:
                    # Copy binary to persistent location with unique name
                    build_id = str(uuid.uuid4())
                    binary_filename = f"firmware_{build_id}.bin"
                    persistent_binary_path = self.builds_dir / binary_filename
                    shutil.copy2(binaries[0], persistent_binary_path)
                    binary_path = str(persistent_binary_path)

        return FirmwareBuildResult(
            success=success,
            log=log,
            binary_path=binary_path,
            binary_filename=binary_filename
        )

    async def compile_yaml_streaming(
        self,
        yaml_content: str,
        output_callback: Callable[[str], None]
    ) -> FirmwareBuildResult:
        """Compile YAML with real-time output streaming."""
        temp_dir = Path(tempfile.mkdtemp(prefix="smartvenue-esphome-", dir=self.workspace))
        yaml_path = temp_dir / "firmware.yaml"
        yaml_path.write_text(yaml_content)

        process = await asyncio.create_subprocess_exec(
            "esphome",
            "compile",
            str(yaml_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        log_lines = []

        async def read_output():
            while True:
                line = await process.stdout.readline()
                if not line:
                    break
                line_str = line.decode().rstrip()
                log_lines.append(line_str)
                output_callback(line_str)

        try:
            # Run output reading and wait for process completion
            await asyncio.wait_for(
                asyncio.gather(read_output(), process.wait()),
                timeout=self.compile_timeout
            )
        except asyncio.TimeoutError:
            process.kill()
            output_callback("ERROR: Compilation timed out after 10 minutes.")
            return FirmwareBuildResult(success=False, log="\n".join(log_lines))

        log = "\n".join(log_lines)
        success = process.returncode == 0

        binary_path = None
        binary_filename = None
        if success:
            build_dir = temp_dir / ".esphome" / "build"
            if build_dir.exists():
                binaries = list(build_dir.glob("**/*.bin"))
                if binaries:
                    # Copy binary to persistent location with unique name
                    build_id = str(uuid.uuid4())
                    binary_filename = f"firmware_{build_id}.bin"
                    persistent_binary_path = self.builds_dir / binary_filename
                    shutil.copy2(binaries[0], persistent_binary_path)
                    binary_path = str(persistent_binary_path)
                    output_callback(f"SUCCESS: Binary saved as {binary_filename}")

        return FirmwareBuildResult(
            success=success,
            log=log,
            binary_path=binary_path,
            binary_filename=binary_filename
        )


def get_firmware_builder() -> FirmwareBuilder:
    workspace = Path(tempfile.gettempdir()) / "smartvenue-esphome"
    workspace.mkdir(parents=True, exist_ok=True)
    return FirmwareBuilder(workspace)
