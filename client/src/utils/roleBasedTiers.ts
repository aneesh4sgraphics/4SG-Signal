import { PricingTier } from '@shared/schema';

// Role-based tier visibility configuration
// Updated tier names: Export Only, Distributor, Dealer-VIP, Dealer, Shopify Lowest, Shopify3, Shopify2, Shopify1, Shopify-Account, Retail
export const ROLE_TIER_ACCESS = {
  admin: 'all', // Admin sees all tiers
  user: [
    'Shopify3',
    'Shopify2', 
    'Shopify1',
    'Shopify-Account',
    'Retail'
  ],
  manager: [
    'Shopify3',
    'Shopify2',
    'Shopify1', 
    'Shopify-Account',
    'Retail',
    'Shopify Lowest',
    'Dealer',
    'Dealer-VIP',
    'Distributor',
    'Export Only',
    'Landed Price'
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
  
  // Manager sees user tiers plus additional ones
  if (userRole === 'manager') {
    return tiers.filter(tier => 
      ROLE_TIER_ACCESS.manager.some(allowedTier => 
        tier.name.includes(allowedTier) || tier.name.toLowerCase().includes(allowedTier.toLowerCase())
      )
    );
  }
  
  // Regular users see limited tiers
  if (userRole === 'user') {
    return tiers.filter(tier => 
      ROLE_TIER_ACCESS.user.some(allowedTier => 
        tier.name.includes(allowedTier) || tier.name.toLowerCase().includes(allowedTier.toLowerCase())
      )
    );
  }
  
  // Default fallback - show user tiers
  return tiers.filter(tier => 
    ROLE_TIER_ACCESS.user.some(allowedTier => 
      tier.name.includes(allowedTier) || tier.name.toLowerCase().includes(allowedTier.toLowerCase())
    )
  );
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
  if (emailLower === 'aneesh@4sgraphics.com' || 
      emailLower === 'oscar@4sgraphics.com' ||
      emailLower === 'test@4sgraphics.com') {
    return 'admin';
  }
  
  // Check for manager (Patricio)
  if (emailLower === 'patricio@4sgraphics.com') {
    return 'manager';
  }
  
  // Check for users (Remy and Santiago)
  if (emailLower === 'remy@4sgraphics.com' || 
      emailLower === 'santiago@4sgraphics.com') {
    return 'user';
  }
  
  // Default role for other emails
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
  
  if (userRole === 'manager') {
    return ROLE_TIER_ACCESS.manager.some(allowedTier => 
      tierName.includes(allowedTier) || tierName.toLowerCase().includes(allowedTier.toLowerCase())
    );
  }
  
  if (userRole === 'user') {
    return ROLE_TIER_ACCESS.user.some(allowedTier => 
      tierName.includes(allowedTier) || tierName.toLowerCase().includes(allowedTier.toLowerCase())
    );
  }
  
  // Default fallback - only allow user tiers
  return ROLE_TIER_ACCESS.user.some(allowedTier => 
    tierName.includes(allowedTier) || tierName.toLowerCase().includes(allowedTier.toLowerCase())
  );
}