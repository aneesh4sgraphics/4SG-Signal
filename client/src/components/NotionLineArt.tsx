// Notion-style line art decorative elements in B&W
import React from 'react';

export const HeaderDivider = () => (
  <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent my-6" />
);

export const SectionDivider = () => (
  <div className="w-full h-px bg-gray-200 my-4" />
);

export const CornerAccent = ({ position = 'top-left' }: { position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }) => {
  const getPositionClasses = () => {
    switch (position) {
      case 'top-right': return 'top-0 right-0';
      case 'bottom-left': return 'bottom-0 left-0';
      case 'bottom-right': return 'bottom-0 right-0';
      default: return 'top-0 left-0';
    }
  };

  return (
    <div className={`absolute ${getPositionClasses()} w-8 h-8 pointer-events-none`}>
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-gray-300">
        <path 
          d="M2 2L30 2M2 2L2 30" 
          stroke="currentColor" 
          strokeWidth="1" 
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

export const MinimalIcon = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`p-2 rounded-lg border border-gray-200 bg-white ${className}`}>
    {children}
  </div>
);

export const DottedConnector = ({ vertical = false }: { vertical?: boolean }) => (
  <div className={`${vertical ? 'h-8 w-px' : 'w-8 h-px'} border-${vertical ? 'l' : 't'} border-dashed border-gray-300`} />
);

export const SimpleCardFrame = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`relative border border-gray-200 rounded-lg bg-white ${className}`}>
    <CornerAccent position="top-left" />
    {children}
  </div>
);

export const IconBadge = ({ icon: Icon, label, className = "" }: { 
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  className?: string;
}) => (
  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-300 bg-gray-50 text-sm text-gray-700 ${className}`}>
    <Icon className="h-3 w-3" />
    <span>{label}</span>
  </div>
);

export const GridPattern = () => (
  <div className="absolute inset-0 opacity-30 pointer-events-none">
    <svg width="40" height="40" className="w-full h-full">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>
  </div>
);

export const FloatingElements = () => (
  <div className="absolute top-4 right-4 opacity-20 pointer-events-none">
    <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
      <circle cx="15" cy="15" r="2" fill="#9ca3af" />
      <circle cx="45" cy="15" r="1.5" fill="#9ca3af" />
      <circle cx="30" cy="45" r="1" fill="#9ca3af" />
      <path d="M15 15L30 30L45 15" stroke="#9ca3af" strokeWidth="0.5" strokeDasharray="2,2" />
    </svg>
  </div>
);