import { describe, expect, it } from "vitest";
import { route } from "./routing";

describe("route", () => {
  it("in scope below 0.30", () => {
    expect(route(0.0, 0.0).queue).toBe("in_scope");
    expect(route(0.299, 0.99).queue).toBe("in_scope");
  });
  it("ask me for ambiguous scope, regardless of payment", () => {
    expect(route(0.3, 0.0).queue).toBe("ask_me");
    expect(route(0.699, 0.9).queue).toBe("ask_me");
  });
  it("agreed extra when outside and paid >= 0.75", () => {
    expect(route(0.7, 0.75).queue).toBe("agreed_extra");
    expect(route(0.99, 0.95).queue).toBe("agreed_extra");
  });
  it("needs change order when outside and paid <= 0.25", () => {
    expect(route(0.7, 0.25).queue).toBe("needs_change_order");
    expect(route(0.99, 0.0).queue).toBe("needs_change_order");
  });
  it("ask me when agreement is unclear", () => {
    expect(route(0.9, 0.26).queue).toBe("ask_me");
    expect(route(0.9, 0.74).queue).toBe("ask_me");
  });
});
