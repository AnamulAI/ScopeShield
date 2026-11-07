import { describe, expect, it } from "vitest";
import { originAllowed } from "./[endpoint]";

describe("originAllowed", () => {
  it("allows same-origin and missing Origin", () => {
    expect(originAllowed("https://app.example.com", "https://app.example.com/api/clocked/decide")).toBe(true);
    expect(originAllowed(null, "https://app.example.com/api/clocked/decide")).toBe(true);
  });
  it("rejects cross-origin and malformed", () => {
    expect(originAllowed("https://evil.example", "https://app.example.com/api/clocked/decide")).toBe(false);
    expect(originAllowed("not a url", "https://app.example.com/x")).toBe(false);
  });
});
