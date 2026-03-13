"""Claude API client for tender document analysis."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

_MODEL = "claude-opus-4-6"
_MAX_INPUT_CHARS = 15_000  # chars of document text to send to the LLM
_MAX_TOKENS = 2048

_SYSTEM_PROMPT = """\
Eres un asistente especializado en análisis de licitaciones públicas españolas.
Dado el objeto del contrato y, cuando estén disponibles, los documentos del pliego,
extrae la información relevante y devuelve ÚNICAMENTE un objeto JSON válido con estas claves:

{
  "services_required": "<descripción de los servicios o trabajos a prestar>",
  "technical_conditions": "<solvencia técnica exigida: certificaciones, experiencia mínima, medios materiales y humanos, etc.>",
  "administrative_conditions": "<condiciones administrativas: plazos de ejecución, garantías, criterios de adjudicación, composición del equipo mínimo, desglose de presupuesto, etc.>",
  "key_data_summary": "<datos clave: presupuesto base de licitación, plazo de presentación de ofertas, duración del contrato, número de lotes, etc.>"
}

Usa null para cualquier campo sobre el que no tengas información suficiente.
Responde SOLO con el JSON, sin texto antes ni después.
"""


@dataclass
class AnalysisResult:
    services_required: Optional[str]
    technical_conditions: Optional[str]
    administrative_conditions: Optional[str]
    key_data_summary: Optional[str]
    raw_llm_output: dict


class LLMAnalyzer:
    """Analyzes tender documents using the Claude API."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    def analyze(
        self,
        title: str,
        summary: str,
        link: str,
        documents_text: str,
    ) -> AnalysisResult:
        """Call the LLM and return a structured AnalysisResult."""
        import anthropic

        user_content = f"LICITACIÓN: {title}\n\nOBJETO DEL CONTRATO:\n{summary}\n\nENLACE: {link}"
        if documents_text:
            truncated = documents_text[:_MAX_INPUT_CHARS]
            user_content += f"\n\nCONTENIDO DE LOS DOCUMENTOS:\n{truncated}"

        client = anthropic.Anthropic(api_key=self._api_key)
        message = client.messages.create(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )

        raw_text = message.content[0].text
        raw_output = {"model": _MODEL, "response": raw_text}

        parsed = _parse_json(raw_text)

        return AnalysisResult(
            services_required=parsed.get("services_required") or None,
            technical_conditions=parsed.get("technical_conditions") or None,
            administrative_conditions=parsed.get("administrative_conditions") or None,
            key_data_summary=parsed.get("key_data_summary") or None,
            raw_llm_output=raw_output,
        )


def _parse_json(text: str) -> dict:
    """Extract and parse the first JSON object found in *text*."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"No valid JSON found in LLM response: {text[:300]!r}")
