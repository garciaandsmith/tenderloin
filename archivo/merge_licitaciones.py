from __future__ import annotations

from pathlib import Path
from datetime import datetime
import pandas as pd


# ==========================
# CONFIGURACIÓN
# ==========================

BASE_FOLDER = Path(
    r"C:\Users\Miguel.Rubio Espinos\OneDrive\Route Miguel INC\García&Smith\Projects\TRESCOM\Licitaciones\SistemaLicitaciones"
)

SOURCE_FOLDER = BASE_FOLDER / "Archivo Historico de Licitaciones"

SHEET_NAME = "Licitaciones"
NAME_CONTAINS = "Licitaciones"

today_str = datetime.today().strftime("%Y%m%d")
OUTPUT_CSV = SOURCE_FOLDER / f"licitaciones_fusionadas_{today_str}.csv"

# Columnas de fecha a normalizar (dd/mm/aaaa -> yyyy-mm-dd)
DATE_COLUMNS = [
    "PlazoPresentacionFecha",
    # añade aquí otras columnas fecha si existen, por ejemplo:
    # "FechaIntroduccion",
]

# Mantener SOLO estas columnas y en este orden (vacío => mantener todas)
KEEP_COLS = [
    "SourceFile",
    "PlazoPresentacionFecha",
    "OrganismoConvocante",
    "InformacionWeb",
    "Presupuesto",
    "Objeto",
]


# ==========================
# HELPERS
# ==========================

def normalize_cols(cols: list[str]) -> list[str]:
    # Quitar espacios extremos para evitar "Columna " vs "Columna"
    return [c.strip() for c in cols]


def apply_keep_cols(df: pd.DataFrame) -> pd.DataFrame:
    if not KEEP_COLS:
        return df

    wanted = normalize_cols(KEEP_COLS)
    df = df.copy()
    df.columns = normalize_cols(list(df.columns))

    missing = [c for c in wanted if c not in df.columns]
    if missing:
        print(f"AVISO: faltan columnas en este archivo: {missing}")

    present = [c for c in wanted if c in df.columns]
    return df.loc[:, present]


def fix_date_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Convierte columnas fecha suponiendo entrada dd/mm/aaaa (dayfirst=True)
    y las deja como texto ISO yyyy-mm-dd para que Excel no las interprete al revés.
    """
    df = df.copy()
    for col in DATE_COLUMNS:
        if col in df.columns:
            # to_datetime soporta valores ya-datetime, números, strings, etc.
            s = pd.to_datetime(df[col], dayfirst=True, errors="coerce")

            # Convertimos a string ISO; NaT queda como <NA>
            df[col] = s.dt.strftime("%Y-%m-%d")

    return df


# ==========================
# PROCESO
# ==========================

def main() -> int:
    if not SOURCE_FOLDER.exists():
        print(f"ERROR: La carpeta origen no existe:\n{SOURCE_FOLDER}")
        return 1

    files = sorted(
        [p for p in SOURCE_FOLDER.glob("*.xlsx")
         if NAME_CONTAINS.lower() in p.name.lower()]
    )

    if not files:
        print(f"ERROR: No se encontraron archivos .xlsx que contengan '{NAME_CONTAINS}'")
        return 1

    dfs: list[pd.DataFrame] = []
    errors: list[str] = []

    for p in files:
        try:
            df = pd.read_excel(p, sheet_name=SHEET_NAME, engine="openpyxl")
            df = df.dropna(how="all")

            # Añadir trazabilidad
            df.insert(0, "SourceFile", p.name)

            # Selección/orden de columnas (si aplica)
            df = apply_keep_cols(df)

            dfs.append(df)
            print(f"OK  - {p.name}: {len(df):,} filas")

        except Exception as e:
            errors.append(f"{p.name} -> {e}")
            print(f"ERR - {p.name}: {e}")

    if not dfs:
        print("ERROR: No se pudo leer ningún archivo correctamente.")
        if errors:
            print("\nDetalles:")
            print("\n".join(errors))
        return 1

    merged = pd.concat(dfs, ignore_index=True, sort=False)

    # Arreglar fechas (dd/mm -> ISO)
    merged = fix_date_columns(merged)

    # Exportar como UTF-8 con BOM (Excel-friendly)
    merged.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")

    print("\n==============================")
    print(f"Archivos procesados: {len(dfs)} / {len(files)}")
    print(f"Filas totales:       {len(merged):,}")
    print(f"CSV generado en:     {OUTPUT_CSV}")
    print("==============================")

    if errors:
        print("\nArchivos con error:")
        print("\n".join(errors))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
