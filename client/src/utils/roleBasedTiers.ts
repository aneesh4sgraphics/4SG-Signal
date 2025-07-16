import { PricingTier } from '@shared/schema';

// Role-based tier visibility configuration
export const ROLE_TIER_ACCESS = {
  admin: 'all', // Admin sees all tiers
  santiago: [
    'Approval_Retail_',
    'Stage1',
    'Stage15',
    'Stage2',
    'Stage25'
  ],
  patricio: [
    'Approval_Retail_',
    'Stage1',
    'Stage15', 
    'Stage2',
    'Stage25',
    'DEALER',
    'DEALER_2',
    'MASTER_DISTRIBUTOR'
  ]
} as const;

/**
 * Filter pricing tiers based on user role
 * @param tiers - All available pricing tiers
 * @param userRole - User's role (admin, santiago, patricio, or user)
 * @returns Filtered pricing tiers based on role permissions
 */
export function filterTiersByRole(tiers: PricingTier[], userRole: string): PricingTier[] {
  if (!tiers || tiers.length === 0) return [];
  
  // Admin sees all tiers
  if (userRole === 'admin') {
    return tiers;
  }
  
  // Santiago sees specific tiers
  if (userRole === 'santiago') {
    return tiers.filter(tier => 
      ROLE_TIER_ACCESS.santiago.some(allowedTier => 
        tier.name.includes(allowedTier) || tier.name.toLowerCase().includes(allowedTier.toLowerCase())
      )
    );
  }
  
  // Patricio sees Santiago's tiers plus additional ones
  if (userRole === 'patricio') {
    return tiers.filter(tier => 
      ROLE_TIER_ACCESS.patricio.some(allowedTier => 
        tier.name.includes(allowedTier) || tier.name.toLowerCase().includes(allowedTier.toLowerCase())
      )
    );
  }
  
  // Default users see all tiers (fallback for other roles)
  return tiers;
}

/**
 * Get user role from email address
 * @param email - User's email address
 * @returns User role based on email
 */
export function getUserRoleFromEmail(email: string): string {
  if (!email) return 'user';
  
  const emailLower = email.toLowerCase();
  
  // Check for admin emails
  if (emailLower.includes('aneesh@4sgraphics.com') || emailLower.includes('oscar@4sgraphics.com')) {
    return 'admin';
  }
  
  // Check for Santiago
  if (emailLower.includes('santiago@4sgraphics.com')) {
    return 'santiago';
  }
  
  // Check for Patricio
  if (emailLower.includes('patricio@4sgraphics.com')) {
    return 'patricio';
  }
  
  // Default role
  return 'user';
}

/**
 * Check if user has access to a specific tier
 * @param tierName - Name of the tier to check
 * @param userRole - User's role
 * @returns Boolean indicating if user can access the tier
 */
export function canAccessTier(tierName: string, userRole: string): boolean {
  if (userRole === 'admin') return true;
  
  if (userRole === 'santiago') {
    return ROLE_TIER_ACCESS.santiago.some(allowedTier => 
      tierName.includes(allowedTier) || tierName.toLowerCase().includes(allowedTier.toLowerCase())
    );
  }
  
  if (userRole === 'patricio') {
    return ROLE_TIER_ACCESS.patricio.some(allowedTier => 
      tierName.includes(allowedTier) || tierName.toLowerCase().includes(allowedTier.toLowerCase())
    );
  }
  
  return true; // Default users can access all tiers
}