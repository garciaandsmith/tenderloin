/** CPV (Common Procurement Vocabulary) codes relevant to García & Smith.
 *  Source: config/codigos_cpv.txt
 */
export const AGENCY_CPV_CODES: Array<{ code: string; label: string }> = [
  { code: "79416000", label: "Servicios de relaciones públicas" },
  { code: "79416200", label: "Consultoría en relaciones públicas" },
  { code: "79340000", label: "Servicios de publicidad y marketing" },
  { code: "79411000", label: "Consultoría en gestión general" },
  { code: "79311400", label: "Servicios de evaluación de publicidad" },
  { code: "79311200", label: "Encuestas de opinión pública" },
  { code: "72400000", label: "Servicios de internet" },
  { code: "72500000", label: "Servicios informáticos" },
  { code: "72322000", label: "Servicios de gestión de datos" },
  { code: "72212224", label: "Desarrollo de software web" },
  { code: "79822500", label: "Servicios de diseño gráfico" },
  { code: "92111200", label: "Producción de vídeo publicitario" },
  { code: "92100000", label: "Servicios de cine y vídeo" },
  { code: "79930000", label: "Servicios especializados de diseño" },
  { code: "79800000", label: "Servicios de imprenta" },
  { code: "79952000", label: "Servicios de eventos" },
  { code: "79950000", label: "Organización de exposiciones y congresos" },
  { code: "79953000", label: "Organización de festivales" },
  { code: "79954000", label: "Organización de fiestas" },
];

/** Return the human-readable label for a CPV code, or the code itself if not found. */
export function cpvLabel(code: string): string {
  const entry = AGENCY_CPV_CODES.find(
    (c) => c.code === code || code.startsWith(c.code.slice(0, 5))
  );
  return entry ? `${entry.code} — ${entry.label}` : code;
}

/** Check whether a CPV code matches any of the agency's CPV codes (prefix match). */
export function matchesCpv(code: string, cpvList: string[]): boolean {
  return cpvList.some((c) => code.startsWith(c));
}
