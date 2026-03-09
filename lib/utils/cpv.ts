export interface CpvEntry {
  code: string;
  label: string;
  category: string;
}

/** CPV (Common Procurement Vocabulary) codes relevant to García & Smith.
 *  Source: config/codigos_cpv.txt
 */
export const AGENCY_CPV_CODES: CpvEntry[] = [
  // Marketing & Comunicación
  { code: "79416000", label: "Servicios de relaciones públicas", category: "Marketing & Comunicación" },
  { code: "79416200", label: "Consultoría en relaciones públicas", category: "Marketing & Comunicación" },
  { code: "79340000", label: "Servicios de publicidad y marketing", category: "Marketing & Comunicación" },
  { code: "79411000", label: "Consultoría en gestión general", category: "Marketing & Comunicación" },
  { code: "79311400", label: "Servicios de evaluación de publicidad", category: "Marketing & Comunicación" },
  { code: "79311200", label: "Encuestas de opinión pública", category: "Marketing & Comunicación" },
  // Digital & Tecnología
  { code: "72400000", label: "Servicios de internet", category: "Digital & Tecnología" },
  { code: "72500000", label: "Servicios informáticos", category: "Digital & Tecnología" },
  { code: "72322000", label: "Servicios de gestión de datos", category: "Digital & Tecnología" },
  { code: "72212224", label: "Desarrollo de software web", category: "Digital & Tecnología" },
  // Diseño & Producción
  { code: "79822500", label: "Servicios de diseño gráfico", category: "Diseño & Producción" },
  { code: "92111200", label: "Producción de vídeo publicitario", category: "Diseño & Producción" },
  { code: "92100000", label: "Servicios de cine y vídeo", category: "Diseño & Producción" },
  { code: "79930000", label: "Servicios especializados de diseño", category: "Diseño & Producción" },
  { code: "79800000", label: "Servicios de imprenta", category: "Diseño & Producción" },
  // Eventos
  { code: "79952000", label: "Servicios de eventos", category: "Eventos" },
  { code: "79950000", label: "Organización de exposiciones y congresos", category: "Eventos" },
  { code: "79953000", label: "Organización de festivales", category: "Eventos" },
  { code: "79954000", label: "Organización de fiestas", category: "Eventos" },
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
