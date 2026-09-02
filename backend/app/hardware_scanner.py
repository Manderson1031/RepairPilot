import base64
import json
import mimetypes
import os
from pathlib import Path
from typing import Any


def _empty_result(kind: str, reason: str) -> dict[str, Any]:
    return {
        "kind": kind,
        "identified_part": "",
        "standard": "",
        "measurements": {
            "diameter_mm": None,
            "length_mm": None,
            "thread_pitch_mm": None,
            "threads_per_inch": None,
            "width_mm": None,
            "height_mm": None,
        },
        "markings": [],
        "candidate_matches": [],
        "confidence": 0.0,
        "needs_reference_scale": True,
        "warnings": [reason],
    }


def analyze_hardware_image(path: Path, filename: str, kind: str = "OTHER") -> dict[str, Any]:
    """Conservative hardware identification from one camera image.

    Image-only dimensional estimates are intentionally withheld unless a visible
    reference scale is present. This prevents RepairPilot from presenting a
    guessed bolt diameter, thread pitch, bearing size, or fitting size as a
    measurement.
    """
    kind = (kind or "OTHER").strip().upper()
    if kind not in {"FASTENER", "FITTING", "BEARING", "OTHER"}:
        kind = "OTHER"

    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return _empty_result(kind, "AI hardware analysis is not configured on the server.")

    from openai import OpenAI

    client = OpenAI(api_key=key)
    mime = mimetypes.guess_type(filename)[0] or "image/jpeg"
    data = base64.b64encode(path.read_bytes()).decode()

    schema = {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "kind", "identified_part", "standard", "measurements", "markings",
            "candidate_matches", "confidence", "needs_reference_scale", "warnings"
        ],
        "properties": {
            "kind": {"type": "string", "enum": ["FASTENER", "FITTING", "BEARING", "OTHER"]},
            "identified_part": {"type": "string"},
            "standard": {"type": "string"},
            "measurements": {
                "type": "object",
                "additionalProperties": False,
                "required": ["diameter_mm", "length_mm", "thread_pitch_mm", "threads_per_inch", "width_mm", "height_mm"],
                "properties": {
                    "diameter_mm": {"type": ["number", "null"]},
                    "length_mm": {"type": ["number", "null"]},
                    "thread_pitch_mm": {"type": ["number", "null"]},
                    "threads_per_inch": {"type": ["number", "null"]},
                    "width_mm": {"type": ["number", "null"]},
                    "height_mm": {"type": ["number", "null"]},
                },
            },
            "markings": {"type": "array", "items": {"type": "string"}},
            "candidate_matches": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["name", "reason"],
                    "properties": {
                        "name": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                },
            },
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "needs_reference_scale": {"type": "boolean"},
            "warnings": {"type": "array", "items": {"type": "string"}},
        },
    }

    instructions = """You are RepairPilot's hardware scanner.
Analyze only what is visibly supported by the photo. Never invent dimensions, thread pitch, grade, pressure rating, bearing number, fitting standard, or replacement part number.
If there is no trustworthy scale/reference object in the same plane as the hardware, return null for physical dimensions and set needs_reference_scale=true.
Read visible head stamps, bearing codes, fitting markings, and manufacturer markings exactly when possible.
For FASTENER distinguish bolt/screw/nut/washer/stud and likely head/drive style. For FITTING describe visible fitting family and geometry but do not guess NPT/JIC/ORB/BSP without evidence. For BEARING use visible shield/seal/code markings and geometry. Candidate matches are hypotheses only and must include a reason.
Use confidence conservatively."""

    response = client.responses.create(
        model=os.getenv("REPAIRPILOT_VISION_MODEL", "gpt-5.6-terra"),
        instructions=instructions,
        input=[{
            "role": "user",
            "content": [
                {"type": "input_text", "text": f"Scan this hardware image. User-selected category: {kind}."},
                {"type": "input_image", "image_url": f"data:{mime};base64,{data}"},
            ],
        }],
        text={"format": {"type": "json_schema", "name": "hardware_scan", "strict": True, "schema": schema}},
        max_output_tokens=1200,
        store=False,
    )

    result = json.loads(response.output_text)
    # Keep the user's selected category authoritative when the model strays.
    result["kind"] = kind
    return result
