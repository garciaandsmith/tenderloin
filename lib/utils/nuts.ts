/** Spanish NUTS codes (Nomenclatura de Unidades Territoriales Estadísticas).
 *  Used for the region hard filter.
 */
export const SPAIN_NUTS_CODES: Array<{ code: string; label: string }> = [
  // National
  { code: "ES", label: "España (todo el territorio)" },
  // NUTS-1 regions
  { code: "ES1", label: "Noroeste" },
  { code: "ES2", label: "Noreste" },
  { code: "ES3", label: "Comunidad de Madrid" },
  { code: "ES4", label: "Centro" },
  { code: "ES5", label: "Este" },
  { code: "ES6", label: "Sur" },
  { code: "ES7", label: "Canarias" },
  // NUTS-2 (autonomous communities) — most commonly used for filtering
  { code: "ES11", label: "Galicia" },
  { code: "ES12", label: "Principado de Asturias" },
  { code: "ES13", label: "Cantabria" },
  { code: "ES21", label: "País Vasco" },
  { code: "ES22", label: "Comunidad Foral de Navarra" },
  { code: "ES23", label: "La Rioja" },
  { code: "ES24", label: "Aragón" },
  { code: "ES30", label: "Comunidad de Madrid" },
  { code: "ES41", label: "Castilla y León" },
  { code: "ES42", label: "Castilla-La Mancha" },
  { code: "ES43", label: "Extremadura" },
  { code: "ES51", label: "Cataluña" },
  { code: "ES52", label: "Comunitat Valenciana" },
  { code: "ES53", label: "Illes Balears" },
  { code: "ES61", label: "Andalucía" },
  { code: "ES62", label: "Región de Murcia" },
  { code: "ES63", label: "Ciudad de Ceuta" },
  { code: "ES64", label: "Ciudad de Melilla" },
  { code: "ES70", label: "Canarias" },
  // NUTS-3 (Madrid province — highest priority for García & Smith)
  { code: "ES300", label: "Madrid (provincia)" },
];

/** Return the human-readable label for a NUTS code. */
export function nutsLabel(code: string): string {
  const entry = SPAIN_NUTS_CODES.find((n) => n.code === code);
  return entry ? entry.label : code;
}
