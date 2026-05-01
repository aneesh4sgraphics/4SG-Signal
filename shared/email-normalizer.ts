export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') {
    return null;
  }
  
  let normalized = email.trim().toLowerCase();
  
  if (!normalized) {
    return null;
  }
  
  normalized = normalized.replace(/^<|>$/g, '');
  
  const nameEmailMatch = normalized.match(/^[^<]*<([^>]+)>$/);
  if (nameEmailMatch) {
    normalized = nameEmailMatch[1].trim();
  }
  
  const quotedMatch = normalized.match(/^"[^"]*"\s*<([^>]+)>$/);
  if (quotedMatch) {
    normalized = quotedMatch[1].trim();
  }
  
  if (!normalized.includes('@')) {
    return null;
  }
  
  const parts = normalized.split('@');
  if (parts.length !== 2) {
    return null;
  }
  
  let [localPart, domain] = parts;
  
  domain = domain.toLowerCase().trim();
  
  if (!domain || domain.length < 3 || !domain.includes('.')) {
    return null;
  }
  
  const gmailDomains = ['gmail.com', 'googlemail.com'];
  if (gmailDomains.includes(domain)) {
    localPart = localPart.replace(/\./g, '');
    
    const plusIndex = localPart.indexOf('+');
    if (plusIndex > 0) {
      localPart = localPart.substring(0, plusIndex);
    }
    
    domain = 'gmail.com';
  }
  
  const result = `${localPart}@${domain}`;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(result)) {
    return null;
  }
  
  return result;
}

export function extractEmailDomain(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }
  
  const parts = normalized.split('@');
  return parts.length === 2 ? parts[1] : null;
}

export function extractEmailLocalPart(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }
  
  const parts = normalized.split('@');
  return parts.length === 2 ? parts[0] : null;
}

export const FREE_EMAIL_PROVIDERS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.ca',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'live.com',
  'live.co.uk',
  'msn.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'protonmail.com',
  'proton.me',
  'mail.com',
  'yandex.com',
  'yandex.ru',
  'gmx.com',
  'gmx.de',
  'zoho.com',
  'fastmail.com',
  'tutanota.com',
  'hey.com',
  'pm.me',
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
]);

/**
 * Domains that must NEVER be used for domain-based customer matching.
 * These are large companies/services where many different email addresses
 * exist under the same domain (notifications, departments, automated systems).
 * A customer having @fedex.com email does NOT mean all fedex.com senders
 * are that customer.
 */
export const DOMAIN_MATCH_BLOCKLIST = new Set([
  // Shipping carriers
  'fedex.com', 'ups.com', 'usps.com', 'dhl.com', 'dhl.de',
  'ontrac.com', 'lasership.com', 'amazon.com', 'amazonlogistics.com',
  // Major tech/cloud
  'google.com', 'microsoft.com', 'apple.com', 'salesforce.com',
  'hubspot.com', 'mailchimp.com', 'constantcontact.com',
  'sendgrid.net', 'sendgrid.com', 'amazonses.com',
  // Banks / finance
  'paypal.com', 'stripe.com', 'square.com', 'chase.com',
  'bankofamerica.com', 'wellsfargo.com', 'citibank.com',
  // Common notification platforms
  'notifications.google.com', 'bounce.com', 'bounces.amazon.com',
  // Social
  'facebook.com', 'linkedin.com', 'twitter.com', 'instagram.com',
]);

/**
 * Local-part patterns that identify automated/transactional senders that can
 * NEVER be a real human contact. Keep this list conservative — patterns like
 * "info@", "support@" or "billing@" are valid business addresses and must NOT
 * appear here. Only include patterns that are universally machine-generated.
 */
const AUTOMATED_LOCAL_PATTERNS = [
  /^no[_\-.]?reply/i,          // noreply, no-reply, no_reply
  /^do[_\-.]?not[_\-.]?reply/i,
  /^donotreply/i,
  /^mailer[_\-.]?daemon/i,
  /^postmaster/i,
  /^bounces?(-\d+)?$/i,        // bounce, bounces, bounce-123
  /^tracking(updates?)?$/i,    // tracking, trackingupdates
  /^newsletter$/i,
  /^unsubscribe$/i,
  /^auto(reply|response)$/i,   // autoreply, autoresponse (not "auto" alone)
  /^mg\./i,                    // Mailgun subdomains
];

/**
 * Returns true if the email address looks like an automated / transactional sender
 * that should never be matched to a specific customer or generate CRM tasks.
 */
export function isAutomatedSender(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const localPart = normalized.split('@')[0];
  return AUTOMATED_LOCAL_PATTERNS.some(re => re.test(localPart));
}

/**
 * Returns true if this domain should be skipped during domain-based matching.
 * Includes free providers AND the explicit DOMAIN_MATCH_BLOCKLIST.
 */
export function isDomainMatchBlocked(email: string | null | undefined): boolean {
  const domain = extractEmailDomain(email);
  if (!domain) return true;
  return FREE_EMAIL_PROVIDERS.has(domain) || DOMAIN_MATCH_BLOCKLIST.has(domain);
}

export function extractCompanyDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at === -1) return null;
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain || FREE_EMAIL_PROVIDERS.has(domain)) return null;
  return domain;
}

export function isFreeEmailProvider(email: string | null | undefined): boolean {
  const domain = extractEmailDomain(email);
  if (!domain) {
    return false;
  }
  return FREE_EMAIL_PROVIDERS.has(domain);
}

export function areEmailsEquivalent(email1: string | null | undefined, email2: string | null | undefined): boolean {
  const norm1 = normalizeEmail(email1);
  const norm2 = normalizeEmail(email2);
  
  if (!norm1 || !norm2) {
    return false;
  }
  
  return norm1 === norm2;
}

export function parseEmailHeader(raw: string | null | undefined): { email: string | null; name: string } {
  if (!raw || typeof raw !== 'string') {
    return { email: null, name: '' };
  }
  
  const trimmed = raw.trim();
  
  const match = trimmed.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+@[^>]+)>?$/);
  if (match) {
    const name = match[1]?.trim() || '';
    const email = normalizeEmail(match[2]);
    return { name, email };
  }
  
  const simpleEmail = normalizeEmail(trimmed);
  return { name: '', email: simpleEmail };
}
