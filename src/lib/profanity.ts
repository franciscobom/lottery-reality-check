const BLOCKED_WORDS = [
  "fuck", "shit", "ass", "bitch", "damn", "cunt", "dick", "cock", "pussy",
  "bastard", "whore", "slut", "nigger", "nigga", "fag", "faggot", "retard",
  "piss", "twat", "wanker", "bollocks", "arse",
];

export function containsProfanity(text: string): boolean {
  const lower = text.toLowerCase().replace(/[^a-z]/g, " ");
  const words = lower.split(/\s+/);
  return words.some((word) => BLOCKED_WORDS.includes(word));
}

export function isValidName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (trimmed.length < 1) return { valid: false, error: "Name is required" };
  if (trimmed.length > 30)
    return { valid: false, error: "Name too long (max 30 chars)" };
  if (containsProfanity(trimmed))
    return { valid: false, error: "Please choose a different name" };
  if (!/^[a-zA-Z0-9 _\-'.]+$/.test(trimmed))
    return { valid: false, error: "Name contains invalid characters" };
  return { valid: true };
}
