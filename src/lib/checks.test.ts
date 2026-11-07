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
