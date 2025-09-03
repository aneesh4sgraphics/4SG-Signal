import React from 'react';
import { AlertCircle, WifiOff, Lock, Database, RefreshCw, Server, AlertTriangle, FileX } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type EmptyStateType = 'network' | 'auth' | 'no-data' | 'error' | 'loading' | 'server' | 'timeout' | 'not-found';

interface EmptyStateProps {
  type: EmptyStateType;
  title?: string;
  message?: string;
  details?: string;
  onRetry?: () => void;
  showDetails?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  type,
  title,
  message,
  details,
  onRetry,
  showDetails = process.env.NODE_ENV === 'development',
  actionLabel,
  onAction
}) => {
  // Default configurations for different error types
  const configs = {
    network: {
      icon: WifiOff,
      defaultTitle: 'Connection Problem',
      defaultMessage: 'Unable to connect to the server. Please check your internet connection and try again.',
      iconColor: 'text-red-500',
      bgColor: 'bg-red-50',
      helpText: 'Check your internet connection or try refreshing the page.'
    },
    auth: {
      icon: Lock,
      defaultTitle: 'Authentication Required',
      defaultMessage: 'Your session has expired or you need to log in to access this data.',
      iconColor: 'text-amber-500',
      bgColor: 'bg-amber-50',
      helpText: 'Please log in again to continue.'
    },
    'no-data': {
      icon: Database,
      defaultTitle: 'No Data Found',
      defaultMessage: 'There are no items to display. This could mean the database is empty or your filters are too restrictive.',
      iconColor: 'text-gray-400',
      bgColor: 'bg-gray-50',
      helpText: 'Try adjusting your filters, adding new data, or refreshing the page.'
    },
    error: {
      icon: AlertCircle,
      defaultTitle: 'Something Went Wrong',
      defaultMessage: 'An unexpected error occurred while processing your request.',
      iconColor: 'text-red-500',
      bgColor: 'bg-red-50',
      helpText: 'Try refreshing the page or contact support if the problem persists.'
    },
    loading: {
      icon: RefreshCw,
      defaultTitle: 'Loading Data',
      defaultMessage: 'Please wait while we fetch your information.',
      iconColor: 'text-blue-500 animate-spin',
      bgColor: 'bg-blue-50',
      helpText: 'This usually takes just a moment...'
    },
    server: {
      icon: Server,
      defaultTitle: 'Server Error',
      defaultMessage: 'The server encountered an error while processing your request.',
      iconColor: 'text-orange-500',
      bgColor: 'bg-orange-50',
      helpText: 'This is likely a temporary issue. Please try again in a few moments.'
    },
    timeout: {
      icon: AlertTriangle,
      defaultTitle: 'Request Timeout',
      defaultMessage: 'The request took too long to complete and was cancelled.',
      iconColor: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      helpText: 'The server might be busy. Please try again or reduce the amount of data requested.'
    },
    'not-found': {
      icon: FileX,
      defaultTitle: 'Not Found',
      defaultMessage: 'The requested resource could not be found.',
      iconColor: 'text-gray-500',
      bgColor: 'bg-gray-50',
      helpText: 'The item may have been deleted or moved. Check the URL or navigate back to the main page.'
    }
  };

  const config = configs[type] || configs.error;
  const Icon = config.icon;
  const isDev = process.env.NODE_ENV === 'development';

  // Enhanced logging in development
  React.useEffect(() => {
    if (isDev && details) {
      const timestamp = new Date().toISOString();
      console.group(`%c[EmptyState - ${type.toUpperCase()}] ${timestamp}`, 'color: #ff6b6b; font-weight: bold');
      console.log('%cType:', 'font-weight: bold', type);
      console.log('%cTitle:', 'font-weight: bold', title || config.defaultTitle);
      console.log('%cMessage:', 'font-weight: bold', message || config.defaultMessage);
      if (details) {
        console.log('%cDetails:', 'font-weight: bold', details);
      }
      console.groupEnd();
    }
  }, [type, title, message, details, isDev, config]);

  return (
    <div className={`flex flex-col items-center justify-center p-8 rounded-lg ${config.bgColor} border border-gray-200 shadow-sm`}>
      <Icon className={`h-12 w-12 mb-4 ${config.iconColor}`} />
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {title || config.defaultTitle}
      </h3>
      
      <p className="text-sm text-gray-600 text-center max-w-md mb-2">
        {message || config.defaultMessage}
      </p>

      {/* Help text for better guidance */}
      {config.helpText && (
        <p className="text-xs text-gray-500 text-center max-w-md mb-4 italic">
          {config.helpText}
        </p>
      )}

      {/* Show technical details in development or when explicitly enabled */}
      {(showDetails || isDev) && details && (
        <div className="w-full max-w-lg mb-4">
          <details className="text-xs bg-white rounded-md p-3 border border-gray-200 shadow-sm">
            <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
              {isDev ? '🔍 Technical Details' : 'More Information'}
            </summary>
            <div className="mt-2 space-y-1">
              <pre className="whitespace-pre-wrap break-all text-gray-600 bg-gray-50 p-2 rounded">
                {details}
              </pre>
              {isDev && (
                <div className="text-xs text-gray-400 pt-2 border-t">
                  <span className="font-semibold">Debug Mode:</span> This information is only visible in development
                </div>
              )}
            </div>
          </details>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap justify-center">
        {/* Retry button */}
        {onRetry && type !== 'loading' && (
          <Button
            onClick={onRetry}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {type === 'timeout' ? 'Retry Request' : 'Try Again'}
          </Button>
        )}

        {/* Custom action button */}
        {onAction && actionLabel && (
          <Button
            onClick={onAction}
            variant="default"
            size="sm"
            className="flex items-center gap-2"
          >
            {actionLabel}
          </Button>
        )}

        {/* Special action for auth errors */}
        {type === 'auth' && !onAction && (
          <Button
            onClick={() => window.location.href = '/login'}
            variant="default"
            size="sm"
          >
            Go to Login
          </Button>
        )}

        {/* Home button for not found errors */}
        {type === 'not-found' && (
          <Button
            onClick={() => window.location.href = '/'}
            variant="outline"
            size="sm"
          >
            Back to Home
          </Button>
        )}
      </div>
    </div>
  );
};

// Helper function to determine error type from HTTP response or error
export const getErrorType = (error: any): EmptyStateType => {
  if (!error) return 'error';
  
  // Check for network errors (connection issues)
  if (error.message?.toLowerCase().includes('network') || 
      error.message?.toLowerCase().includes('fetch') ||
      error.message?.toLowerCase().includes('connection') ||
      error.code === 'ECONNREFUSED' ||
      error.isNetworkError) {
    return 'network';
  }
  
  // Check for timeout errors
  if (error.message?.toLowerCase().includes('timeout') ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNABORTED') {
    return 'timeout';
  }
  
  // Check for auth errors (401, 403)
  if (error.status === 401 || error.status === 403 || error.isAuthError) {
    return 'auth';
  }
  
  // Check for not found errors (404)
  if (error.status === 404) {
    return 'not-found';
  }
  
  // Check for server errors (5xx)
  if (error.status >= 500 && error.status < 600) {
    return 'server';
  }
  
  // Check if response is empty array/object (no data scenario)
  if (error.isEmptyResponse || 
      (Array.isArray(error.response) && error.response.length === 0)) {
    return 'no-data';
  }
  
  return 'error';
};

// Helper function to get user-friendly error message
export const getErrorMessage = (error: any): string => {
  const isDev = process.env.NODE_ENV === 'development';
  
  // Network errors
  if (error.isNetworkError || error.code === 'ECONNREFUSED') {
    return 'Cannot connect to the server. Check your internet connection.';
  }
  
  // Timeout errors
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
    return 'The request took too long. The server might be busy.';
  }
  
  // Auth errors with specific messages
  if (error.status === 401) {
    return 'You need to log in to access this content.';
  }
  if (error.status === 403) {
    return 'You don\'t have permission to access this content.';
  }
  
  // Server errors
  if (error.status >= 500 && error.status < 600) {
    return `Server error (${error.status}). Our team has been notified.`;
  }
  
  // Not found
  if (error.status === 404) {
    return 'The requested content could not be found.';
  }
  
  // Custom error message if provided
  if (error.userMessage) {
    return error.userMessage;
  }
  
  // Default to error message in dev, generic in prod
  if (error.message) {
    if (isDev) {
      return error.message;
    }
    // Clean up technical messages for production
    if (error.message.toLowerCase().includes('failed to fetch')) {
      return 'Unable to load data. Please check your connection.';
    }
    if (error.message.toLowerCase().includes('unauthorized')) {
      return 'Authentication required. Please log in.';
    }
    return 'An error occurred while loading data.';
  }
  
  if (error.statusText) {
    return error.statusText;
  }
  
  return 'An unexpected error occurred. Please try again.';
};

// Helper function to get technical details for debugging
export const getErrorDetails = (error: any): string => {
  const details: string[] = [];
  
  if (error.status) {
    details.push(`Status: ${error.status}`);
  }
  
  if (error.statusText) {
    details.push(`Status Text: ${error.statusText}`);
  }
  
  if (error.url) {
    details.push(`URL: ${error.url}`);
  }
  
  if (error.method) {
    details.push(`Method: ${error.method}`);
  }
  
  if (error.code) {
    details.push(`Code: ${error.code}`);
  }
  
  if (error.responseText) {
    details.push(`Response: ${error.responseText}`);
  }
  
  if (error.stack && process.env.NODE_ENV === 'development') {
    details.push(`\nStack:\n${error.stack}`);
  }
  
  if (details.length === 0 && error.message) {
    details.push(error.message);
  }
  
  return details.join('\n');
};