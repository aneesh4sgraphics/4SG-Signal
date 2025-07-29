// Configuration file for sensitive values and role mappings
export const APP_CONFIG = {
  // Admin emails - move these to environment variables in production
  ADMIN_EMAILS: [
    process.env.ADMIN_EMAIL_1 || "aneesh@4sgraphics.com",
    process.env.ADMIN_EMAIL_2 || "shiva@4sgraphics.com"
  ],

  // Pre-approved user emails
  PRE_APPROVED_EMAILS: [
    process.env.USER_EMAIL_1 || "santiago@4sgraphics.com",
    process.env.USER_EMAIL_2 || "patricio@4sgraphics.com", 
    process.env.USER_EMAIL_3 || "remy@4sgraphics.com",
    process.env.USER_EMAIL_4 || "oscar@4sgraphics.com",
    process.env.USER_EMAIL_5 || "info@4sgraphics.com"
  ],

  // Role-based pricing tier access
  ROLE_TIER_ACCESS: {
    admin: [
      "Export", "Master Distributor", "Dealer", "Dealer2", 
      "Approval Needed", "Stage 2.5", "Stage 2", "Stage 1.5", 
      "Stage 1", "Retail"
    ],
    manager: [
      "Approval Needed", "Dealer", "Dealer2", "Master Distributor",
      "Stage 2.5", "Stage 2", "Stage 1.5", "Stage 1", "Retail"
    ],
    user: [
      "Stage 2.5", "Stage 2", "Stage 1.5", "Stage 1", "Retail"
    ]
  },

  // Email-specific role mappings for automatic role assignment
  EMAIL_ROLE_MAP: {
    "santiago@4sgraphics.com": "user",
    "oscar@4sgraphics.com": "manager",
    "patricio@4sgraphics.com": "manager", 
    "remy@4sgraphics.com": "user",
    "info@4sgraphics.com": "user",
    "aneesh@4sgraphics.com": "admin",
    "shiva@4sgraphics.com": "admin"
  } as Record<string, string>,

  // Development settings
  DEV_MODE: process.env.NODE_ENV === 'development',
  ENABLE_DEBUG_LOGS: process.env.ENABLE_DEBUG_LOGS === 'true' || process.env.NODE_ENV === 'development'
};

// Helper functions for role checking
export function isAdminEmail(email: string): boolean {
  return APP_CONFIG.ADMIN_EMAILS.includes(email);
}

export function isPreApprovedEmail(email: string): boolean {
  return APP_CONFIG.PRE_APPROVED_EMAILS.includes(email);
}

export function getUserRoleFromEmail(email: string): string {
  if (isAdminEmail(email)) return 'admin';
  return APP_CONFIG.EMAIL_ROLE_MAP[email] || 'user';
}

export function getAccessibleTiers(role: string): string[] {
  const validRoles = ['admin', 'manager', 'user'] as const;
  type ValidRole = typeof validRoles[number];
  
  if (validRoles.includes(role as ValidRole)) {
    return APP_CONFIG.ROLE_TIER_ACCESS[role as ValidRole] || [];
  }
  return [];
}

export function debugLog(message: string, ...args: unknown[]): void {
  if (APP_CONFIG.ENABLE_DEBUG_LOGS && process.env.NODE_ENV === 'development') {
    console.log(message, ...args);
  }
}