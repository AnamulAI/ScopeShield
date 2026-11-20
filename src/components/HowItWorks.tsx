import { totalCredits, type Analysis } from "../lib/pipeline";
import { useI18n, type Key } from "../i18n";

type Row = readonly [endpoint: string, key: string];
const GROUPS: ReadonlyArray<{ name: string; rows: readonly Row[] }> = [
  { name: "Read", rows: [["Extract", "extract"], ["Decide", "decide"], ["Fill", "fill"]] },
  { name: "Protect", rows: [["Guard", "guard"], ["Protect (PII)", "pii"], ["Inspect", "inspect"]] },
  { name: "Prove", rows: [["Verify", "verify"], ["Rerank", "rerank"], ["Compare", "compare"]] },
];

export function HowItWorks({ analysis, recorded }: { analysis: Analysis | null; recorded: boolean }) {
  const { t } = useI18n();
  const u = analysis?.usage;
  const total = u ? totalCredits(u) : 0;
  return (
    <details id="how-it-works" className="group surface scroll-mt-20">
      <summary className="flex list-none items-center justify-between gap-3 px-5 py-4 text-sm font-semibold">
        <span className="flex flex-wrap items-baseline gap-x-3"><span className="t-h3">{t("how.title")}</span><span className="font-normal text-muted">{t("how.subtitle")}</span></span>
        <span aria-hidden className="text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-4 border-t border-line px-5 py-5 text-sm leading-6">
        <p className="text-muted">{t("how.intro")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-xs sm:text-sm">
            <thead><tr className="border-b border-line text-muted t-eyebrow"><th className="py-2 pr-3 font-semibold">{t("how.colEndpoint")}</th><th className="py-2 pr-3 font-semibold">{t("how.colDecides")}</th><th className="py-2 font-semibold">{t("how.colChanges")}</th></tr></thead>
            <tbody>
              {GROUPS.flatMap((g) => [
                <tr key={g.name} className="bg-paper-deep/60"><th colSpan={3} className="t-eyebrow px-2 py-2 text-left text-muted">{g.name}</th></tr>,
                ...g.rows.map(([ep, k]) => (
                  <tr key={ep} className="border-b border-line/60 align-top"><td className="py-3 pr-4 font-display text-base font-semibold">{ep}</td><td className="py-3 pr-4">{t(`how.${k}.decides` as Key)}</td><td className="py-3">{t(`how.${k}.changes` as Key)}</td></tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
        <p className="text-muted"><b className="text-ink">{t("how.notDecidedTitle")}</b>{t("how.notDecidedBody")}</p>
        <p>
          <b>{recorded ? t("how.creditsRecorded") : t("how.creditsUsed")}:</b>{" "}
          {u ? t("how.creditsLine", { total, ec: u.extract.calls, ecr: u.extract.credits, dc: u.decide.calls, dcr: u.decide.credits, pc: u.price?.calls ?? 0, pcr: u.price?.credits ?? 0, gc: u.guard?.calls ?? 0, gcr: u.guard?.credits ?? 0, rc: u.rerank?.calls ?? 0, rcr: u.rerank?.credits ?? 0, cc: u.compare?.calls ?? 0, ccr: u.compare?.credits ?? 0, fc: u.fill.calls, fcr: u.fill.credits, vc: u.verify?.calls ?? 0, vcr: u.verify?.credits ?? 0, xc: u.pii?.calls ?? 0, xcr: u.pii?.credits ?? 0, ic: u.script?.calls ?? 0, icr: u.script?.credits ?? 0 }) : t("how.nothingYet")}
        </p>
      </div>
    </details>
  );
}
