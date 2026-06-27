#!/usr/bin/env python3
import argparse
import json
import shutil
import subprocess
from pathlib import Path


def write_log(logs_dir: Path, content: str):
    logs_dir.mkdir(parents=True, exist_ok=True)
    (logs_dir / "convert_pdf.log").write_text(content, encoding="utf-8")


def emit(success: bool, message: str, **extra):
    print(json.dumps({"success": success, "message": message, **extra}))


def main():
    parser = argparse.ArgumentParser(description="Convertit la premiere page d'un PDF en PNG.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--logs", required=True)
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    logs_dir = Path(args.logs)

    pdftoppm = shutil.which("pdftoppm")
    if pdftoppm is None:
        emit(False, "Conversion PDF indisponible : installer poppler ou utiliser une image PNG/JPEG.")
        return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    prefix = output_path.with_suffix("")
    command = [pdftoppm, "-f", "1", "-singlefile", "-png", "-r", "200", str(input_path), str(prefix)]

    try:
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
        write_log(logs_dir, f"$ {' '.join(command)}\n\nSTDOUT:\n{completed.stdout}\n\nSTDERR:\n{completed.stderr}")
        if completed.returncode != 0:
            emit(False, "Conversion PDF indisponible : installer poppler ou utiliser une image PNG/JPEG.")
            return

        generated = prefix.with_suffix(".png")
        if generated != output_path and generated.exists():
            generated.replace(output_path)

        if not output_path.exists():
            emit(False, "Conversion PDF indisponible : installer poppler ou utiliser une image PNG/JPEG.")
            return

        emit(True, "PDF converti en PNG.", output=str(output_path))
    except Exception as exc:
        write_log(logs_dir, str(exc))
        emit(False, "Conversion PDF indisponible : installer poppler ou utiliser une image PNG/JPEG.")


if __name__ == "__main__":
    main()
