#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shlex
import subprocess
from pathlib import Path
from typing import Any

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


def escape_filter_path(path: Path) -> str:
    return str(path).replace("\\", "/").replace(":", "\\:").replace("'", "\\'")


def main() -> int:
    parser = argparse.ArgumentParser(description="Renderiza um clipe a partir de work/edit_plan.json")
    parser.add_argument("project", help="Caminho do projeto")
    parser.add_argument("--output", default="output/final.mp4", help="Arquivo de saída relativo ao projeto")
    parser.add_argument("--preview", action="store_true", help="Renderiza uma prévia 960x540")
    args = parser.parse_args()

    root = Path(args.project).expanduser().resolve()
    plan_path = root / "work/edit_plan.json"
    if not plan_path.exists():
        raise SystemExit(f"Plano não encontrado: {plan_path}")

    plan: dict[str, Any] = json.loads(plan_path.read_text(encoding="utf-8"))
    segments = sorted(plan["segments"], key=lambda item: item["start"])
    audio = root / plan["audio"]
    if not audio.exists():
        raise SystemExit(f"Áudio não encontrado: {audio}")

    width = 960 if args.preview else int(plan["resolution"]["width"])
    height = 540 if args.preview else int(plan["resolution"]["height"])
    fps = int(plan.get("fps", 30))

    command = ["ffmpeg", "-hide_banner", "-y"]
    segment_durations: list[float] = []
    for segment in segments:
        duration = float(segment["end"]) - float(segment["start"])
        segment_durations.append(duration)
        source = root / segment["source_path"]
        if source.suffix.lower() in IMAGE_EXTENSIONS:
            command.extend(["-loop", "1", "-t", f"{duration:.6f}", "-i", str(source)])
        else:
            source_start = float(segment.get("source_start", 0))
            command.extend(["-ss", f"{source_start:.6f}", "-t", f"{duration:.6f}", "-i", str(source)])
    command.extend(["-i", str(audio)])

    filter_parts: list[str] = []
    concat_inputs: list[str] = []
    for index, (segment, duration) in enumerate(zip(segments, segment_durations)):
        source = root / segment["source_path"]
        base = (
            f"[{index}:v]scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},setsar=1,fps={fps}"
        )
        if source.suffix.lower() in IMAGE_EXTENSIONS:
            frames = max(1, round(duration * fps))
            motion = segment.get("motion", "slow_zoom_in")
            if motion == "slow_zoom_out":
                zoom = "if(eq(on,0),1.08,max(1.0,zoom-0.0008))"
            elif motion == "none":
                zoom = "1.0"
            else:
                zoom = "min(zoom+0.0008,1.08)"
            base += f",zoompan=z='{zoom}':d={frames}:s={width}x{height}:fps={fps}"
        base += f",trim=duration={duration:.6f},setpts=PTS-STARTPTS[v{index}]"
        filter_parts.append(base)
        concat_inputs.append(f"[v{index}]")

    filter_parts.append("".join(concat_inputs) + f"concat=n={len(segments)}:v=1:a=0[vout]")
    subtitles = root / "work/subtitles.ass"
    if not subtitles.exists():
        subtitles = root / "work/subtitles.srt"

    final_label = "vout"
    if subtitles.exists():
        escaped = escape_filter_path(subtitles)
        filter_parts.append(f"[vout]subtitles='{escaped}'[vsub]")
        final_label = "vsub"

    output_path = root / args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    command.extend([
        "-filter_complex", ";".join(filter_parts),
        "-map", f"[{final_label}]",
        "-map", f"{len(segments)}:a:0",
        "-t", f"{float(plan['duration']):.6f}",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18" if not args.preview else "25",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        "-shortest",
        str(output_path),
    ])

    print("Executando:")
    print(" ".join(shlex.quote(part) for part in command))
    subprocess.run(command, check=True)
    print(f"Render concluído: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
