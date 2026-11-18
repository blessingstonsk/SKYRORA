// Input validation shared by forms. The database enforces the same rules via
// CHECK constraints, so these exist to give friendly, immediate feedback.

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Mix letters and numbers';
  return null;
}

export function usernameProblem(u: string): string | null {
  if (!/^[a-z0-9_.]{3,24}$/.test(u)) return '3–24 characters: lowercase letters, numbers, _ or .';
  return null;
}

export function numberIn(s: string, min: number, max: number): number | null {
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/** Strip control characters and trim; caps length. */
export function cleanText(s: string, max: number): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
