import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Phone, Loader2, X, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ContactResult {
  id: string | number;
  type: "lead" | "customer";
  name: string;
  company?: string | null;
  email?: string | null;
}

interface LeadSearchResult {
  id: number;
  name: string;
  company?: string | null;
  email?: string | null;
}

interface CustomerSearchResult {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  email?: string | null;
}

interface CustomersPaginatedResponse {
  customers?: CustomerSearchResult[];
  data?: CustomerSearchResult[];
  total?: number;
  page?: number;
}

const CALL_OUTCOMES = [
  { value: "connected", label: "Connected" },
  { value: "left_voicemail", label: "Left Voicemail" },
  { value: "no_answer", label: "No Answer" },
  { value: "callback_scheduled", label: "Callback Scheduled" },
];

function toLeadResults(data: LeadSearchResult[] | null | undefined): ContactResult[] {
  if (!data || !Array.isArray(data)) return [];
  return data.slice(0, 5).map((l) => ({
    id: l.id,
    type: "lead" as const,
    name: l.name,
    company: l.company,
    email: l.email,
  }));
}

function toCustomerResults(data: CustomersPaginatedResponse | CustomerSearchResult[] | null | undefined): ContactResult[] {
  if (!data) return [];
  const arr: CustomerSearchResult[] = Array.isArray(data) ? data : (data.customers ?? data.data ?? []);
  return arr.slice(0, 5).map((c) => ({
    id: c.id,
    type: "customer" as const,
    name: [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.company || c.email || "Unknown",
    company: c.company,
    email: c.email,
  }));
}

export default function FloatingCallLogger() {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState<ContactResult | null>(null);
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const { toast } = useToast();

  const searchEnabled = open && searchQuery.trim().length >= 2 && !selectedContact;

  const { data: leadsData, isFetching: loadingLeads } = useQuery<LeadSearchResult[]>({
    queryKey: ["/api/leads", { search: searchQuery }],
    queryFn: async () => {
      const res = await fetch(`/api/leads?search=${encodeURIComponent(searchQuery)}&limit=10`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : (json.leads ?? json.data ?? []);
    },
    enabled: searchEnabled,
    staleTime: 5000,
  });

  const { data: customersData, isFetching: loadingCustomers } = useQuery<CustomersPaginatedResponse>({
    queryKey: ["/api/customers", { search: searchQuery }],
    queryFn: async () => {
      const res = await fetch(
        `/api/customers?search=${encodeURIComponent(searchQuery)}&limit=10&paginated=true`,
        { credentials: "include" }
      );
      if (!res.ok) return { customers: [] };
      const json = await res.json();
      if (Array.isArray(json)) return { customers: json };
      return json as CustomersPaginatedResponse;
    },
    enabled: searchEnabled,
    staleTime: 5000,
  });

  const leadResults = toLeadResults(leadsData);
  const customerResults = toCustomerResults(customersData);
  const allResults = [...leadResults, ...customerResults].slice(0, 8);
  const isSearching = loadingLeads || loadingCustomers;

  const logCallMutation = useMutation({
    mutationFn: async () => {
      if (!selectedContact || !outcome) throw new Error("Missing required fields");

      const outcomeLabel = CALL_OUTCOMES.find((o) => o.value === outcome)?.label ?? outcome;
      const summary = `Call logged — ${outcomeLabel}${notes ? `: ${notes.substring(0, 80)}` : ""}`;

      if (selectedContact.type === "lead") {
        const res = await apiRequest("POST", `/api/leads/${selectedContact.id}/activities`, {
          activityType: "call_made",
          summary,
          details: notes,
          followUpDate: followUpDate || undefined,
          followUpNote: followUpNote || undefined,
        });
        if (!res.ok) throw new Error("Failed to log call for lead");
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/customer-activity/events", {
          customerId: String(selectedContact.id),
          eventType: "call_made",
          title: `Call — ${outcomeLabel}`,
          description: notes || null,
          sourceType: "manual",
          followUpDate: followUpDate || undefined,
          followUpNote: followUpNote || undefined,
        });
        if (!res.ok) throw new Error("Failed to log call for customer");
        return res.json();
      }
    },
    onSuccess: () => {
      toast({ title: "Call logged", description: followUpDate ? "Call recorded with follow-up task scheduled." : "The call has been recorded successfully." });
      const contact = selectedContact;
      handleClose();
      if (contact?.type === "lead") {
        queryClient.invalidateQueries({ queryKey: ["/api/leads", String(contact.id)] });
      } else if (contact?.type === "customer") {
        queryClient.invalidateQueries({ queryKey: ["/api/customer-activity/events"] });
        queryClient.invalidateQueries({ queryKey: [`/api/customers/${contact.id}/activities`] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/list"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to log call", description: error.message, variant: "destructive" });
    },
  });

  const handleClose = useCallback(() => {
    setOpen(false);
    setSearchQuery("");
    setSelectedContact(null);
    setOutcome("");
    setNotes("");
    setShowResults(false);
    setFollowUpDate("");
    setFollowUpNote("");
  }, []);

  const handleSelectContact = (contact: ContactResult) => {
    setSelectedContact(contact);
    setSearchQuery(contact.name + (contact.company ? ` (${contact.company})` : ""));
    setShowResults(false);
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setSelectedContact(null);
    setShowResults(val.trim().length >= 2);
  };

  const canSubmit = !!selectedContact && !!outcome;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
        title="Log a Call"
        aria-label="Log a Call"
      >
        <Phone className="h-6 w-6" />
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-green-600" />
              Log a Call
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Contact search */}
            <div className="space-y-1.5">
              <Label htmlFor="contact-search">Contact</Label>
              <div className="relative">
                <Input
                  id="contact-search"
                  placeholder="Search by name or company..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  autoComplete="off"
                  onFocus={() => {
                    if (searchQuery.trim().length >= 2 && !selectedContact) setShowResults(true);
                  }}
                />
                {selectedContact && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => {
                      setSelectedContact(null);
                      setSearchQuery("");
                      setShowResults(false);
                    }}
                    aria-label="Clear contact"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}

                {/* Dropdown results */}
                {showResults && !selectedContact && (
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg max-h-56 overflow-y-auto">
                    {isSearching && (
                      <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Searching...
                      </div>
                    )}
                    {!isSearching && allResults.length === 0 && (
                      <div className="px-3 py-3 text-sm text-gray-500">No contacts found</div>
                    )}
                    {allResults.map((contact) => (
                      <button
                        key={`${contact.type}-${contact.id}`}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start gap-2 border-b border-gray-100 last:border-b-0"
                        onClick={() => handleSelectContact(contact)}
                      >
                        <span
                          className={`mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                            contact.type === "lead"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {contact.type === "lead" ? "Lead" : "Contact"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
                          {contact.company && (
                            <p className="text-xs text-gray-500 truncate">{contact.company}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedContact && (
                <p className="text-xs text-gray-500">
                  <span
                    className={`font-semibold ${
                      selectedContact.type === "lead" ? "text-amber-600" : "text-blue-600"
                    }`}
                  >
                    {selectedContact.type === "lead" ? "Lead" : "Contact"}
                  </span>
                  {selectedContact.company && ` · ${selectedContact.company}`}
                </p>
              )}
            </div>

            {/* Call outcome */}
            <div className="space-y-1.5">
              <Label htmlFor="call-outcome">Call Outcome</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger id="call-outcome">
                  <SelectValue placeholder="Select outcome..." />
                </SelectTrigger>
                <SelectContent>
                  {CALL_OUTCOMES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="call-notes">Notes / Summary</Label>
              <Textarea
                id="call-notes"
                placeholder="What was discussed? Any follow-up needed?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Schedule follow-up (optional) */}
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Schedule Follow-up (optional)
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="follow-up-date" className="text-xs">Follow-up Date</Label>
                  <Input
                    id="follow-up-date"
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="follow-up-note" className="text-xs">Note</Label>
                  <Input
                    id="follow-up-note"
                    placeholder="What to follow up on..."
                    value={followUpNote}
                    onChange={(e) => setFollowUpNote(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
              {!followUpDate && notes.trim().length > 20 && (
                <p className="text-xs text-blue-600">AI will scan your notes for a follow-up date if you don't set one.</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} disabled={logCallMutation.isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => logCallMutation.mutate()}
                disabled={!canSubmit || logCallMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {logCallMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Logging...
                  </>
                ) : (
                  <>
                    <Phone className="h-4 w-4 mr-2" />
                    Log Call
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
