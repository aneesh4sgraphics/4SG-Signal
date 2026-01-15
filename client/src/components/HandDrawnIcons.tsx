interface IconProps {
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}

export const QuickQuotesIcon = ({ className, size = 24, style }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M11.5 5h.434c3.048 0 4.571 0 5.15.547a2 2 0 0 1 .586 1.845c-.156.781-1.4 1.66-3.888 3.42l-4.064 2.876c-2.488 1.76-3.732 2.639-3.888 3.42a2 2 0 0 0 .586 1.845c.579.547 2.102.547 5.15.547h.934M8 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0m14 14a3 3 0 1 1-6 0 3 3 0 0 1 6 0" />
  </svg>
);

export const PriceListIcon = ({ className, size = 24, style }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M21 12H9m12-6H9m12 12H9m-4-6a1 1 0 1 1-2 0 1 1 0 0 1 2 0m0-6a1 1 0 1 1-2 0 1 1 0 0 1 2 0m0 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0" />
  </svg>
);

export const SavedQuotesIcon = ({ className, size = 24, style }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M19 15v6H5v-6m11 2H8m7.913-2.337L8.087 13m8.626-.62L9.463 9m8.71 1.642L12.044 5.5m7.99 3.304L15.109 2.5" />
  </svg>
);

export const ClientsIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="7" r="3.5" />
    <path d="M3 21c0-3 2.5-5.5 6-5.5s6 2.5 6 5.5" />
    <circle cx="17" cy="8" r="2.5" />
    <path d="M17 13c2.5 0 4.5 1.8 4.5 4" />
  </svg>
);

export const SalesChartsIcon = ({ className, size = 24, style }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" style={style}>
    <rect x="3" y="14" width="4" height="7" rx="0.5" />
    <rect x="9" y="10" width="4" height="11" rx="0.5" />
    <rect x="15" y="6" width="4" height="15" rx="0.5" />
    <path d="M19 3l2.5 2.5M19 3l-2.5 2.5M19 3v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

export const CalculatorIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <rect x="6" y="4" width="12" height="5" rx="1" />
    <circle cx="8" cy="13" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="13" r="1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="13" r="1" fill="currentColor" stroke="none" />
    <circle cx="8" cy="17" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="17" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const MarketPricesIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12c2-4 4-6 8-4s4 6 8 4" />
    <path d="M4 17c2-4 4-6 8-4s4 6 8 4" />
    <circle cx="18" cy="6" r="3" />
    <text x="16.5" y="8" fontSize="5" fontWeight="bold" fill="currentColor" stroke="none">$</text>
  </svg>
);

export const ShippingIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8l3-4h8l3 4v10c0 .5-.2 1-.5 1.3-.3.3-.8.7-1.5.7H5c-.7 0-1.2-.4-1.5-.7-.3-.3-.5-.8-.5-1.3V8z" />
    <path d="M3 8h14" />
    <path d="M10 4v4" />
    <path d="M18 10l2-.5" />
    <path d="M18 14l3-.5" />
    <path d="M18 18l2-.5" />
  </svg>
);

export const ShippingLabelsIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l8 4v7c0 4-3 7-8 9-5-2-8-5-8-9V6l8-4z" />
    <path d="M8 11l3 3 5-6" />
    <circle cx="12" cy="2" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

export const ProductLabelsIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 3h7l9 9c.4.4.6.8.6 1.3s-.2.9-.6 1.3l-5.4 5.4c-.4.4-.8.6-1.3.6s-.9-.2-1.3-.6l-9-9V3z" />
    <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

export const SamplesIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="6" width="12" height="12" rx="2" />
    <path d="M8 6V4c0-.5.5-1 1-1h6c.5 0 1 .5 1 1v2" />
    <path d="M10 10v4" />
    <path d="M8 12h4" />
    <circle cx="18" cy="4" r="1.5" fill="currentColor" stroke="none" />
    <path d="M19 6l1 1" strokeWidth="1.5" />
    <path d="M20 3l1 1" strokeWidth="1.5" />
    <path d="M17 5l-1 1" strokeWidth="1.5" />
  </svg>
);

export const CallIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 4c-.5 0-1 .5-1 1 0 8.5 7 15.5 15.5 15.5.5 0 1-.5 1-1v-3c0-.5-.3-.9-.7-1l-3.3-1c-.4-.1-.8 0-1.1.3l-1.4 1.7c-2.5-1.2-4.5-3.2-5.7-5.7l1.7-1.4c.3-.3.4-.7.3-1.1l-1-3.3c-.1-.4-.5-.7-1-.7H5z" />
  </svg>
);

export const FollowUpIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12c0-4 3-7 7-7h6" />
    <path d="M14 8l3-3-3-3" />
    <path d="M20 12c0 4-3 7-7 7H7" />
    <path d="M10 16l-3 3 3 3" />
  </svg>
);

export const OutreachIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 20l18-8L3 4v6l10 2-10 2v6z" />
  </svg>
);

