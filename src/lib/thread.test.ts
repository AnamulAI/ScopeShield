import { describe, expect, it } from "vitest";
import { cpLength, parseThread, sliceCp, toThreadOffsets } from "./thread";

describe("code point helpers", () => {
  it("counts emoji and multi-byte text as single code points", () => {
    expect(cpLength("a😀b")).toBe(3);
    expect("a😀b".length).toBe(4);
    expect(cpLength("বাংলা")).toBe(5);
  });
  it("slices by code point", () => {
    expect(sliceCp("a😀bc", 1, 3)).toBe("😀b");
  });
});

describe("parseThread", () => {
  const thread = "Dev: Hi 😀 there\nClient: Please add a blog 📝\nand a gallery\n\nDev: Noted\nClient: bhai ekta page বাংলা";
  const msgs = parseThread(thread, "client");

  it("splits messages, flags client case-insensitively, joins continuation lines", () => {
    expect(msgs.map((m) => m.speaker)).toEqual(["Dev", "Client", "Dev", "Client"]);
    expect(msgs.map((m) => m.isClient)).toEqual([false, true, false, true]);
    expect(msgs[1].text).toBe("Please add a blog 📝\nand a gallery");
  });
  it("offsets are code points of the original thread", () => {
    for (const m of msgs) expect(sliceCp(thread, m.start, m.end)).toBe(m.text);
  });
  it("maps message-relative offsets to thread offsets", () => {
    const m = msgs[1];
    const rel = Array.from(m.text).join("").indexOf("a gallery"); // UTF-16 index, only for ASCII-before-emoji check below
    const startCp = cpLength(m.text.slice(0, rel));
    const { start, end } = toThreadOffsets(m, startCp, startCp + 9);
    expect(sliceCp(thread, start, end)).toBe("a gallery");
  });
  it("handles CRLF without altering offsets", () => {
    const t = "Client: 😀 one\r\nDev: two\r\nClient: three";
    const ms = parseThread(t, "Client");
    expect(ms).toHaveLength(3);
    for (const m of ms) expect(sliceCp(t, m.start, m.end)).toBe(m.text);
    expect(ms[2].text).toBe("three");
  });
  it("does not treat URLs as speakers and ignores preamble", () => {
    const ms = parseThread("intro line\nClient: see\nhttps://example.com/x\nDev: ok", "Client");
    expect(ms).toHaveLength(2);
    expect(ms[0].text).toBe("see\nhttps://example.com/x");
  });
  it("returns no messages for empty input", () => {
    expect(parseThread("", "Client")).toEqual([]);
  });
});
