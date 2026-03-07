import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const EMAIL_TO_FULL_NAME: Record<string, string> = {
  'aneesh@4sgraphics.com':    'Aneesh Prabhu',
  'patricio@4sgraphics.com':  'Patricio Delgado',
  'santiago@4sgraphics.com':  'Santiago Castellanos',
  'gustavo@4sgraphics.com':   'Gustavo Rivero',
  'oscar@4sgraphics.com':     'Oscar Aguayo',
  'warehouse@4sgraphics.com': 'Ray Cruz',
  'info@4sgraphics.com':      'TEST User',
  'test@4sgraphics.com':      'TEST User',
};

export function getSalesRepDisplayName(email: string | null | undefined): string {
  if (!email) return "";
  const lower = email.toLowerCase().trim();
  if (EMAIL_TO_FULL_NAME[lower]) return EMAIL_TO_FULL_NAME[lower];
  const localPart = email.split("@")[0];
  if (!localPart) return email;
  return localPart.charAt(0).toUpperCase() + localPart.slice(1).toLowerCase();
}

export function sortUsersByDisplayName<T extends { email: string }>(users: T[]): T[] {
  return [...users].sort((a, b) => {
    const nameA = getSalesRepDisplayName(a.email);
    const nameB = getSalesRepDisplayName(b.email);
    return nameA.localeCompare(nameB);
  });
}
