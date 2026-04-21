export const SETTINGS_ALLOWED_EMAILS: readonly string[] = [
  'rufarod@gmail.com',
  'chiduroobc@gmail.com',
  'chiduurobc@gmail.com',
  'nicholas.gwanzura@outlook.com',
];

export function canAccessSettings(user: { email?: string | null } | null | undefined): boolean {
  const email = user?.email?.trim().toLowerCase();
  if (!email) return false;
  return SETTINGS_ALLOWED_EMAILS.includes(email);
}
