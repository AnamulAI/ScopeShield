import type { Analysis } from "../lib/pipeline";

const ROWS = [
  ["Extract", "Which sentences in each client message are separate requests (and where they sit in the thread). Also finds the agreement or withdrawal sentence, and the quoted price for Agreed extra items.", "Builds the request list, highlights the client’s exact sentence in the thread, and shows “No actionable request” when nothing is found."],
  ["Decide", "For each request, the probability that it is outside the contract, that the client agreed to pay, and that they later withdrew it. Also a kind tag and an effort score.", "This app applies its own thresholds to route each request to a queue, draws the probability bars, and feeds the rough effort estimate. Uncertain results go to Ask me."],
  ["Fill", "For a request that needs a change order: category, unpaid risk, the price quoted (if any), a drafted client message and a next step.", "Creates the change-order card (collapsed until you open it). Generated text is labelled as an AI-generated draft, and Copy is blocked if it contains an amount that is not in the thread."],
] as const;

export function HowItWorks({ analysis, recorded }: { analysis: Analysis | null; recorded: boolean }) {
  const u = analysis?.usage;
  const total = u ? u.extract.credits + u.decide.credits + u.fill.credits + (u.price?.credits ?? 0) : 0;
  return (
    <details className="group rounded-xl border border-line bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
        <span>How it works <span className="font-normal text-muted">· three Clocked endpoints, 30 seconds</span></span>
        <span aria-hidden className="text-muted transition group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-4 border-t border-line px-4 py-4 text-sm">
        <p className="text-muted">You paste the contract and a thread, and say who the client is. The app calls Clocked in small steps from your browser, three at a time, and keeps partial results if a step fails.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-xs sm:text-sm">
            <thead><tr className="border-b border-line text-muted"><th className="py-2 pr-3 font-medium">Clocked endpoint</th><th className="py-2 pr-3 font-medium">What it decides</th><th className="py-2 font-medium">What changes in the app</th></tr></thead>
            <tbody>
              {ROWS.map(([ep, decides, changes]) => (
                <tr key={ep} className="border-b border-line/60 align-top"><td className="py-2 pr-3 font-semibold">{ep}</td><td className="py-2 pr-3">{decides}</td><td className="py-2">{changes}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted"><b className="text-ink">Not decided by Clocked:</b> the queue thresholds (30% / 70% scope, 25% / 75% payment, 75% withdrawn), the hour bands and the Copy block are rules in this app. Your answers to Ask me questions are yours.</p>
        <p>
          <b>{recorded ? "Credits used to record this analysis" : "Credits used by this analysis"}:</b>{" "}
          {u ? <>{total} (Extract {u.extract.calls} calls / {u.extract.credits} credits, Decide {u.decide.calls} / {u.decide.credits}, Agreed prices {u.price?.calls ?? 0} / {u.price?.credits ?? 0}, Fill {u.fill.calls} / {u.fill.credits})</> : "nothing analysed yet"}
        </p>
      </div>
    </details>
  );
}
