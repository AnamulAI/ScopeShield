import { describe, expect, it } from "vitest";
import { AVATAR_COLORS, avatarColor, initials, participants, placeMessages } from "./chat";

const msgs = [
  { speaker: "Rafi", isClient: false },
  { speaker: "Nila", isClient: true },
  { speaker: "nila", isClient: true },
  { speaker: "Nila", isClient: true },
  { speaker: "Rafi", isClient: false },
];

describe("chat helpers", () => {
  it("derives participants from the thread, in order, case-insensitively", () => {
    expect(participants(msgs)).toEqual([{ name: "Rafi", isClient: false }, { name: "Nila", isClient: true }]);
    expect(participants([])).toEqual([]);
  });
  it("makes initials from real names only", () => {
    expect(initials("Nila")).toBe("N");
    expect(initials("Mohammad Anamul Hoque")).toBe("MH");
    expect(initials("  ")).toBe("?");
    expect(initials("😀 Bob")).toBe("😀B");
  });
  it("gives each participant their own colour, stable and AA-safe", () => {
    const people = participants(msgs);
    expect(avatarColor(people, "Rafi")).toBe(AVATAR_COLORS[0]);
    expect(avatarColor(people, "NILA")).toBe(AVATAR_COLORS[1]);
    expect(avatarColor(people, "Rafi")).not.toBe(avatarColor(people, "Nila"));
  });
  it("puts the client on the left, others on the right, and groups consecutive speakers", () => {
    const p = placeMessages(msgs);
    expect(p.map((x) => x.side)).toEqual(["right", "left", "left", "left", "right"]);
    expect(p.map((x) => x.firstInGroup)).toEqual([true, true, false, false, true]);
    expect(p.map((x) => x.lastInGroup)).toEqual([true, false, false, true, true]);
  });
  it("handles an empty thread", () => {
    expect(placeMessages([])).toEqual([]);
  });
});
