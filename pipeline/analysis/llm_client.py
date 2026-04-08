"""Claude API client for tender document analysis."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Literal, Optional

logger = logging.getLogger(__name__)

_MODEL = "claude-opus-4-6"
_MAX_TOKENS = 8192

AnalysisType = Literal["technical", "administrative"]


@dataclass
class AnalysisResult:
    services_required: Optional[str]
    administrative_conditions: Optional[str]
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
        analysis_type: AnalysisType,
        ppt_text: str = "",
        pcap_text: str = "",
        *,
        system_prompt: str,
    ) -> AnalysisResult:
        """Call the LLM for the given *analysis_type* and return a structured AnalysisResult.

        *system_prompt* is required and must be provided by the caller (fetched from the
        project's configuration). No hardcoded defaults exist — if the prompt is missing
        the analysis should never reach this method.
        """
        import anthropic

        if analysis_type == "technical":
            doc_section = (
                f"PLIEGO DE PRESCRIPCIONES TÉCNICAS (PPT):\n"
                f"{ppt_text if ppt_text else '(no disponible)'}"
            )
        else:
            doc_section = (
                f"PLIEGO DE CLÁUSULAS ADMINISTRATIVAS (PCAP):\n"
                f"{pcap_text if pcap_text else '(no disponible)'}"
            )

        user_content = (
            f"LICITACIÓN: {title}\n\n"
            f"OBJETO DEL CONTRATO:\n{summary}\n\n"
            f"ENLACE: {link}\n\n"
            f"{doc_section}"
        )

        client = anthropic.Anthropic(api_key=self._api_key)
        message = client.messages.create(
            model=_MODEL,
            max_tokens=_MAX_TOKENS,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )

        raw_text = message.content[0].text
        raw_output = {"model": _MODEL, "response": raw_text}

        parsed = _parse_json(raw_text)

        return AnalysisResult(
            services_required=parsed.get("services_required") or None,
            administrative_conditions=parsed.get("administrative_conditions") or None,
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
