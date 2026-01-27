import { Clock, Database, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ReportMeta {
  source: 'odoo' | 'shopify' | 'local' | 'mixed';
  cached: boolean;
  fetchedAt: number;
  fetchedAtIso: string;
}

interface DataFreshnessProps {
  meta?: ReportMeta;
  compact?: boolean;
}

const sourceLabels: Record<string, { label: string; color: string }> = {
  odoo: { label: 'Odoo', color: 'bg-purple-100 text-purple-700' },
  shopify: { label: 'Shopify', color: 'bg-green-100 text-green-700' },
  local: { label: 'Local', color: 'bg-blue-100 text-blue-700' },
  mixed: { label: 'Multiple Sources', color: 'bg-amber-100 text-amber-700' },
};

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export function DataFreshness({ meta, compact = false }: DataFreshnessProps) {
  if (!meta) return null;

  const source = sourceLabels[meta.source] || sourceLabels.local;
  const timeAgo = formatTimeAgo(meta.fetchedAt);
  const fullTime = new Date(meta.fetchedAt).toLocaleString();

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{timeAgo}</span>
              {meta.cached && <RefreshCw className="w-3 h-3 text-amber-500" />}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Source: {source.label}</p>
            <p>Last synced: {fullTime}</p>
            {meta.cached && <p className="text-amber-500">Cached data (refreshing in background)</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`${source.color} border-0 font-normal`}>
              <Database className="w-3 h-3 mr-1" />
              {source.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Data source: {source.label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="w-3 h-3" />
              {timeAgo}
              {meta.cached && <RefreshCw className="w-3 h-3 text-amber-500 animate-spin" />}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Last synced: {fullTime}</p>
            {meta.cached && <p className="text-amber-500">Using cached data, refreshing in background</p>}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export type { ReportMeta };
