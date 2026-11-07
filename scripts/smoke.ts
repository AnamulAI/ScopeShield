// Prints the RAW response (status, X-Clocked-* headers, body) of decide, extract and fill via our proxy.
// Usage: terminal 1: `npm run pages:dev`   terminal 2: `npm run smoke`
// Override target with SMOKE_BASE_URL. The API key stays server-side in .dev.vars; this script never sees it.
import { randomUUID } from "node:crypto";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:8788";

const contract = "Agreed scope: 5-page bakery website for $800. Excluded: online ordering, payment integration, blog, hosting management.";
const thread = "Client: Please change the banner colour to dark green.\nClient: Hmm, let me think about adding online ordering.";

const calls: Array<{ endpoint: string; body: unknown }> = [
  {
    endpoint: "decide",
    body: {
      state: `${contract}\n\nTHREAD:\n${thread}\n\nLATEST REQUEST TO EVALUATE: add online ordering`,
      instructions:
        "You compare client requests with the agreed contract. A request for a price, 'let me think', 'sounds interesting' or 'send me the quote' is NOT agreement to pay. Agreement counts only if the client clearly accepts a stated price or says to proceed, and it has not been withdrawn later. Count only what is explicitly stated.",
      questions: {
        outside_contract: { type: "noul", instructions: "Is the request outside the agreed contract?", threshold: 0.7 },
        paid_agreement: { type: "noul", instructions: "Did the client clearly agree to pay extra for it?", threshold: 0.75 },
        kind: {
          type: "choice",
          instructions: "What kind of request is it?",
          criteria: { revision: "Change to delivered work", bug_fix: "Fix of something broken", new_feature: "New functionality", unclear: "Cannot tell" },
        },
        effort: { type: "score", instructions: "Rough effort to do it.", criteria: ["Trivial: minutes", "Small: under one day", "Medium: a few days", "Large: a week or more"] },
      },
    },
  },
  {
    endpoint: "extract",
    body: {
      text: "Client: Please change the banner colour to dark green and also add a blog section.",
      fields: { client_requests: { description: "Each distinct thing the client asks for, quoted verbatim", list: true, max_items: 8 }, price_mentioned: "Any price explicitly stated; null if none" },
    },
  },
  {
    endpoint: "fill",
    body: {
      text: `${contract}\n\nTHREAD:\n${thread}`,
      instructions: "Use ONLY this thread. Never invent prices, dates, or approvals. Polite and non-accusatory.",
      fields: {
        request: { type: "extract", description: "The out-of-scope request", infer: false },
        category: { type: "choice", options: ["new_feature", "revision", "bug_fix", "other"] },
        unpaid_risk: { type: "score", levels: ["Low", "Medium", "High", "Critical"] },
        price_mentioned: { type: "extract", description: "Any price stated in the thread", infer: false },
        change_order_message: { type: "generate", description: "Short polite message proposing a change order; say the price will be confirmed if none was stated", format: "text", max_tokens: 200 },
      },
    },
  },
];

let failed = false;
for (const { endpoint, body } of calls) {
  console.log(`\n===== ${endpoint.toUpperCase()} =====`);
  try {
    const res = await fetch(`${BASE}/api/clocked/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": randomUUID() },
      body: JSON.stringify(body),
    });
    console.log(`HTTP ${res.status}`);
    for (const h of ["x-clocked-credits", "x-clocked-cost-usd", "x-clocked-model-ms"]) console.log(`${h}: ${res.headers.get(h) ?? "(absent)"}`);
    const text = await res.text();
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log(text);
    }
    if (!res.ok) failed = true;
  } catch (e) {
    failed = true;
    console.log(`Request failed: ${(e as Error).message} (is \`npm run pages:dev\` running?)`);
  }
}
console.log(failed ? "\nSMOKE: FAILED" : "\nSMOKE: OK");
process.exit(failed ? 1 : 0);
