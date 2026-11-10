// Indonesian WhatsApp numbers in international format without "+" (as wa.me expects), e.g. 0812-3456-789 -> 628123456789.
// Returns null when the input can't be a phone number.
export const normalizePhone = (input: string): string | null => {
  let digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
};

export const formatPhone = (digits: string) =>
  digits.startsWith("62") ? `+62 ${digits.slice(2).replace(/(\d{3})(\d{4})(\d+)/, "$1-$2-$3")}` : `+${digits}`;
