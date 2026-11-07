import { describe, expect, it } from "vitest";
import { checkInputs } from "./limits";

describe("checkInputs", () => {
  const thread = "Dev: hi\nMaya: add a blog";
  it("passes valid input", () => {
    const r = checkInputs("scope", thread, "maya");
    expect(r.ok).toBe(true);
    expect(r.clientMessages).toBe(1);
  });
  it("explains a wrong client name using the real speakers", () => {
    const r = checkInputs("scope", thread, "Bob");
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toContain("Dev, Maya");
  });
  it("flags empty fields and caps", () => {
    expect(checkInputs("", "", "").problems).toHaveLength(2);
    expect(checkInputs("x".repeat(6001), thread, "Maya").ok).toBe(false);
    expect(checkInputs("s", Array.from({ length: 31 }, () => "Maya: hi").join("\n"), "Maya").problems[0]).toContain("31");
  });
});
