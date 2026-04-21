export const PRIVILEGED_EMAILS: readonly string[] = [
  'rufarod@gmail.com',
  'chiduroobc@gmail.com',
  'nicholas.gwanzura@outlook.com',
];

export const SETTINGS_ALLOWED_EMAILS = PRIVILEGED_EMAILS;

function isPrivileged(user: { email?: string | null } | null | undefined): boolean {
  const email = user?.email?.trim().toLowerCase();
  if (!email) return false;
  return PRIVILEGED_EMAILS.includes(email);
}

export function canAccessSettings(user: { email?: string | null } | null | undefined): boolean {
  return isPrivileged(user);
}

export function canDelete(user: { email?: string | null } | null | undefined): boolean {
  return isPrivileged(user);
}
