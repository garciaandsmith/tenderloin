"""Code-to-label lookup tables for NUTS regions and CPV procurement vocabulary.

NUTS labels are embedded as a constant (small, stable set covering national,
NUTS-1, NUTS-2, and NUTS-3 levels used by PLACSP).

CPV labels are loaded at runtime from public/cpv-data.json, which covers the
full ~10 000-entry EU Common Procurement Vocabulary.
"""
from __future__ import annotations

import json
from pathlib import Path

# ── NUTS (Nomenclatura de Unidades Territoriales Estadísticas) ─────────────────
# All levels present in PLACSP data: national, NUTS-1, NUTS-2, and NUTS-3.
NUTS_LABELS: dict[str, str] = {
    # National
    "ES": "España",
    # NUTS-1
    "ES1": "Noroeste",
    "ES2": "Noreste",
    "ES3": "Comunidad de Madrid",
    "ES4": "Centro",
    "ES5": "Este",
    "ES6": "Sur",
    "ES7": "Canarias",
    # NUTS-2 (autonomous communities)
    "ES11": "Galicia",
    "ES12": "Principado de Asturias",
    "ES13": "Cantabria",
    "ES21": "País Vasco",
    "ES22": "Comunidad Foral de Navarra",
    "ES23": "La Rioja",
    "ES24": "Aragón",
    "ES30": "Comunidad de Madrid",
    "ES41": "Castilla y León",
    "ES42": "Castilla-La Mancha",
    "ES43": "Extremadura",
    "ES51": "Cataluña",
    "ES52": "Comunitat Valenciana",
    "ES53": "Illes Balears",
    "ES61": "Andalucía",
    "ES62": "Región de Murcia",
    "ES63": "Ciudad de Ceuta",
    "ES64": "Ciudad de Melilla",
    "ES70": "Canarias",
    # NUTS-3 (provinces)
    "ES111": "A Coruña",
    "ES112": "Lugo",
    "ES113": "Ourense",
    "ES114": "Pontevedra",
    "ES120": "Asturias",
    "ES130": "Cantabria",
    "ES211": "Araba/Álava",
    "ES212": "Gipuzkoa",
    "ES213": "Bizkaia",
    "ES220": "Navarra",
    "ES230": "La Rioja",
    "ES241": "Huesca",
    "ES242": "Teruel",
    "ES243": "Zaragoza",
    "ES300": "Madrid",
    "ES411": "Ávila",
    "ES412": "Burgos",
    "ES413": "Palencia",
    "ES414": "Salamanca",
    "ES415": "Segovia",
    "ES416": "Soria",
    "ES417": "Valladolid",
    "ES418": "Zamora",
    "ES421": "Albacete",
    "ES422": "Ciudad Real",
    "ES423": "Cuenca",
    "ES424": "Guadalajara",
    "ES425": "Toledo",
    "ES431": "Badajoz",
    "ES432": "Cáceres",
    "ES511": "Barcelona",
    "ES512": "Girona",
    "ES513": "Lleida",
    "ES514": "Tarragona",
    "ES521": "Valencia/València",
    "ES522": "Castellón/Castelló",
    "ES523": "Alicante/Alacant",
    "ES531": "Eivissa i Formentera",
    "ES532": "Mallorca",
    "ES533": "Menorca",
    "ES611": "Almería",
    "ES612": "Cádiz",
    "ES613": "Córdoba",
    "ES614": "Granada",
    "ES615": "Huelva",
    "ES616": "Jaén",
    "ES617": "Málaga",
    "ES618": "Sevilla",
    "ES620": "Murcia",
    "ES630": "Ciudad Autónoma de Ceuta",
    "ES640": "Ciudad Autónoma de Melilla",
    "ES701": "Las Palmas",
    "ES702": "Santa Cruz de Tenerife",
}


_cpv_cache: dict[str, str] | None = None


def load_cpv_labels(cpv_data_path: Path) -> dict[str, str]:
    """Return a code→label dict loaded from the cpv-data.json file.

    Results are cached in-process after the first load.
    """
    global _cpv_cache
    if _cpv_cache is None:
        with cpv_data_path.open(encoding="utf-8") as fh:
            entries = json.load(fh)
        _cpv_cache = {entry["c"]: entry["l"] for entry in entries}
    return _cpv_cache
