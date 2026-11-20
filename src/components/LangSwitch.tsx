import { useI18n, type Lang } from "../i18n";

/** EN | বাংলা. The choice is saved in localStorage (inside try/catch, see i18n/index.tsx). */
export function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  const opt = (l: Lang) => (
    <button type="button" lang={l} aria-pressed={lang === l} aria-label={t(l === "en" ? "lang.switchTo.en" : "lang.switchTo.bn")} onClick={() => setLang(l)}
      className={`press rounded-md px-2 py-1 text-xs font-semibold ${lang === l ? "bg-navy text-paper" : "text-navy hover:bg-paper-deep"}`}>{t(l === "en" ? "lang.en" : "lang.bn")}</button>
  );
  return (
    <div role="group" aria-label={t("lang.label")} className="ml-1 flex items-center gap-0.5 rounded-lg border border-line bg-card p-0.5 sm:ml-2">
      {opt("en")}{opt("bn")}
    </div>
  );
}
