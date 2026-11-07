// Request builders for Clocked. Shared instructions are the exact text that passed our manual tests.
import { cpLength } from "./thread";

export const DECIDE_INSTRUCTIONS =
  "You compare client requests with the agreed contract. A request for a price, 'let me think', 'sounds interesting' or 'send me the quote' is NOT agreement to pay. Agreement counts only if the client clearly accepts a stated price or says to proceed, and it has not been withdrawn later. Count only what is explicitly stated.";

export function buildExtractRequest(messageText: string) {
  return {
    text: messageText,
    fields: {
      client_requests: {
        description:
          "Each separate NEW thing the client asks the developer to build or change, as a short noun phrase. Do NOT include: confirmations or acceptances of an earlier request (e.g. 'go ahead', 'sounds good'), cancellations or withdrawals, thanks, questions about price or timing, or anything the developer says.",
        list: true,
        max_items: 8,
      },
    },
  };
}

export function buildDecideRequest(contract: string, thread: string, request: string) {
  return {
    state: `AGREED CONTRACT / SCOPE:\n${contract}\n\nTHREAD:\n${thread}\n\nLATEST REQUEST TO EVALUATE: ${request}`,
    instructions: DECIDE_INSTRUCTIONS,
    questions: {
      outside_contract: {
        type: "noul",
        instructions: "Is the LATEST REQUEST TO EVALUATE outside the work described in the agreed contract?",
        threshold: 0.7,
      },
      paid_agreement: {
        type: "noul",
        instructions:
          "Did the client clearly agree to pay extra for the LATEST REQUEST TO EVALUATE (accepting a stated price or saying to proceed), without withdrawing it later?",
        threshold: 0.75,
      },
      withdrawn: {
        type: "noul",
        instructions: "Did the client later withdraw, cancel or drop this specific request?",
        threshold: 0.75,
      },
      kind: {
        type: "choice",
        instructions: "What kind of request is the LATEST REQUEST TO EVALUATE?",
        criteria: {
          revision: "A change to work already delivered or described in the contract",
          bug_fix: "Fixing something that is broken",
          new_feature: "New functionality or content not described in the contract",
          unclear: "Cannot tell",
        },
      },
      effort: {
        type: "score",
        instructions: "Rough effort needed to do the LATEST REQUEST TO EVALUATE.",
        criteria: ["Trivial: minutes", "Small: under one day", "Medium: a few days", "Large: a week or more"],
      },
    },
  };
}

export const FILL_INSTRUCTIONS =
  "Use ONLY this thread. Never invent prices, dates, or approvals. Be polite and non-accusatory. If no price was stated for the request, say the price will be confirmed.";

export interface FillRequest {
  body: unknown;
  /** Code-point offset of the thread inside `body.text`, so field offsets can be mapped back to the thread. */
  threadOffset: number;
}

/** Source = contract + FULL thread + final anchor line. The request text is injected into every field description. */
export function buildFillRequest(contract: string, thread: string, request: string): FillRequest {
  const prefix = `AGREED CONTRACT / SCOPE:\n${contract}\n\nTHREAD:\n`;
  const r = `"${request}"`;
  return {
    threadOffset: cpLength(prefix),
    body: {
      text: `${prefix}${thread}\n\nREQUEST TO FILL: ${request}`,
      instructions: FILL_INSTRUCTIONS,
      fields: {
        category: { type: "choice", options: ["new_feature", "revision", "bug_fix", "other"] },
        unpaid_risk: {
          type: "score",
          levels: ["Low", "Medium", "High", "Critical"],
          description: `Risk that the developer does the work for ${r} without being paid, given what the client has and has not agreed to.`,
        },
        price_mentioned: {
          type: "extract",
          infer: false,
          description: `A price explicitly stated in the thread for ${r}. Null if no price was stated for it.`,
        },
        change_order_message: {
          type: "generate",
          format: "text",
          max_tokens: 200,
          description: `A short, polite message to the client proposing a change order for ${r} and mentioning that request specifically. If no price was stated, say the price will be confirmed. Do not mention any other request.`,
        },
        next_step: {
          type: "generate",
          format: "text",
          max_tokens: 60,
          description: `One short sentence: the next step for the freelancer regarding ${r}.`,
        },
      },
    },
  };
}
