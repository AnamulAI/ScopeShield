// Interface language: English (default) and Bengali. UI localization only: routing, API calls and recorded data are untouched.
import { bn } from "./bn";
import { en } from "./en";

export type Lang = "en" | "bn";
export type Key = keyof typeof en;
export type Vars = Record<string, string | number>;
export type TFn = (key: Key, vars?: Vars) => string;
/** Pick `${key}.one` or `${key}.other` by count (Bengali uses the same text for both). */
export type TpFn = (key: string, n: number, vars?: Vars) => string;

export const LANGS: readonly Lang[] = ["en", "bn"];
export const DICTS: Record<Lang, Record<Key, string>> = { en, bn };

export const isLang = (x: unknown): x is Lang => x === "en" || x === "bn";

/** Replace {name} placeholders. Unknown placeholders are left as they are. */
export function format(template: string, vars?: Vars): string {
  return vars ? template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : template;
}

export function translate(lang: Lang, key: Key, vars?: Vars): string {
  return format(DICTS[lang][key] || en[key], vars);
}

export const translatePlural = (lang: Lang, key: string, n: number, vars?: Vars): string =>
  translate(lang, `${key}.${n === 1 ? "one" : "other"}` as Key, { n, ...vars });

/** English translator for code outside React (tests, the lib's English messages). */
export const tEn: TFn = (key, vars) => translate("en", key, vars);
