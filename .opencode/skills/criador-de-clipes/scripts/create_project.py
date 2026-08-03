#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

DIRECTORIES = [
    "input/audio",
    "input/images",
    "input/videos",
    "input/references",
    "generated/images",
    "generated/videos",
    "work/keyframes",
    "output",
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Cria a estrutura de um projeto de videoclipe.")
    parser.add_argument("project", help="Nome ou caminho do projeto")
    args = parser.parse_args()

    root = Path(args.project).expanduser().resolve()
    for directory in DIRECTORIES:
        (root / directory).mkdir(parents=True, exist_ok=True)

    skill_root = Path(__file__).resolve().parents[1]
    source_config = skill_root / "config.example.yaml"
    target_config = root / "config.yaml"
    if source_config.exists() and not target_config.exists():
        shutil.copy2(source_config, target_config)

    readme = root / "LEIA-ME.txt"
    if not readme.exists():
        readme.write_text(
            "1. Coloque a música em input/audio.\n"
            "2. Coloque fotos em input/images e vídeos em input/videos.\n"
            "3. Opcionalmente adicione input/lyrics.txt.\n"
            "4. Execute media_inventory.py e transcribe.py.\n",
            encoding="utf-8",
        )

    print(f"Projeto criado em: {root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
