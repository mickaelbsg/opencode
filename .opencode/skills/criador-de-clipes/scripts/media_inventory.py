#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any

from PIL import Image

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"}


def run_json(command: list[str]) -> dict[str, Any]:
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def orientation(width: int, height: int) -> str:
    if width == height:
        return "square"
    return "landscape" if width > height else "portrait"


def image_metadata(path: Path, root: Path) -> dict[str, Any]:
    with Image.open(path) as image:
        width, height = image.size
    return {
        "id": f"img_{path.stem}",
        "path": path.relative_to(root).as_posix(),
        "type": "image",
        "width": width,
        "height": height,
        "orientation": orientation(width, height),
        "description": None,
        "people_count": None,
        "objects": [],
        "actions": [],
        "emotions": [],
        "concepts": [],
        "quality_score": None,
        "usable": True,
        "analysis_status": "pending_vision",
    }


def video_metadata(path: Path, root: Path, keyframe_dir: Path, interval: int) -> dict[str, Any]:
    probe = run_json([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)
    ])
    video_stream = next((s for s in probe.get("streams", []) if s.get("codec_type") == "video"), {})
    width = int(video_stream.get("width", 0) or 0)
    height = int(video_stream.get("height", 0) or 0)
    duration = float(probe.get("format", {}).get("duration", 0) or 0)

    target = keyframe_dir / path.stem
    target.mkdir(parents=True, exist_ok=True)
    output_pattern = target / "frame_%05d.jpg"
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(path),
        "-vf", f"fps=1/{max(interval, 1)},scale='min(960,iw)':-2",
        "-q:v", "3", str(output_pattern)
    ], check=True)

    keyframes = sorted(p.relative_to(root).as_posix() for p in target.glob("*.jpg"))
    return {
        "id": f"vid_{path.stem}",
        "path": path.relative_to(root).as_posix(),
        "type": "video",
        "duration": duration,
        "width": width,
        "height": height,
        "orientation": orientation(width, height) if width and height else "unknown",
        "keyframes": keyframes,
        "segments": [],
        "description": None,
        "people_count": None,
        "objects": [],
        "actions": [],
        "emotions": [],
        "concepts": [],
        "quality_score": None,
        "usable": True,
        "analysis_status": "pending_vision",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Cria inventário técnico e extrai quadros-chave.")
    parser.add_argument("project", help="Caminho do projeto")
    parser.add_argument("--interval", type=int, default=3, help="Intervalo entre quadros-chave em segundos")
    args = parser.parse_args()

    root = Path(args.project).expanduser().resolve()
    work = root / "work"
    keyframes = work / "keyframes"
    work.mkdir(parents=True, exist_ok=True)
    keyframes.mkdir(parents=True, exist_ok=True)

    assets: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for directory, extensions in [
        (root / "input/images", IMAGE_EXTENSIONS),
        (root / "generated/images", IMAGE_EXTENSIONS),
    ]:
        if directory.exists():
            for path in sorted(directory.rglob("*")):
                if path.suffix.lower() in extensions:
                    try:
                        assets.append(image_metadata(path, root))
                    except Exception as exc:  # noqa: BLE001
                        errors.append({"path": str(path), "error": str(exc)})

    for directory, extensions in [
        (root / "input/videos", VIDEO_EXTENSIONS),
        (root / "generated/videos", VIDEO_EXTENSIONS),
    ]:
        if directory.exists():
            for path in sorted(directory.rglob("*")):
                if path.suffix.lower() in extensions:
                    try:
                        assets.append(video_metadata(path, root, keyframes, args.interval))
                    except Exception as exc:  # noqa: BLE001
                        errors.append({"path": str(path), "error": str(exc)})

    payload = {"project": root.name, "assets": assets, "errors": errors}
    output = work / "media_catalog.json"
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Catálogo salvo em: {output}")
    print(f"Ativos: {len(assets)} | Erros: {len(errors)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
