#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from jsonschema import Draft202012Validator

EPSILON = 0.050


def main() -> int:
    parser = argparse.ArgumentParser(description="Valida o plano de edição.")
    parser.add_argument("plan", help="Caminho para edit_plan.json")
    parser.add_argument("--schema", help="Caminho alternativo do schema")
    args = parser.parse_args()

    plan_path = Path(args.plan).expanduser().resolve()
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    schema_path = (
        Path(args.schema).expanduser().resolve()
        if args.schema
        else Path(__file__).resolve().parents[1] / "schemas/edit_plan.schema.json"
    )
    schema = json.loads(schema_path.read_text(encoding="utf-8"))

    errors: list[str] = []
    for error in sorted(Draft202012Validator(schema).iter_errors(plan), key=lambda e: list(e.path)):
        location = ".".join(str(part) for part in error.path) or "raiz"
        errors.append(f"Schema [{location}]: {error.message}")

    segments = sorted(plan.get("segments", []), key=lambda item: item.get("start", 0))
    duration = float(plan.get("duration", 0))
    project_root = plan_path.parent.parent

    if segments:
        if abs(float(segments[0]["start"])) > EPSILON:
            errors.append(f"A timeline não começa em 0. Início atual: {segments[0]['start']}")

        cursor = 0.0
        for index, segment in enumerate(segments, start=1):
            start = float(segment["start"])
            end = float(segment["end"])
            if end <= start:
                errors.append(f"Segmento {index}: end deve ser maior que start")
            if start > cursor + EPSILON:
                errors.append(f"Lacuna antes do segmento {index}: {cursor:.3f}s até {start:.3f}s")
            if start < cursor - EPSILON:
                errors.append(f"Sobreposição no segmento {index}: começa em {start:.3f}s, cursor {cursor:.3f}s")
            cursor = max(cursor, end)

            source = project_root / segment["source_path"]
            if not source.exists():
                errors.append(f"Segmento {index}: arquivo não encontrado: {source}")

        if not math.isclose(cursor, duration, abs_tol=EPSILON):
            errors.append(f"Fim da timeline {cursor:.3f}s diferente da duração {duration:.3f}s")

    if errors:
        print("PLANO INVÁLIDO")
        for item in errors:
            print(f"- {item}")
        return 1

    print("PLANO VÁLIDO")
    print(f"Segmentos: {len(segments)} | Duração: {duration:.3f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
