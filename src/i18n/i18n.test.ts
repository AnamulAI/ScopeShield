import { afterEach, describe, expect, it } from "vitest";
import { describeError } from "../lib/errors";
import { checkInputs } from "../lib/limits";
import { effortLabel } from "../lib/health";
import { askQuestion, route, type Probabilities } from "../lib/routing";
import { bn } from "./bn";
import { DICTS, format, isLang, tEn, translate, translatePlural, type Key } from "./core";
import { en } from "./en";
import { readStoredLang } from "./index";
import { askQuestionText, effortText, reasonText } from "./labels";

const keys = Object.keys(en) as Key[];
const vars = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

describe("translation tables", () => {
  it("bn has exactly the keys of en", () => {
    expect(Object.keys(bn).sort()).toEqual([...keys].sort());
  });
  it("no key is empty in either language", () => {
    for (const lang of ["en", "bn"] as const) for (const k of keys) expect(DICTS[lang][k].trim().length, `${lang}:${k}`).toBeGreaterThan(0);
  });
  it("each Bengali string keeps the same {placeholders} as the English one", () => {
    for (const k of keys) expect(vars(bn[k]), k).toEqual(vars(en[k]));
  });
  it("plural keys come in .one / .other pairs", () => {
    for (const k of keys.filter((x) => x.endsWith(".one"))) expect(keys, k).toContain(k.replace(/\.one$/, ".other"));
    for (const k of keys.filter((x) => x.endsWith(".other"))) expect(keys, k).toContain(k.replace(/\.other$/, ".one"));
  });
  it("digits and percentages stay Latin in Bengali text", () => {
    for (const k of keys) expect(/[০-৯]/.test(bn[k]), k).toBe(false);
  });
  it("every key used in the source as t(\"…\"), tp(\"…\") or tx(\"…\") exists", () => {
    const files = import.meta.glob(["../**/*.ts", "../**/*.tsx", "!../**/*.test.ts", "!../i18n/en.ts", "!../i18n/bn.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(10);
    const missing: string[] = [];
    for (const [file, src] of Object.entries(files)) {
      for (const m of src.matchAll(/\b(t|tp|tx)\(\s*"([a-zA-Z0-9_.-]+)"/g)) {
        const k = m[2];
        const ok = m[1] === "tp" ? keys.includes(`${k}.one` as Key) && keys.includes(`${k}.other` as Key) : keys.includes(k as Key);
        if (!ok) missing.push(`${file}: ${m[1]}("${k}")`);
      }
    }
    expect(missing).toEqual([]);
  });
  it("Bengali is natural Bengali mixed with English: the queue names follow the agreed glossary", () => {
    expect(bn["queue.needs_change_order.label"]).toBe("Change order দরকার");
    expect(bn["queue.ask_me.heading"]).toBe("Ask me (আপনি ঠিক করুন)");
    expect(bn["queue.agreed_extra.heading"]).toBe("Agreed extra (টাকা দিতে রাজি)");
    expect(bn["queue.in_scope.heading"]).toBe("In scope (contract-এর ভিতরে)");
    expect(bn["queue.withdrawn.heading"]).toBe("Withdrawn (client সরিয়ে নিয়েছেন)");
  });
});

describe("translate, format and plural", () => {
  it("fills {placeholders} and leaves unknown ones alone", () => {
    expect(format("a {x} b {y}", { x: 1 })).toBe("a 1 b {y}");
    expect(translate("en", "results.progress", { a: 1, b: 2, c: 3, d: 4 })).toContain("1/2");
  });
  it("picks .one or .other by count", () => {
    expect(translatePlural("en", "results.found", 1)).toBe("1 request found");
    expect(translatePlural("en", "results.found", 3)).toBe("3 requests found");
    expect(translatePlural("bn", "results.found", 3)).toBe("3টি অনুরোধ পাওয়া গেছে");
  });
  it("falls back to English if a Bengali string is ever empty", () => {
    const saved = DICTS.bn["nav.how"];
    (DICTS.bn as Record<string, string>)["nav.how"] = "";
    expect(translate("bn", "nav.how")).toBe("How it works");
    (DICTS.bn as Record<string, string>)["nav.how"] = saved;
  });
  it("isLang accepts only en and bn", () => {
    expect([isLang("en"), isLang("bn"), isLang("fr"), isLang(null)]).toEqual([true, true, false, false]);
  });
});

describe("the English text of the engine is unchanged", () => {
  const cases: Probabilities[] = [
    { outside: 0.1, paid: 0, withdrawn: 0 }, { outside: 0.5, paid: 0, withdrawn: 0 }, { outside: 0.9, paid: 0.9, withdrawn: 0 },
    { outside: 0.9, paid: 0.1, withdrawn: 0 }, { outside: 0.9, paid: 0.5, withdrawn: 0 }, { outside: 0.9, paid: 0.1, withdrawn: 0.9 },
  ];
  it("every routing reason has a fixed template that equals the engine's English reason", () => {
    const seen = new Set<string>();
    for (const p of cases) { const r = route(p); seen.add(r.reason); expect(reasonText(tEn, r)).toBe(r.reason); }
    expect(seen.size).toBe(6);
  });
  it("the Ask me question template equals the engine's English question", () => {
    for (const ask of ["scope", "agreement"] as const) expect(askQuestionText(tEn, "add a blog?", ask)).toBe(askQuestion("add a blog?", ask));
  });
  it("effort labels, input problems and error messages are the same in English", () => {
    for (const s of [0, 0.7, 1.6, 3]) expect(effortText(tEn, s)).toBe(effortLabel(s));
    expect(checkInputs("", "", "").problems).toEqual(["Paste the agreed contract or scope.", "Paste the client thread, one message per line as “Name: text”."]);
    expect(describeError("credits").title).toBe("Clocked credits are used up.");
    expect(describeError("limit", "Daily limits: 5 Clocked calls per visitor and 9 for the whole site (UTC day).").hint).toContain("Daily limits: 5 Clocked calls per visitor and 9 for the whole site (UTC day).");
  });
  it("Bengali versions of the engine texts are used when the Bengali translator is passed", () => {
    const tBn = (k: Key, v?: Record<string, string | number>) => translate("bn", k, v);
    expect(describeError("network", undefined, tBn).title).toBe(bn["err.network.title"]);
    expect(reasonText(tBn, route(cases[3]))).toBe("এই অনুরোধটি contract-এর বাইরে, এবং টাকা দিতে রাজি হওয়ার কোনো প্রমাণ thread-এ পাওয়া যায়নি।");
  });
});

describe("saved language", () => {
  const w = globalThis as unknown as { window?: unknown };
  afterEach(() => { delete w.window; });
  it("is read from localStorage, and an unknown value is ignored", () => {
    w.window = { localStorage: { getItem: () => "bn" } };
    expect(readStoredLang()).toBe("bn");
    w.window = { localStorage: { getItem: () => "fr" } };
    expect(readStoredLang()).toBeNull();
  });
  it("does not throw when storage is blocked: the app falls back to English", () => {
    w.window = { localStorage: { getItem: () => { throw new Error("blocked"); } } };
    expect(readStoredLang()).toBeNull();
    delete w.window;
    expect(readStoredLang()).toBeNull();
  });
});
