import { describe, expect, it } from "vitest";
import { announcement, isExpanded, replayBudget, replayDelay, TYPING_MS, visibleQueues } from "./replay";
import type { Queue } from "./routing";

const ORDER: Queue[] = ["needs_change_order", "ask_me", "agreed_extra", "in_scope", "withdrawn"];
const client = { isClient: true, speaker: "Nila", text: "can you add online ordering?" };
const dev = { isClient: false, speaker: "Rafi", text: "That is outside the package." };

describe("replay timing", () => {
  it("is slower for client messages, capped, and never zero", () => {
    expect(replayDelay(client)).toBeGreaterThan(replayDelay({ ...dev, text: client.text }));
    expect(replayDelay({ ...client, text: "x".repeat(500) })).toBe(800);
    expect(replayDelay({ ...dev, text: "x".repeat(500) })).toBe(500);
    expect(TYPING_MS).toBe(400);
    expect(replayDelay({ ...dev, text: "" })).toBeGreaterThan(0);
  });
  it("has a watchdog budget longer than the sum of the delays and typing pauses", () => {
    const msgs = [client, dev, client];
    expect(replayBudget(msgs)).toBe(msgs.reduce((t, m) => t + replayDelay(m) + TYPING_MS, 0) + 3000);
  });
});

describe("announcement (aria-live)", () => {
  it("stays quiet for developer messages and reads client messages with their verdicts", () => {
    expect(announcement(dev, [])).toBe("");
    expect(announcement(client, ["Needs change order"])).toBe("Nila, client: can you add online ordering?. Needs change order.");
    expect(announcement({ ...client, text: "hi\n  there" }, [])).toBe("Nila, client: hi there.");
  });
});

describe("filters and collapsed groups", () => {
  it("lists every queue for All and exactly one for a filter", () => {
    expect(visibleQueues("all", ORDER)).toEqual(ORDER);
    expect(visibleQueues("ask_me", ORDER)).toEqual(["ask_me"]);
  });
  it("collapses In scope and Withdrawn by default, and nothing else", () => {
    const none = new Set<Queue>();
    expect(ORDER.map((q) => isExpanded(q, "all", none))).toEqual([true, true, true, false, false]);
  });
  it("expands a collapsed queue when asked, or when it is the filter", () => {
    expect(isExpanded("in_scope", "all", new Set<Queue>(["in_scope"]))).toBe(true);
    expect(isExpanded("withdrawn", "withdrawn", new Set<Queue>())).toBe(true);
    expect(isExpanded("withdrawn", "in_scope", new Set<Queue>())).toBe(false);
  });
});
