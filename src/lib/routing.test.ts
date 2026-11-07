import { describe, expect, it } from "vitest";
import { route } from "./routing";

describe("route", () => {
  it("in scope below 0.30", () => {
    expect(route({ outside: 0.0, paid: 0.0, withdrawn: 0 }).queue).toBe("in_scope");
    expect(route({ outside: 0.299, paid: 0.99, withdrawn: 0 }).queue).toBe("in_scope");
  });
  it("ask me for ambiguous scope, regardless of payment", () => {
    expect(route({ outside: 0.3, paid: 0.0, withdrawn: 0 }).queue).toBe("ask_me");
    expect(route({ outside: 0.699, paid: 0.9, withdrawn: 0 }).queue).toBe("ask_me");
  });
  it("agreed extra when outside and paid >= 0.75", () => {
    expect(route({ outside: 0.7, paid: 0.75, withdrawn: 0 }).queue).toBe("agreed_extra");
    expect(route({ outside: 0.99, paid: 0.95, withdrawn: 0 }).queue).toBe("agreed_extra");
  });
  it("needs change order when outside and paid <= 0.25", () => {
    expect(route({ outside: 0.7, paid: 0.25, withdrawn: 0 }).queue).toBe("needs_change_order");
    expect(route({ outside: 0.99, paid: 0.0, withdrawn: 0 }).queue).toBe("needs_change_order");
  });
  it("ask me when agreement is unclear", () => {
    expect(route({ outside: 0.9, paid: 0.26, withdrawn: 0 }).queue).toBe("ask_me");
    expect(route({ outside: 0.9, paid: 0.74, withdrawn: 0 }).queue).toBe("ask_me");
  });
  it("withdrawn wins over every other verdict, at the 0.75 boundary", () => {
    expect(route({ outside: 0.99, paid: 0.0, withdrawn: 0.75 }).queue).toBe("withdrawn");
    expect(route({ outside: 0.0, paid: 0.0, withdrawn: 0.9 }).queue).toBe("withdrawn");
    expect(route({ outside: 0.99, paid: 0.0, withdrawn: 0.74 }).queue).toBe("needs_change_order");
  });
});

import { askQuestion, effectiveQueue, showWithdrawalNote } from "./routing";
describe("ASK ME kinds, decisions and questions", () => {
  it("records why an item is ambiguous", () => {
    expect(route({ outside: 0.5, paid: 0, withdrawn: 0 }).ask).toBe("scope");
    expect(route({ outside: 0.9, paid: 0.5, withdrawn: 0 }).ask).toBe("agreement");
    expect(route({ outside: 0.9, paid: 0, withdrawn: 0 }).ask).toBeUndefined();
  });
  it("applies the user's decision only to ASK ME items", () => {
    const ask = route({ outside: 0.5, paid: 0, withdrawn: 0 });
    expect(effectiveQueue(ask)).toBe("ask_me");
    expect(effectiveQueue(ask, "skip")).toBe("ask_me");
    expect(effectiveQueue(ask, "in_scope")).toBe("in_scope");
    expect(effectiveQueue(ask, "extra")).toBe("needs_change_order");
    const wd = route({ outside: 0.9, paid: 0, withdrawn: 0.9 });
    expect(effectiveQueue(wd, "extra")).toBe("withdrawn"); // never overridden into Fill
    expect(effectiveQueue(undefined)).toBe("pending");
  });
  it("builds one concrete question per kind from a template", () => {
    expect(askQuestion("add a WhatsApp button?", "scope")).toBe("Is “add a WhatsApp button” part of what you agreed to deliver in the contract?");
    expect(askQuestion("add a blog", "agreement")).toContain("clearly agree to pay extra");
  });
});

describe("showWithdrawalNote (display only)", () => {
  it("shows for needs-change-order items with withdrawal in [0.30, 0.75)", () => {
    expect(showWithdrawalNote("needs_change_order", 0.56)).toBe(true);
    expect(showWithdrawalNote("needs_change_order", 0.3)).toBe(true);
    expect(showWithdrawalNote("needs_change_order", 0.299)).toBe(false);
    expect(showWithdrawalNote("needs_change_order", 0.75)).toBe(false);
  });
  it("never shows for other queues, and routing is unchanged by it", () => {
    for (const q of ["in_scope", "ask_me", "agreed_extra", "withdrawn", "pending"] as const) expect(showWithdrawalNote(q, 0.5)).toBe(false);
    expect(route({ outside: 0.99, paid: 0, withdrawn: 0.56 }).queue).toBe("needs_change_order");
  });
});
