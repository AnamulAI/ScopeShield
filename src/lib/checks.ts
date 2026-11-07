// Guards against invented numbers in generated text.
// Currency amounts: symbol/code before ($ € £ ৳ ₹ USD BDT INR Tk Rs) or word/code after (USD, dollars, taka, ...).
const MONEY = /(?:[$€£৳₹]|\b(?:USD|EUR|GBP|BDT|INR|Tk|Rs)\.?)\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:USD|EUR|GBP|BDT|INR|dollars?|euros?|pounds?|taka|Tk|৳)(?![A-Za-z])/gi;
const num = (s: string) => (s.replace(/,/g, "").match(/\d+(?:\.\d+)?/)?.[0] ?? "").replace(/^0+(?=\d)/, "").replace(/\.0+$/, "");

/** Money amounts in `generated` whose numeric value does not appear as an amount in `source` (currency symbol is not compared). */
export function inventedAmounts(generated: string, source: string): string[] {
  const inSource = new Set((source.match(MONEY) ?? []).map(num));
  return (generated.match(MONEY) ?? []).filter((m) => !inSource.has(num(m)));
}