export const DataHygieneIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v18" />
    <path d="M8 5c-2 2-2 4-2 7s0 5 2 7" />
    <path d="M16 5c2 2 2 4 2 7s0 5-2 7" />
    <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="17" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

export const EnablementIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21c0-1 .5-2 1.5-2.5S12 17 12 15c0-1.5.5-3 1.5-4s2.5-1.5 3.5-1c1 .5 1.5 1.5 1.5 3 0 1-.5 2-1 2.5S16 17 16 18c0 1.5-.5 2.5-2 3" />
    <path d="M12 6V3" />
    <path d="M9 4l3 2 3-2" />
  </svg>
);

export const DashboardIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h7v7h-7z" strokeDasharray="2 2" />
  </svg>
);

export const EmailIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
);

export const CrmJourneyIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <path d="M12 3v2" />
    <path d="M12 19v2" />
    <path d="M3 12h2" />
    <path d="M19 12h2" />
  </svg>
);

export const ObjectionsIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3c5 0 9 4 9 9s-4 9-9 9-9-4-9-9 4-9 9-9z" />
    <path d="M12 8v5" />
    <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const SparkleIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />
    <circle cx="19" cy="5" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="5" cy="19" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const CalendarIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M3 10h18" />
    <path d="M8 2v4" />
    <path d="M16 2v4" />
    <circle cx="8" cy="15" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="15" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const IntegrationsIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="18" r="3" />
    <path d="M12 9v6" />
    <path d="M9 16l-3 2" />
    <path d="M15 16l3 2" />
  </svg>
);

export const ProductMappingIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="6" height="6" rx="1" />
    <rect x="15" y="3" width="6" height="6" rx="1" />
    <rect x="3" y="15" width="6" height="6" rx="1" />
    <rect x="15" y="15" width="6" height="6" rx="1" />
    <path d="M9 6h6" />
    <path d="M9 18h6" />
    <path d="M6 9v6" />
    <path d="M18 9v6" />
  </svg>
);

export const DatabaseIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </svg>
);

export const ActivityIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12h4l3-9 4 18 3-9h4" />
  </svg>
);

export const UsersIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="7" r="3" />
    <circle cx="17" cy="7" r="3" />
    <path d="M3 21c0-3.5 2.7-6 6-6s6 2.5 6 6" />
    <path d="M15 15c3.3 0 6 2.5 6 6" />
  </svg>
);

export const SettingsIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3" />
    <path d="M12 19v3" />
    <path d="M2 12h3" />
    <path d="M19 12h3" />
    <path d="M4.9 4.9l2.1 2.1" />
    <path d="M17 17l2.1 2.1" />
    <path d="M4.9 19.1l2.1-2.1" />
    <path d="M17 7l2.1-2.1" />
  </svg>
);

export const PdfIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4c0-.3.1-.5.3-.7.2-.2.4-.3.7-.3h9l6 6v11c0 .3-.1.5-.3.7-.2.2-.4.3-.7.3H5c-.3 0-.5-.1-.7-.3-.2-.2-.3-.4-.3-.7V4z" />
    <path d="M13 2v6h6" />
    <path d="M8 13h8" />
    <path d="M8 17h5" />
  </svg>
);

export const NowModeIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);

export const ReportsIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20h16" />
    <path d="M4 20V8l4-4 4 4 4-2 4 4v10" />
    <circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="14" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const GridIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="6" height="6" rx="1" />
    <rect x="15" y="3" width="6" height="6" rx="1" />
    <rect x="3" y="15" width="6" height="6" rx="1" />
    <rect x="15" y="15" width="6" height="6" rx="1" />
  </svg>
);

export const MenuIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  </svg>
);

export const LogoutIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h4c.6 0 1 .4 1 1v16c0 .6-.4 1-1 1h-4" />
    <path d="M10 17l5-5-5-5" />
    <path d="M15 12H3" />
  </svg>
);

export const ChevronLeftIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 6l-6 6 6 6" />
  </svg>
);

export const ChevronRightIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const RefreshIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12c0-5 4-9 9-9 3.5 0 6.5 2 8 5" />
    <path d="M17 3v5h5" />
    <path d="M21 12c0 5-4 9-9 9-3.5 0-6.5-2-8-5" />
    <path d="M7 21v-5H2" />
  </svg>
);

export const ClockIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 6v6l4 2" />
  </svg>
);

export const SearchIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="10" cy="10" r="7" />
    <path d="M15 15l6 6" />
  </svg>
);

export const CommandIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    <path d="M6 9h12a3 3 0 1 1 0 6H6a3 3 0 1 1 0-6z" />
    <path d="M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    <path d="M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    <path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
  </svg>
);

export const TutorialIcon = ({ className, size = 24 }: IconProps) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3L2 9l10 6 10-6-10-6z" />
    <path d="M2 17l10 6 10-6" />
    <path d="M2 13l10 6 10-6" />
  </svg>
);
