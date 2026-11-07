import { describe, expect, it } from "vitest";
import { describeError, worstKind } from "./errors";
import { effortBand, formatHours, formatMoney, scopeHealth } from "./health";
import type { RequestItem } from "./pipeline";
import { route } from "./routing";

const item = (id: string, outside: number, paid: number, withdrawn: number, effort: number, decision?: RequestItem["decision"]): RequestItem => ({
  id, messageIndex: 0, text: id, evidence: null, status: "done", verdict: { outside, paid, withdrawn, kind: "x", effort }, route: route({ outside, paid, withdrawn }), decision,
});

describe("effortBand", () => {
  it("maps score thresholds to the agreed bands", () => {
    expect(effortBand(0.49)).toMatchObject({ min: 0, max: 1 });
    expect(effortBand(0.5)).toMatchObject({ min: 2, max: 6 });
    expect(effortBand(1.49)).toMatchObject({ min: 2, max: 6 });
    expect(effortBand(1.5)).toMatchObject({ min: 16, max: 24 });
    expect(effortBand(2.49)).toMatchObject({ min: 16, max: 24 });
    expect(effortBand(2.5)).toMatchObject({ min: 40, max: null });
  });
});

describe("scopeHealth", () => {
  const items = [
    item("a", 0.99, 0, 0, 1.0), // needs change order, 2-6
    item("b", 0.99, 0, 0, 2.0), // needs change order, 16-24
    item("c", 0.5, 0, 0, 0.2), // ask me, 0-1
    item("d", 0.99, 0, 0.95, 3.0), // withdrawn: never counts for effort
    item("e", 0.01, 0, 0, 0.1), // in scope
    item("f", 0.99, 0.98, 0, 3.0), // agreed extra: not unpaid
  ];
  it("counts queues and never counts WITHDRAWN effort", () => {
    const h = scopeHealth(items);
    expect(h.counts).toEqual({ needs_change_order: 2, ask_me: 1, in_scope: 1, agreed_extra: 1, withdrawn: 1 });
    expect(h.confirmedUnpaid).toEqual({ min: 18, max: 30, items: 2 });
    expect(h.possibleUnpaid).toEqual({ min: 0, max: 1, items: 1 });
  });
  it("moves ASK ME items by the user's decision", () => {
    const asExtra = scopeHealth([...items.slice(0, 2), item("c", 0.5, 0, 0, 0.2, "extra")]);
    expect(asExtra.confirmedUnpaid.items).toBe(3);
    expect(asExtra.possibleUnpaid.items).toBe(0);
    expect(scopeHealth([item("c", 0.5, 0, 0, 0.2, "in_scope")]).counts.in_scope).toBe(1);
    expect(scopeHealth([item("c", 0.5, 0, 0, 0.2, "skip")]).possibleUnpaid.items).toBe(1);
  });
  it("leaves unfinished or failed items uncounted", () => {
    const pending: RequestItem = { id: "p", messageIndex: 0, text: "p", evidence: null, status: "running" };
    expect(scopeHealth([pending]).uncounted).toBe(1);
  });
  it("open-ended bands give a minimum only; money appears only with a rate", () => {
    const h = scopeHealth([item("x", 0.99, 0, 0, 3), item("y", 0.99, 0, 0, 1)]).confirmedUnpaid;
    expect(formatHours(h)).toBe("at least 42 h");
    expect(formatMoney(h, null)).toBeNull();
    expect(formatMoney(h, 0)).toBeNull();
    expect(formatMoney(h, 50)).toBe("at least 2,100");
    expect(formatMoney({ min: 2, max: 6, items: 1 }, 50)).toBe("100–300");
    expect(formatHours({ min: 0, max: 0, items: 0 })).toBe("none");
  });
});

describe("describeError", () => {
  it("gives a credits message with the demo hint and flags it", () => {
    const d = describeError("credits");
    expect(d.demo).toBe(true);
    expect(d.hint).toContain("demo");
  });
  it("explains the daily live-mode limit and offers Demo mode", () => {
    const d = describeError("limit");
    expect(d.title).toContain("Live mode limit reached today");
    expect(d.demo).toBe(true);
  });
  it("tells the user what to change for input errors", () => {
    expect(describeError("bad_request", "text too long").hint).toContain("Shorten");
  });
  it("covers every class and picks the worst", () => {
    for (const k of ["limit", "credits", "auth", "bad_request", "rate_limit", "conflict", "timeout", "server", "network", undefined] as const) expect(describeError(k).title.length).toBeGreaterThan(5);
    expect(worstKind(["server", "credits", undefined])).toBe("credits");
    expect(worstKind([undefined])).toBeUndefined();
  });
});
