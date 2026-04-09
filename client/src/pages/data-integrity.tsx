import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertTriangle, ArrowLeft, Search, CheckCircle2, Building2,
  ClipboardList, DollarSign, Mail, ChevronLeft, ChevronRight,
  FileText,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Conflict {
  email_normalized: string;
  lead_id: number;
  lead_name: string;
  lead_email: string;
  lead_company: string | null;
  lead_stage: string;
  lead_score: number;
  lead_task_count: number;
  lead_email_count: number;
  lead_note_count: number;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_company: string | null;
  customer_total_spent: string;
  customer_total_orders: number;
  customer_task_count: number;
  customer_email_count: number;
  customer_note_count: number;
}

interface ConflictsResponse {
  conflicts: Conflict[];
  total: number;
  page: number;
  totalPages: number;
}

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  nurturing: "Nurturing",
  converted: "Converted",
  lost: "Lost",
};

const PAGE_SIZE = 20;

export default function DataIntegrity() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterHasTasks, setFilterHasTasks] = useState(false);
  const [filterHasEmails, setFilterHasEmails] = useState(false);
  const [skipped, setSkipped] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("conflict_skipped") || "[]")); }
    catch { return new Set(); }
  });
  const [confirmDialog, setConfirmDialog] = useState<{
    conflict: Conflict;
    action: "keep_lead" | "keep_customer";
  } | null>(null);

  const triggerSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as any)._conflictSearchTimer);
    (window as any)._conflictSearchTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  };

  const toggleFilter = (filter: "tasks" | "emails") => {
    if (filter === "tasks") setFilterHasTasks(p => !p);
    else setFilterHasEmails(p => !p);
    setPage(1);
  };

  const { data, isLoading } = useQuery<ConflictsResponse>({
    queryKey: ["/api/admin/email-conflicts", page, debouncedSearch, filterHasTasks, filterHasEmails],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(filterHasTasks ? { hasTasks: "true" } : {}),
        ...(filterHasEmails ? { hasEmails: "true" } : {}),
      });
      const res = await fetch(`/api/admin/email-conflicts?${params}`, { credentials: "include" });
      return res.json();
    },
    staleTime: 0,
  });

  const resolveMutation = useMutation({
    mutationFn: async (vars: { leadId: number; customerId: string; action: string }) => {
      const r = await apiRequest("POST", "/api/admin/email-conflicts/resolve", vars);
      return r.json();
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/email-conflicts"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/email-conflict-emails"] });
      toast({
        title: "Conflict resolved",
        description: `${result.remaining} remaining to resolve.`,
      });
      setConfirmDialog(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const skipConflict = (key: string) => {
    setSkipped(prev => {
      const next = new Set(prev);
      next.add(key);
      localStorage.setItem("conflict_skipped", JSON.stringify([...next]));
      return next;
    });
  };

  const unskipAll = () => {
    setSkipped(new Set());
    localStorage.removeItem("conflict_skipped");
  };

  const allConflicts = data?.conflicts ?? [];
  const visibleConflicts = allConflicts.filter(c =>
    !skipped.has(`${c.lead_id}-${c.customer_id}`)
  );
  const total = data?.total ?? 0;
  const skippedCount = skipped.size;
  const resolvedProgress = total === 0 ? 100 : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Admin
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-orange-500" />
              Data Integrity — Email Conflicts
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              The same email address exists in both <strong>Leads</strong> and <strong>Contacts</strong>.
              Choose which record should survive — the other will be deleted, and its open tasks and notes migrated.
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <Card className="mb-6">
          <CardContent className="p-5">
            {isLoading ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-medium text-gray-700">
                      {total === 0 ? "All conflicts resolved!" : `${total} conflict${total !== 1 ? "s" : ""} remaining`}
                    </span>
                    {skippedCount > 0 && (
                      <button onClick={unskipAll} className="text-xs text-blue-600 hover:underline">
                        Show {skippedCount} skipped
                      </button>
                    )}
                  </div>
                  <Progress value={resolvedProgress} className="h-2.5" />
                </div>
                {total === 0 && (
                  <CheckCircle2 className="h-7 w-7 text-green-500 shrink-0" />
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Search + Filters */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name or email…"
              value={search}
              onChange={e => triggerSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={filterHasTasks ? "default" : "outline"}
            size="sm"
            className={filterHasTasks ? "bg-amber-600 hover:bg-amber-700" : ""}
            onClick={() => toggleFilter("tasks")}
          >
            <ClipboardList className="h-4 w-4 mr-1.5" />
            Has open tasks
          </Button>
          <Button
            variant={filterHasEmails ? "default" : "outline"}
            size="sm"
            className={filterHasEmails ? "bg-blue-600 hover:bg-blue-700" : ""}
            onClick={() => toggleFilter("emails")}
          >
            <Mail className="h-4 w-4 mr-1.5" />
            Has emails
          </Button>
        </div>

        {/* Conflict list */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-xl" />
            ))}
          </div>
        ) : visibleConflicts.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-700 text-lg">
                {total === 0 ? "No conflicts found!" : "No results match your filters"}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {total === 0
                  ? "Every email is unique across Leads and Contacts."
                  : skippedCount > 0
                  ? `${skippedCount} hidden. Click "Show skipped" above to review them.`
                  : "Try clearing the filters to see more conflicts."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {visibleConflicts.map(c => {
              const key = `${c.lead_id}-${c.customer_id}`;
              return (
                <Card key={key} className="border border-orange-200 bg-white shadow-sm">
                  <CardHeader className="pb-2 pt-4 px-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                        <span className="text-xs font-mono text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
                          {c.email_normalized}
                        </span>
                      </div>
                      <button
                        onClick={() => skipConflict(key)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Skip for now
                      </button>
                    </div>
                  </CardHeader>

                  <CardContent className="px-5 pb-5">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      {/* Lead side */}
                      <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Badge className="bg-blue-100 text-blue-700 text-xs px-1.5">Lead</Badge>
                          <span className="text-xs text-gray-500">#{c.lead_id}</span>
                        </div>
                        <p className="font-semibold text-gray-900">{c.lead_name}</p>
                        {c.lead_company && (
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Building2 className="h-3 w-3" /> {c.lead_company}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <Mail className="h-3 w-3" /> {c.lead_email}
                        </p>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {STAGE_LABELS[c.lead_stage] ?? c.lead_stage}
                          </Badge>
                          {c.lead_score > 0 && (
                            <span className="text-xs text-gray-500">Score: {c.lead_score}</span>
                          )}
                          {c.lead_task_count > 0 && (
                            <span className="text-xs flex items-center gap-0.5 text-amber-600">
                              <ClipboardList className="h-3 w-3" /> {c.lead_task_count} task{c.lead_task_count !== 1 ? "s" : ""}
                            </span>
                          )}
                          {c.lead_email_count > 0 && (
                            <span className="text-xs flex items-center gap-0.5 text-blue-600">
                              <Mail className="h-3 w-3" /> {c.lead_email_count} email{c.lead_email_count !== 1 ? "s" : ""}
                            </span>
                          )}
                          {c.lead_note_count > 0 && (
                            <span className="text-xs flex items-center gap-0.5 text-gray-600">
                              <FileText className="h-3 w-3" /> {c.lead_note_count} note{c.lead_note_count !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Customer side */}
                      <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Badge className="bg-green-100 text-green-700 text-xs px-1.5">Contact</Badge>
                          <span className="text-xs text-gray-500">{c.customer_id}</span>
                        </div>
                        <p className="font-semibold text-gray-900">
                          {c.customer_name || <span className="text-gray-400 italic">No name</span>}
                        </p>
                        {c.customer_company && (
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Building2 className="h-3 w-3" /> {c.customer_company}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <Mail className="h-3 w-3" /> {c.customer_email}
                        </p>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          {parseFloat(c.customer_total_spent) > 0 && (
                            <span className="text-xs flex items-center gap-0.5 text-green-700">
                              <DollarSign className="h-3 w-3" />
                              ${parseFloat(c.customer_total_spent).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                          )}
                          {c.customer_total_orders > 0 && (
                            <span className="text-xs text-gray-500">{c.customer_total_orders} orders</span>
                          )}
                          {c.customer_task_count > 0 && (
                            <span className="text-xs flex items-center gap-0.5 text-amber-600">
                              <ClipboardList className="h-3 w-3" /> {c.customer_task_count} task{c.customer_task_count !== 1 ? "s" : ""}
                            </span>
                          )}
                          {c.customer_email_count > 0 && (
                            <span className="text-xs flex items-center gap-0.5 text-blue-600">
                              <Mail className="h-3 w-3" /> {c.customer_email_count} email{c.customer_email_count !== 1 ? "s" : ""}
                            </span>
                          )}
                          {c.customer_note_count > 0 && (
                            <span className="text-xs flex items-center gap-0.5 text-gray-600">
                              <FileText className="h-3 w-3" /> {c.customer_note_count} note{c.customer_note_count !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-blue-300 text-blue-700 hover:bg-blue-50 flex-1"
                        disabled={resolveMutation.isPending}
                        onClick={() => setConfirmDialog({ conflict: c, action: "keep_lead" })}
                      >
                        Keep as Lead — delete Contact
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-green-300 text-green-700 hover:bg-green-50 flex-1"
                        disabled={resolveMutation.isPending}
                        onClick={() => setConfirmDialog({ conflict: c, action: "keep_customer" })}
                      >
                        Move to Contacts — delete Lead
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {(data?.totalPages ?? 0) > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <Button
              variant="outline" size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-gray-600">
              Page {page} of {data?.totalPages}
            </span>
            <Button
              variant="outline" size="sm"
              disabled={page >= (data?.totalPages ?? 1)}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      {confirmDialog && (
        <AlertDialog open onOpenChange={() => setConfirmDialog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm resolution</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>
                  {confirmDialog.action === "keep_lead" ? (
                    <p>
                      <strong>{confirmDialog.conflict.lead_name}</strong> will remain as a <strong>Lead</strong>.
                      The Contact (<em>{confirmDialog.conflict.customer_name || confirmDialog.conflict.customer_id}</em>) will be
                      permanently deleted — its open tasks and notes will be migrated to the lead first.
                    </p>
                  ) : (
                    <p>
                      <strong>{confirmDialog.conflict.customer_name || confirmDialog.conflict.customer_id}</strong> will remain as a{" "}
                      <strong>Contact</strong>.
                      The Lead (<em>{confirmDialog.conflict.lead_name}</em>) will be permanently deleted — its open tasks and notes will be
                      migrated to the contact first.
                    </p>
                  )}
                  <p className="text-red-600 font-medium mt-3">This action cannot be undone.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() =>
                  resolveMutation.mutate({
                    leadId: confirmDialog.conflict.lead_id,
                    customerId: confirmDialog.conflict.customer_id,
                    action: confirmDialog.action,
                  })
                }
              >
                {resolveMutation.isPending ? "Processing…" : "Confirm & Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
