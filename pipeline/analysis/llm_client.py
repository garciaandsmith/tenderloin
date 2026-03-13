"""Claude API client for tender document analysis."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

_MODEL = "claude-opus-4-6"
_MAX_DOC_CHARS = 8_000   # chars per document sent to the LLM
_MAX_TOKENS = 4096

_SYSTEM_PROMPT = """\
Eres un asistente especializado en análisis de licitaciones públicas españolas.
Se te proporcionan el objeto del contrato y, cuando estén disponibles, el texto del
Pliego de Prescripciones Técnicas (PPT) y del Pliego de Cláusulas Administrativas (PCAP).

Extrae la información relevante y devuelve ÚNICAMENTE un objeto JSON válido con estas claves:

{
  "services_required": "<Extraído del PLIEGO DE PRESCRIPCIONES TÉCNICAS.\\n\\nResumen del objeto: párrafo de 3-5 frases que explique el objetivo general y el alcance del servicio contratado.\\n\\nServicios y actuaciones: lista numerada y completa de todos los servicios, actividades y tareas que debe realizar el adjudicatario, tal como aparecen en el pliego técnico.\\n\\nRequisitos del equipo: perfiles profesionales exigidos, titulaciones requeridas, experiencia mínima de cada perfil y dedicación (jornada/horas) requerida.>",
  "technical_conditions": null,
  "administrative_conditions": "<Extraído del PLIEGO DE CLÁUSULAS ADMINISTRATIVAS. Condiciones legales y administrativas relevantes que la empresa debe cumplir: criterios de solvencia económica y técnica, garantías exigidas, condiciones de subcontratación, obligaciones de confidencialidad, seguros requeridos, penalidades por incumplimiento, y cualquier otra obligación administrativa de carácter relevante.>",
  "key_data_summary": "<Datos clave: presupuesto base de licitación (con y sin IVA si consta), valor estimado del contrato, plazo límite de presentación de ofertas (fecha y hora), duración del contrato y posibles prórrogas, número de lotes, código CPV, órgano de contratación.>"
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
        ppt_text: str,
        pcap_text: str,
    ) -> AnalysisResult:
        """Call the LLM and return a structured AnalysisResult."""
        import anthropic

        ppt_section = ppt_text[:_MAX_DOC_CHARS] if ppt_text else "(no disponible)"
        pcap_section = pcap_text[:_MAX_DOC_CHARS] if pcap_text else "(no disponible)"

        user_content = (
            f"LICITACIÓN: {title}\n\n"
            f"OBJETO DEL CONTRATO:\n{summary}\n\n"
            f"ENLACE: {link}\n\n"
            f"PLIEGO DE PRESCRIPCIONES TÉCNICAS:\n{ppt_section}\n\n"
            f"PLIEGO DE CLÁUSULAS ADMINISTRATIVAS:\n{pcap_section}"
        )

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
