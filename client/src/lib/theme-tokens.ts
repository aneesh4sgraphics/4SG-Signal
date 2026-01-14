/**
 * Notion-Style Design Tokens
 * 
 * This file defines the design system constants for the Notion-style UI.
 * Use these tokens instead of hardcoded values for consistency.
 */

export const colors = {
  // Backgrounds
  bg: {
    app: '#F7F7F7',
    surface: '#FFFFFF',
    hover: '#FAFAFA',
  },
  
  // Text
  text: {
    primary: '#111111',
    secondary: '#666666',
    muted: '#999999',
  },
  
  // Borders
  border: {
    default: '#EAEAEA',
    divider: '#EFEFEF',
    focus: '#CFCFCF',
  },
  
  // Status (only place for color)
  status: {
    success: '#22C55E',
    successMuted: '#DCFCE7',
    warning: '#F59E0B',
    warningMuted: '#FEF3C7',
    error: '#EF4444',
    errorMuted: '#FEE2E2',
  },
} as const;

export const darkColors = {
  bg: {
    app: '#1A1A1A',
    surface: '#242424',
    hover: '#2A2A2A',
  },
  text: {
    primary: '#FAFAFA',
    secondary: '#999999',
    muted: '#666666',
  },
  border: {
    default: '#333333',
    divider: '#2A2A2A',
    focus: '#444444',
  },
} as const;

export const typography = {
  // Font family
  fontFamily: "'Roboto', ui-sans-serif, system-ui, sans-serif",
  
  // Font sizes (px / line-height / weight)
  pageTitle: { size: 24, lineHeight: 32, weight: 600 },
  sectionTitle: { size: 16, lineHeight: 24, weight: 600 },
  body: { size: 14, lineHeight: 20, weight: 400 },
  small: { size: 12, lineHeight: 16, weight: 400 },
  stat: { size: 28, lineHeight: 32, weight: 600 },
  
  // Weights
  weights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const;

export const spacing = {
  // 8px grid - only use these values
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  
  // Component-specific
  pagePadding: 24, // p-6
  sectionGap: 24,  // gap-6
  cardPadding: 16, // p-4
} as const;

export const radii = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 12,
  full: 9999,
} as const;

export const shadows = {
  // Notion uses minimal shadows
  none: 'none',
  subtle: '0 1px 2px rgba(0, 0, 0, 0.04)',
} as const;

// Component heights
export const heights = {
  button: 36,
  input: 36,
  tableRow: 44,
  chip: 24,
} as const;

// Tailwind class helpers
export const tw = {
  // Text colors
  textPrimary: 'text-[#111111] dark:text-[#FAFAFA]',
  textSecondary: 'text-[#666666] dark:text-[#999999]',
  textMuted: 'text-[#999999] dark:text-[#666666]',
  
  // Backgrounds
  bgApp: 'bg-[#F7F7F7] dark:bg-[#1A1A1A]',
  bgSurface: 'bg-white dark:bg-[#242424]',
  bgHover: 'hover:bg-[#FAFAFA] dark:hover:bg-[#2A2A2A]',
  
  // Borders
  border: 'border-[#EAEAEA] dark:border-[#333333]',
  divider: 'border-[#EFEFEF] dark:border-[#2A2A2A]',
  
  // Common patterns
  surface: 'bg-white dark:bg-[#242424] border border-[#EAEAEA] dark:border-[#333333] rounded-lg',
  input: 'bg-white dark:bg-[#242424] border border-[#EAEAEA] dark:border-[#333333] rounded-lg h-9 px-3 text-sm',
  
  // Buttons
  btnPrimary: 'bg-[#111111] dark:bg-[#FAFAFA] text-white dark:text-[#111111] hover:bg-[#333333] dark:hover:bg-[#E5E5E5]',
  btnSecondary: 'bg-white dark:bg-[#242424] border border-[#EAEAEA] dark:border-[#333333] text-[#111111] dark:text-[#FAFAFA] hover:bg-[#FAFAFA] dark:hover:bg-[#2A2A2A]',
  btnGhost: 'bg-transparent text-[#111111] dark:text-[#FAFAFA] hover:bg-[#FAFAFA] dark:hover:bg-[#2A2A2A]',
} as const;

// Helper to check if we're in dark mode
export function isDarkMode(): boolean {
  if (typeof window === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}
