import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface LogActivityData {
  action: string;
  description: string;
}

export function useActivityLogger() {
  const logActivityMutation = useMutation({
    mutationFn: async (data: LogActivityData) => {
      return await apiRequest("/api/log-activity", "POST", data);
    },
    // Don't show error notifications for activity logging to avoid spam
    onError: (error) => {
      console.warn("Failed to log activity:", error);
    },
  });

  const logActivity = (action: string, description: string) => {
    logActivityMutation.mutate({ action, description });
  };

  // Common activity logging functions
  const logLogin = () => logActivity("LOGIN", "User logged in");
  const logLogout = () => logActivity("LOGOUT", "User logged out");
  
  const logPageView = (page: string) => logActivity("PAGE_VIEW", `Visited ${page} page`);
  
  const logQuoteGeneration = (quoteNumber: string, customerName?: string) => 
    logActivity("QUOTE_GENERATED", `Generated quote ${quoteNumber}${customerName ? ` for ${customerName}` : ''}`);
  
  const logQuoteEmail = (quoteNumber: string, customerEmail?: string) =>
    logActivity("QUOTE_EMAILED", `Emailed quote ${quoteNumber}${customerEmail ? ` to ${customerEmail}` : ''}`);
  
  const logQuoteDownload = (quoteNumber: string, format: string = 'PDF') =>
    logActivity("QUOTE_DOWNLOADED", `Downloaded quote ${quoteNumber} as ${format}`);
  
  const logPriceListGenerated = (category?: string, customer?: string) =>
    logActivity("PRICE_LIST_GENERATED", `Generated price list${category ? ` for ${category}` : ''}${customer ? ` for ${customer}` : ''}`);
  
  const logPriceListDownload = (format: string = 'PDF', category?: string) =>
    logActivity("PRICE_LIST_DOWNLOADED", `Downloaded price list as ${format}${category ? ` for ${category}` : ''}`);
  
  const logDataUpload = (fileType: string, recordCount?: number) =>
    logActivity("DATA_UPLOAD", `Uploaded ${fileType} data${recordCount ? ` (${recordCount} records)` : ''}`);
  
  const logDataExport = (dataType: string, format: string = 'CSV') =>
    logActivity("DATA_EXPORT", `Exported ${dataType} data as ${format}`);
  
  const logUserAction = (action: string, target?: string) =>
    logActivity("USER_ACTION", `${action}${target ? ` ${target}` : ''}`);
  
  const logSystemAction = (action: string, details?: string) =>
    logActivity("SYSTEM_ACTION", `${action}${details ? `: ${details}` : ''}`);
  
  const logError = (error: string, context?: string) =>
    logActivity("ERROR", `${error}${context ? ` in ${context}` : ''}`);

  return {
    logActivity,
    logLogin,
    logLogout,
    logPageView,
    logQuoteGeneration,
    logQuoteEmail,
    logQuoteDownload,
    logPriceListGenerated,
    logPriceListDownload,
    logDataUpload,
    logDataExport,
    logUserAction,
    logSystemAction,
    logError,
    isLogging: logActivityMutation.isPending
  };
}