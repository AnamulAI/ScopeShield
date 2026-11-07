// Guards against invented numbers in generated text.
const MONEY = /(?:[$€£]|USD\s?)\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:USD|dollars?)\b/gi;
const norm = (s: string) => s.replace(/[\s,]/g, "").toLowerCase();
const digitsOf = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? [])[0]?.replace(/^0+(?=\d)/, "") ?? "";

/** Money amounts in `generated` that do not appear in `source` (compared by numeric value). */
export function inventedAmounts(generated: string, source: string): string[] {
  const inSource = new Set((source.match(MONEY) ?? []).map((m) => digitsOf(norm(m))));
  return (generated.match(MONEY) ?? []).filter((m) => !inSource.has(digitsOf(norm(m))));
}
