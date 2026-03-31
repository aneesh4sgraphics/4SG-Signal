export const BLOCKED_COMPANY_KEYWORDS = [
  'cargo', 'freight', 'shipping', 'ship',
  'logistics', 'consolidator', 'consolidators',
  '3pl', 'third party logistics', 'trucking', 'drayage', 'intermodal', 'ltl', 'ftl',
  'customs broker', 'forwarder', 'forwarding', 'cold chain', 'supply chain',
];

export function normalizeCompanyName(name: string | null | undefined): string {
  if (!name) return '';
  return name.toLowerCase().trim().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ');
}

export function isBlockedCompany(companyName: string | null | undefined): boolean {
  const normalized = normalizeCompanyName(companyName);
  if (!normalized) return false;
  
  return BLOCKED_COMPANY_KEYWORDS.some(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(normalized);
  });
}

export function getBlockedKeywordMatch(companyName: string | null | undefined): string | null {
  const normalized = normalizeCompanyName(companyName);
  if (!normalized) return null;
  
  for (const keyword of BLOCKED_COMPANY_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(normalized)) {
      return keyword;
    }
  }
  return null;
}
