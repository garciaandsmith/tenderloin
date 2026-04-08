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

_SYSTEM_PROMPT_TECHNICAL = """\
Act as an expert in public procurement and contract analysis. Your goal is to \
break down the attached Technical Specifications Document (TSD/PPT) so that a \
bidding company can quickly understand if they are eligible and what they must offer.

Extract the information following this strict outline:

1. **Critical Mission (The "What"):** Define the main object of the contract and \
list the 5 most important tasks or deliverables that define the success of the \
service or project.
2. **Technical Capacity and Team (The "Who"):** Detail the specific personnel \
requirements (degrees, years of experience, certifications, or professional \
licenses) and whether subcontracting is permitted or prohibited.
3. **Timeline and On-site Requirements (The "When and Where"):** Indicate the \
initial performance period, possible extensions, and whether the service requires \
a physical presence (meetings, standby duty, site visits) or can be executed remotely.
4. **Urgency and Service Level Agreements (SLAs):** Identify required response \
times for incidents, deadlines for submitting reports, or mandatory critical milestones.
5. **Economic Threshold and Invoicing:** State the maximum tender budget \
(specifying whether it includes VAT or not) and the payment frequency \
(monthly, per milestone, etc.).
6. **Red Flags/Alerts:** Mention any relevant clauses regarding confidentiality, \
intellectual property, or penalties for non-compliance.

Output Format: Use headings, bold text for key concepts, and bullet points to \
ensure a quick and easy read. Add a link to the PDF.

Return your analysis as a JSON object with this exact structure:
{
  "services_required": "<your full markdown analysis>"
}

Use null for services_required if the document is not available.
Respond ONLY with the JSON, no text before or after.
"""

_SYSTEM_PROMPT_ADMINISTRATIVE = """\
Act as a senior expert in public procurement and legal bidding. Your task is to \
analyze the attached Administrative Clauses Particulars (ACD/PCAP) and extract \
the essential information a company needs to decide whether to bid and how to \
prepare their submission.

Please extract the following information in a structured format:

1. **Contract Basics:** State the contract's object, the Base Tender Budget \
(specifying with and without VAT), and the Estimated Value (including potential extensions).
2. **Eligibility & Solvency Requirements (The "Cut-off" Criteria):** Detail the \
minimum financial requirements (annual turnover) and technical requirements \
(specific previous contracts or certifications) needed to avoid disqualification.
3. **Procedure & Submission:** Identify the type of procedure (e.g., Open, \
Simplified, Abreviated) and the specific electronic platform required for \
submission (e.g., PLYCA, PLACE, etc.). Specify the number of "folders" or \
"envelopes" (Sobres) and their content.
4. **Award Criteria (How to Win):** Break down the scoring system. How many \
points are given for the Economic Offer (price) versus Qualitative Criteria \
(Technical Report/Judgment of Value)? List any "Improvements" (Mejoras) that \
grant extra points.
5. **Key Deadlines:** Identify the deadline for submitting bids, the initial \
duration of the contract, and the maximum duration including all possible extensions.
6. **Guarantees & Financial Obligations:** Mention if a Definitive Guarantee \
(usually 5%) is required upon award and any other costs the winner must cover \
(e.g., announcement fees).

Output Format: Use clear headings, bold key terms, and bullet points for \
readability. Link the PDF. If any specific data is not found in the document, \
state "Not specified in this document."

Return your analysis as a JSON object with this exact structure:
{
  "administrative_conditions": "<your full markdown analysis>"
}

Use null for administrative_conditions if the document is not available.
Respond ONLY with the JSON, no text before or after.
"""


@dataclass
class AnalysisResult:
    services_required: Optional[str]
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
        analysis_type: AnalysisType,
        ppt_text: str = "",
        pcap_text: str = "",
    ) -> AnalysisResult:
        """Call the LLM for the given *analysis_type* and return a structured AnalysisResult."""
        import anthropic

        if analysis_type == "technical":
            system_prompt = _SYSTEM_PROMPT_TECHNICAL
            doc_section = (
                f"TECHNICAL SPECIFICATIONS DOCUMENT (PPT):\n"
                f"{ppt_text if ppt_text else '(not available)'}"
            )
        else:
            system_prompt = _SYSTEM_PROMPT_ADMINISTRATIVE
            doc_section = (
                f"ADMINISTRATIVE CLAUSES DOCUMENT (PCAP):\n"
                f"{pcap_text if pcap_text else '(not available)'}"
            )

        user_content = (
            f"TENDER: {title}\n\n"
            f"CONTRACT OBJECT:\n{summary}\n\n"
            f"LINK: {link}\n\n"
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
            key_data_summary=None,  # now embedded within the main analysis sections
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
