#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def srt_timestamp(seconds: float) -> str:
    milliseconds = int(round(seconds * 1000))
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    secs, milliseconds = divmod(milliseconds, 1_000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcreve áudio e gera JSON/SRT.")
    parser.add_argument("audio", help="Arquivo de áudio")
    parser.add_argument("--output", default="work", help="Diretório de saída")
    parser.add_argument("--model", default="medium", help="Modelo Faster-Whisper")
    parser.add_argument("--language", default="pt", help="Idioma")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise SystemExit("Instale as dependências: pip install -r requirements.txt") from exc

    audio = Path(args.audio).expanduser().resolve()
    output = Path(args.output).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)

    model = WhisperModel(args.model, device="auto", compute_type="auto")
    segments_iter, info = model.transcribe(
        str(audio), language=args.language, word_timestamps=True, vad_filter=True
    )

    segments = []
    srt_blocks = []
    for index, segment in enumerate(segments_iter, start=1):
        words = [
            {"start": word.start, "end": word.end, "word": word.word}
            for word in (segment.words or [])
        ]
        item = {
            "id": index,
            "start": segment.start,
            "end": segment.end,
            "text": segment.text.strip(),
            "words": words,
        }
        segments.append(item)
        srt_blocks.append(
            f"{index}\n{srt_timestamp(segment.start)} --> {srt_timestamp(segment.end)}\n"
            f"{segment.text.strip()}\n"
        )

    transcript = {
        "audio": str(audio),
        "language": info.language,
        "language_probability": info.language_probability,
        "duration": info.duration,
        "segments": segments,
    }
    (output / "transcript.json").write_text(
        json.dumps(transcript, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (output / "subtitles.srt").write_text("\n".join(srt_blocks), encoding="utf-8")
    print(f"Transcrição salva em: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
