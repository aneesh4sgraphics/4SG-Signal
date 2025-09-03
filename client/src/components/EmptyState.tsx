import React from 'react';
import { AlertCircle, WifiOff, Lock, Database, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type EmptyStateType = 'network' | 'auth' | 'no-data' | 'error' | 'loading';

interface EmptyStateProps {
  type: EmptyStateType;
  title?: string;
  message?: string;
  details?: string;
  onRetry?: () => void;
  showDetails?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  type,
  title,
  message,
  details,
  onRetry,
  showDetails = process.env.NODE_ENV === 'development'
}) => {
  // Default configurations for different error types
  const configs = {
    network: {
      icon: WifiOff,
      defaultTitle: 'Connection Problem',
      defaultMessage: 'Unable to connect to the server. Please check your internet connection and try again.',
      iconColor: 'text-red-500',
      bgColor: 'bg-red-50'
    },
    auth: {
      icon: Lock,
      defaultTitle: 'Authentication Required',
      defaultMessage: 'Your session has expired or you need to log in to access this data.',
      iconColor: 'text-amber-500',
      bgColor: 'bg-amber-50'
    },
    'no-data': {
      icon: Database,
      defaultTitle: 'No Data Available',
      defaultMessage: 'There are no items to display. Try adjusting your filters or adding new data.',
      iconColor: 'text-gray-400',
      bgColor: 'bg-gray-50'
    },
    error: {
      icon: AlertCircle,
      defaultTitle: 'Something Went Wrong',
      defaultMessage: 'An unexpected error occurred. Please try again or contact support if the problem persists.',
      iconColor: 'text-red-500',
      bgColor: 'bg-red-50'
    },
    loading: {
      icon: RefreshCw,
      defaultTitle: 'Loading...',
      defaultMessage: 'Please wait while we fetch your data.',
      iconColor: 'text-blue-500 animate-spin',
      bgColor: 'bg-blue-50'
    }
  };

  const config = configs[type] || configs.error;
  const Icon = config.icon;

  // Log details to console in development
  if (showDetails && details) {
    console.error(`[EmptyState - ${type}]`, details);
  }

  return (
    <div className={`flex flex-col items-center justify-center p-8 rounded-lg ${config.bgColor} border border-gray-200`}>
      <Icon className={`h-12 w-12 mb-4 ${config.iconColor}`} />
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {title || config.defaultTitle}
      </h3>
      
      <p className="text-sm text-gray-600 text-center max-w-md mb-4">
        {message || config.defaultMessage}
      </p>

      {/* Show technical details in development */}
      {showDetails && details && (
        <div className="w-full max-w-md mb-4">
          <details className="text-xs text-gray-500 bg-white rounded p-3 border border-gray-200">
            <summary className="cursor-pointer font-medium mb-1">Technical Details</summary>
            <pre className="whitespace-pre-wrap break-all mt-2 text-gray-600">
              {details}
            </pre>
          </details>
        </div>
      )}

      {/* Retry button */}
      {onRetry && type !== 'loading' && (
        <Button
          onClick={onRetry}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
      )}

      {/* Special action for auth errors */}
      {type === 'auth' && (
        <Button
          onClick={() => window.location.href = '/login'}
          variant="default"
          size="sm"
          className="mt-2"
        >
          Go to Login
        </Button>
      )}
    </div>
  );
};

// Helper function to determine error type from HTTP response or error
export const getErrorType = (error: any): EmptyStateType => {
  if (!error) return 'error';
  
  // Check for network errors
  if (error.message?.toLowerCase().includes('network') || 
      error.message?.toLowerCase().includes('fetch')) {
    return 'network';
  }
  
  // Check for auth errors (401, 403)
  if (error.status === 401 || error.status === 403) {
    return 'auth';
  }
  
  // Check for no data (404 or empty response)
  if (error.status === 404) {
    return 'no-data';
  }
  
  return 'error';
};

// Helper function to get user-friendly error message
export const getErrorMessage = (error: any): string => {
  if (error.message) {
    // Remove technical jargon in production
    if (process.env.NODE_ENV === 'production') {
      return 'An error occurred while loading data.';
    }
    return error.message;
  }
  
  if (error.statusText) {
    return error.statusText;
  }
  
  return 'An unexpected error occurred.';
};