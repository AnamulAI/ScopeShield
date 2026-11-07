// Pure helpers for the chat-window view of a thread. Nothing here invents data: names come from the thread itself.
export interface ChatMsg { speaker: string; isClient: boolean }

const norm = (s: string) => s.trim().toLocaleLowerCase();

/** Unique speakers in order of first appearance. */
export function participants(msgs: ChatMsg[]): { name: string; isClient: boolean }[] {
  const seen = new Map<string, { name: string; isClient: boolean }>();
  for (const m of msgs) if (!seen.has(norm(m.speaker))) seen.set(norm(m.speaker), { name: m.speaker, isClient: m.isClient });
  return [...seen.values()];
}

/** First letter of the first and last word, upper-cased, by code point ("Nila" -> "N", "Mohammad Anamul Hoque" -> "MH"). */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = Array.from(words[0])[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] ?? "") : "";
  return (first + last).toLocaleUpperCase();
}

// Avatar fills, each with >= 4.5:1 contrast against white text.
export const AVATAR_COLORS = ["#17607c", "#a23f0b", "#5a3fa5", "#25664a", "#2f4b8a", "#5b5e66"] as const;

/** Colour by order of first appearance, so two participants never share a colour (up to six). */
export const avatarColor = (people: { name: string }[], name: string): string => {
  const i = people.findIndex((p) => norm(p.name) === norm(name));
  return AVATAR_COLORS[(i < 0 ? 0 : i) % AVATAR_COLORS.length];
};

export interface Placed { side: "left" | "right"; firstInGroup: boolean; lastInGroup: boolean }

/** Client messages sit on the left, everyone else on the right. Consecutive messages by the same speaker form a group (name and avatar shown once). */
export function placeMessages(msgs: ChatMsg[]): Placed[] {
  return msgs.map((m, i) => {
    const prev = msgs[i - 1], next = msgs[i + 1];
    return {
      side: m.isClient ? "left" : "right",
      firstInGroup: !prev || norm(prev.speaker) !== norm(m.speaker),
      lastInGroup: !next || norm(next.speaker) !== norm(m.speaker),
    };
  });
}
