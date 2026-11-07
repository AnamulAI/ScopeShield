import { describe, expect, it } from "vitest";
import { inventedAmounts } from "./checks";

describe("inventedAmounts", () => {
  const source = "The Bengali version would be $150, proceed? Base price $800.";
  it("accepts amounts that appear in the source", () => {
    expect(inventedAmounts("We can do it for $150.", source)).toEqual([]);
    expect(inventedAmounts("Total $1,150", "Total $1150")).toEqual([]);
  });
  it("flags amounts that do not", () => {
    expect(inventedAmounts("That will be $200 extra", source)).toEqual(["$200"]);
    expect(inventedAmounts("about 300 USD", source)).toEqual(["300 USD"]);
  });
  it("ignores text with no money", () => {
    expect(inventedAmounts("Price will be confirmed.", source)).toEqual([]);
  });
});

describe("inventedAmounts: other currencies and edge cases", () => {
  it("covers other currency forms", () => {
    expect(inventedAmounts("It costs ৳5,000", "No prices here")).toEqual(["৳5,000"]);
    expect(inventedAmounts("It costs €120.50", "price was 120.50 EUR")).toEqual([]);
    expect(inventedAmounts("Tk 300 only", "We said $150")).toEqual(["Tk 300"]);
    expect(inventedAmounts("two hundred dollars", "x")).toEqual([]); // spelled-out numbers are not detected (documented limit)
  });
  it("does not flag plain numbers that are not money", () => {
    expect(inventedAmounts("We will deliver 5 pages in 3 days", "x")).toEqual([]);
  });
});
