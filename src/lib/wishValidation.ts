// Validation for guest wishes, shared by the form (instant feedback) and the API (authoritative check).

export const NAME_MIN = 2;
export const NAME_MAX = 40;
export const MESSAGE_MIN = 5;
export const MESSAGE_MAX = 300;

export const ATTENDANCE_OPTIONS = [
  { value: "hadir", label: "Hadir" },
  { value: "tidak_hadir", label: "Tidak Hadir" },
] as const;

export type Attendance = (typeof ATTENDANCE_OPTIONS)[number]["value"];

export const isAttendance = (value: unknown): value is Attendance =>
  ATTENDANCE_OPTIONS.some((option) => option.value === value);

export const attendanceLabel = (value: Attendance) => ATTENDANCE_OPTIONS.find((option) => option.value === value)?.label ?? "";

export interface WishInput {
  name: string;
  message: string;
  attendance: string;
  // The name comes from the admin's guest list (personal link), not from the guest: it isn't checked, since the admin
  // may write names the form wouldn't accept ("Bapak Ahmad (Kantor)", longer than NAME_MAX, ...)
  nameFromGuestList?: boolean;
}

// Words matched anywhere inside a word (long/unambiguous enough not to appear inside normal words).
// Stored already normalized: lowercase, leetspeak decoded, repeated letters collapsed.
const PROFANITY_ANYWHERE = [
  // Indonesian / regional
  "anjing", "anjg", "bangsat", "bajingan", "brengsek", "keparat", "kampret", "kontol", "kntl", "memek", "ngentot",
  "ngewe", "entot", "pepek", "pantek", "jancok", "jancuk", "goblok", "gblk", "tolol", "idiot", "lonte", "pelacur",
  "sundal", "jablay", "bencong", "laknat", "sialan", "begok", "bloon", "cebong", "kadrun", "titit", "toket", "bokep",
  "porno", "pukimak", "kimak", "sompret", "anjrit",
  // English
  "fuck", "fck", "shit", "bitch", "bastard", "ashole", "pusy", "cunt", "slut", "whore", "nigger", "nigga", "retard",
];

// Short words only matched as whole words (they occur inside harmless words, e.g. "asu" in "masuk", "cok" in "cocok",
// "tai" in "pantai", "setan" in "setangkai", "puki" in "pukis", "anying" in "accompanying")
const PROFANITY_WHOLE_WORD = [
  "asu", "tai", "taik", "babi", "bego", "bodoh", "dongo", "kunyuk", "monyet", "jembut", "cok", "coli", "puki", "perek",
  "setan", "iblis", "kafir", "ajg", "babik", "bangke", "anjir", "tetek", "ass", "dick", "fag", "sex", "porn",
  // Sundanese-style softened "anjing"
  "ajig", "ajing", "anying", "anyink", "njing", "anjim",
];

const LEET: Record<string, string> = { "0": "o", "1": "i", "!": "i", "3": "e", "4": "a", "@": "a", "5": "s", $: "s", "7": "t", "8": "b", "9": "g" };

// With `leet`, digits and symbols are read as letters ("4jig", "b!tch"); without, they are word breaks ("ajig!")
const normalize = (text: string, leet: boolean) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[0-9!@$]/g, (ch) => (leet ? (LEET[ch] ?? ch) : " "))
    .replace(/([a-z])\1+/g, "$1");

export const containsProfanity = (text: string): boolean => {
  const candidates = [true, false].flatMap((leet) => {
    const normalized = normalize(text, leet);
    const words = normalized.split(/[^a-z]+/).filter(Boolean);
    // Spaced-out or dotted spellings like "a n j i n g" / "k.o.n.t.o.l": join runs of single letters back together
    const spelledOut = normalized.match(/(?:\b[a-z]\b[^a-z]*){3,}/g)?.map((run) => run.replace(/[^a-z]/g, "")) ?? [];
    return [...words, ...spelledOut];
  });

  if (candidates.some((word) => PROFANITY_WHOLE_WORD.includes(word))) return true;
  return PROFANITY_ANYWHERE.some((bad) => candidates.some((word) => word.includes(bad)));
};

const URL_PATTERN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|id|co|io|xyz|info|biz|me|link|site|online)\b)/i;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
// A phone number: 10+ digits (separators allowed) starting like an Indonesian number (0 / 62 / +62 / 8). Dates such
// as 05-12-2026 have fewer digits and pass.
const PHONE_PATTERN = /(?:\+?62|0|\b8)[\d\s.-]{8,}\d/;
const isPhoneNumber = (text: string) => (text.match(new RegExp(PHONE_PATTERN, "g")) ?? []).some((run) => run.replace(/\D/g, "").length >= 10);
// Only real spam: one character held down for a long run. Excited writing ("Aamiiiiiin", "!!!!!!", "......",
// "SELAMAAAAAT") is normal in wishes and passes.
const SPAM_REPEAT_PATTERN = /(.)\1{14,}/u;
// Names may hold emoji, brackets and slashes ("Tante Rina (Bandung)", "Andi 💕", "Sri / Keluarga"); only characters
// used in code or markup are refused
const NAME_BLOCKED_PATTERN = /[<>{}[\]\\|^*=+_~`$#%]/;
const HAS_LETTER_PATTERN = /\p{L}/u;

export const cleanText = (text: string) => text.replace(/\s+/g, " ").trim();

// Returns an Indonesian error message for the first problem found, or null if the wish is acceptable
export const validateWish = ({ name, message, attendance, nameFromGuestList = false }: WishInput): string | null => {
  const cleanName = cleanText(name);
  const cleanMessage = message.trim();

  if (!nameFromGuestList) {
    if (cleanName.length < NAME_MIN) return "Nama wajib diisi (minimal 2 huruf).";
    if (cleanName.length > NAME_MAX) return `Nama maksimal ${NAME_MAX} karakter.`;
    if (!HAS_LETTER_PATTERN.test(cleanName)) return "Nama harus berisi huruf.";
    if (NAME_BLOCKED_PATTERN.test(cleanName)) return "Nama tidak boleh berisi simbol seperti < > { } [ ] * # $.";
  }

  if (!isAttendance(attendance)) return "Pilih konfirmasi kehadiran Anda (Hadir / Tidak Hadir).";

  if (cleanMessage.length < MESSAGE_MIN) return `Ucapan terlalu singkat (minimal ${MESSAGE_MIN} karakter).`;
  if (cleanMessage.length > MESSAGE_MAX) return `Ucapan maksimal ${MESSAGE_MAX} karakter.`;
  if (!HAS_LETTER_PATTERN.test(cleanMessage)) return "Ucapan harus berisi kata-kata.";

  const combined = nameFromGuestList ? cleanMessage : `${cleanName} ${cleanMessage}`;
  if (URL_PATTERN.test(combined) || EMAIL_PATTERN.test(combined)) return "Ucapan tidak boleh berisi link atau email.";
  if (isPhoneNumber(combined)) return "Ucapan tidak boleh berisi nomor telepon.";
  if (SPAM_REPEAT_PATTERN.test(combined)) return "Ucapan tidak boleh berisi karakter berulang yang berlebihan.";
  if (containsProfanity(combined)) return "Mohon gunakan kata-kata yang sopan dan baik.";

  return null;
};
