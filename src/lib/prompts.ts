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
          "Each separate thing the client asks the developer to build or change (new work or a change to existing work, e.g. a colour or text change), as a short phrase copied verbatim from the message. Polite questions such as 'Can you change X?' or 'Could you add Y?' ARE requests. Do NOT include: confirmations or acceptances of an earlier request (e.g. 'go ahead', 'sounds good'), cancellations or withdrawals, thanks, questions about price or timing, or anything the developer says.",
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
  "Use ONLY this thread. Never invent prices, dates, or approvals. Be polite and non-accusatory. If no price was stated for the request, say the price will be quoted separately.";

export interface FillRequest {
  body: unknown;
  /** Code-point offset of the thread inside `body.text`, so field offsets can be mapped back to the thread. */
  threadOffset: number;
}

export const STRICT_FILL_SUFFIX = " Do not write any currency amount unless that exact amount is written in the thread.";

export interface FillOptions {
  /** One Regenerate attempt after an invented-amount block. */
  strict?: boolean;
  clientName?: string;
  /** Decide's effort band for this request, e.g. "Large (a week or more)". */
  effort?: string;
  /** Decide's answer: did the client clearly agree to pay? */
  agreed?: boolean;
  /** M10: the contract clause that governs the request (Rerank). It is part of the contract, so Verify can check a message that cites it. */
  clause?: { id: string; text: string };
}

export const RISK_RUBRIC =
  "Low = trivial effort, or an agreement to pay exists. Medium = under about a day of work with no agreement. High = several days of work with no agreement. Critical = a week or more of work with no agreement. Never Low when the effort is Large and no agreement exists.";

/** Source = contract + FULL thread + final anchor line. The request text is injected into every field description. */
export function buildFillRequest(contract: string, thread: string, request: string, opts: FillOptions = {}): FillRequest {
  const prefix = `AGREED CONTRACT / SCOPE:\n${contract}\n\nTHREAD:\n`;
  const r = `"${request}"`;
  const client = opts.clientName?.trim() || "the client";
  const decide =
    opts.effort !== undefined || opts.agreed !== undefined
      ? ` Effort estimate from Decide: ${opts.effort ?? "unknown"}. Agreement to pay found: ${opts.agreed === undefined ? "unknown" : opts.agreed ? "yes" : "no"}.`
      : "";
  return {
    threadOffset: cpLength(prefix),
    body: {
      text: `${prefix}${thread}\n\nREQUEST TO FILL: ${request}`,
      instructions: FILL_INSTRUCTIONS + decide + (opts.clause ? ` Governing contract clause (${opts.clause.id}): "${opts.clause.text}". If this clause excludes or limits the requested work, say so briefly in the message, in your own words.` : "") + (opts.strict ? STRICT_FILL_SUFFIX : ""),
      fields: {
        category: { type: "choice", options: ["new_feature", "revision", "bug_fix", "other"] },
        unpaid_risk: {
          type: "score",
          levels: ["Low", "Medium", "High", "Critical"],
          description: `Risk that the freelancer does the work for ${r} without being paid. ${RISK_RUBRIC}`,
        },
        price_mentioned: {
          type: "extract",
          infer: false,
          description: `A specific monetary amount (a number with a currency) stated in the thread for ${r}. Statements such as 'free', 'no extra cost' or 'how much?' are NOT a price. Null if no amount was stated for it.`,
        },
        change_order_message: {
          type: "generate",
          format: "text",
          max_tokens: 120,
          description: `Plain text, at most 70 words, first person as the freelancer, polite and non-accusatory, about ${r} only. (a) Say clearly that this request is outside the current agreement. (b) Say the price will be quoted separately; state a price ONLY if one appears in the thread for this request. (c) Ask the client to confirm before any work starts. Never promise delivery dates, never invent prices, and never say or imply that you will simply do the work for free.`,
        },
        next_step: {
          type: "generate",
          format: "text",
          max_tokens: 60,
          description: `Exactly one imperative sentence addressed to the freelancer (use "you" or no subject), specific to ${r}, in the form: 'Send ${client} a quote for "${r.slice(1, -1)}" and wait for a written yes before starting.' No third person, and no vague phrases such as "the price will be confirmed".`,
        },
      },
    },
  };
}

/** Extract over the FULL thread for the price the developer quoted for ONE request (shown on AGREED EXTRA cards). */
export function buildPriceRequest(thread: string, request: string) {
  return {
    text: thread,
    fields: { agreed_price: { description: `The price the developer quoted for THIS request: ${request}. Only a specific amount with a currency. Null if no price was quoted for it.` } },
  };
}

/** Extract over the FULL thread to find the sentence that supports a verdict. Offsets are thread offsets directly. */
export function buildSupportRequest(thread: string, request: string, kind: "agreement" | "withdrawal") {
  const description =
    kind === "agreement"
      ? `The client's own sentence where they agree to pay extra for, or say to go ahead with, "${request}". Null if the client never did.`
      : `The client's own sentence where they cancel, withdraw or drop "${request}". Null if the client never did.`;
  return { text: thread, fields: { support: { description } } };
}

export const VERIFY_INSTRUCTIONS =
  "Evaluate only the supplied documents: the agreed contract and the client thread. Missing evidence is not proof that a statement is false. Offers, requests and promises made by the freelancer (for example, that a price will be quoted separately) are not factual claims about the documents.";

/** Verify the generated message claim by claim against two named sources: the contract and the thread. */
export function buildVerifyRequest(contract: string, thread: string, message: string) {
  return {
    documents: [
      { id: "contract", text: contract },
      { id: "thread", text: thread },
    ],
    answer: message,
    evidence: "all",
    instructions: VERIFY_INSTRUCTIONS,
  };
}
