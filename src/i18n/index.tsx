import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isLang, translate, translatePlural, type Key, type Lang, type TFn, type TpFn, type Vars } from "./core";

export { type Key, type Lang, type TFn, type Vars } from "./core";

const STORAGE_KEY = "scopeshield-lang";

/** Storage may be blocked or full (private mode, site data cleared): the app must work without it. */
export const readStoredLang = (): Lang | null => {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
};
const writeStoredLang = (lang: Lang) => {
  try { window.localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
};
/** Optional deep link for previews and screenshots: #lang=bn (not stored until the user picks a language). */
const hashLang = (): Lang | null => {
  try { const v = new URLSearchParams(window.location.hash.slice(1)).get("lang"); return isLang(v) ? v : null; } catch { return null; }
};

/** Like t(), but placeholders can be filled with React nodes (a link, a bold span), wherever the language puts them. */
export type TxFn = (key: Key, nodes: Record<string, ReactNode>) => ReactNode;
interface I18n { lang: Lang; setLang: (l: Lang) => void; t: TFn; tp: TpFn; tx: TxFn }
const withNodes = (lang: Lang, key: Key, nodes: Record<string, ReactNode>): ReactNode =>
  translate(lang, key).split(/(\{\w+\})/).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    return m && m[1] in nodes ? <Fragment key={i}>{nodes[m[1]]}</Fragment> : part;
  });
const Ctx = createContext<I18n>({ lang: "en", setLang: () => undefined, t: (k, v) => translate("en", k, v), tp: (k, n, v) => translatePlural("en", k, n, v), tx: (k, n) => withNodes("en", k, n) });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => hashLang() ?? readStoredLang() ?? "en");
  useEffect(() => { document.documentElement.lang = lang; document.title = translate(lang, "meta.title"); }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    writeStoredLang(l);
    // The user's explicit choice wins over a #lang=… deep link, also after a reload.
    try {
      const params = new URLSearchParams(window.location.hash.slice(1));
      if (params.has("lang")) { params.delete("lang"); const h = params.toString(); window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${h ? `#${h}` : ""}`); }
    } catch { /* ignore */ }
  }, []);
  const value = useMemo<I18n>(() => ({
    lang, setLang,
    t: (key: Key, vars?: Vars) => translate(lang, key, vars),
    tp: (key: string, n: number, vars?: Vars) => translatePlural(lang, key, n, vars),
    tx: (key: Key, nodes: Record<string, ReactNode>) => withNodes(lang, key, nodes),
  }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
