import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Upload, Trash2, Edit2, Save, X, FileText, Globe, Copy } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Constants for parsing
const STATE_ABBR = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"
]);

const COUNTRY_WORDS = [
  "USA","U.S.A.","United States","United States of America","US","U.S.",
  "Canada","Mexico","India","United Kingdom","UK","U.K.","Australia"
];

interface ParsedContact {
  id?: number;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  email: string;
  website: string;
}

// Parser functions
function detectEmail(text: string): string {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : "";
}

function detectWebsite(text: string): string {
  const urlPattern = /(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?/gi;
  const m = text.match(urlPattern);
  if (!m) return "";
  let url = m[0];
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url;
}

function detectPhone(text: string): string {
  const phonePattern = /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/;
  const m = text.match(phonePattern);
  return m ? m[0] : "";
}

function detectCityStateZip(lines: string[]): { city: string; state: string; zip: string } {
  for (const line of lines) {
    // Look for patterns like "City, ST 12345"
    const m = line.match(/^(.*?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/);
    if (m && STATE_ABBR.has(m[2])) {
      const before = m[1].trim();
      const parts = before.split(',');
      const cityOnly = (parts.pop() || '').trim();
      return { city: cityOnly, state: m[2], zip: m[3] };
    }
  }
  return { city: "", state: "", zip: "" };
}

function detectCountry(lines: string[]): string {
  for (const line of lines) {
    for (const country of COUNTRY_WORDS) {
      if (line.toLowerCase().includes(country.toLowerCase())) {
        return country.replace(/\.$/,"");
      }
    }
  }
  return "USA"; // Default to USA
}

function detectAddress(lines: string[], city: string, state: string, zip: string): string {
  const isContact = (t: string) => /@/.test(t) || /(https?:\/\/|www\.)/i.test(t) || /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/.test(t);
  const looksStreet = (t: string) => /^\d{1,6}\s/.test(t) || /\b(ave|avenue|st|street|rd|road|dr|drive|blvd|boulevard|way|lane|ln|court|ct|place|pl|circle|cir)\b/i.test(t);
  
  const addressLines: string[] = [];
  let foundCityLine = false;
  
  for (const line of lines) {
    if (line.includes(city) && line.includes(state)) {
      foundCityLine = true;
      continue;
    }
    if (!foundCityLine && !isContact(line) && (looksStreet(line) || /^\d/.test(line))) {
      addressLines.push(line);
    }
  }
  
  return addressLines.join(', ').trim();
}

function detectName(lines: string[], otherFields: Partial<ParsedContact>): string {
  // First non-empty line that's not a contact detail or address
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === otherFields.email) continue;
    if (trimmed === otherFields.phone) continue;
    if (trimmed === otherFields.website) continue;
    if (trimmed.includes('@')) continue;
    if (/^\d{1,6}\s/.test(trimmed)) continue; // Likely address
    if (/\b(LLC|Inc|Corp|Company|Ltd)\b/i.test(trimmed)) return trimmed; // Company name
    if (trimmed.length > 3 && trimmed.length < 100) return trimmed;
  }
  return "";
}

function parseText(text: string): ParsedContact {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  // Detect various fields
  const email = detectEmail(text);
  const website = detectWebsite(text);
  const phone = detectPhone(text);
  const { city, state, zip } = detectCityStateZip(lines);
  const country = detectCountry(lines);
  const address = detectAddress(lines, city, state, zip);
  const name = detectName(lines, { email, phone, website, address });
  
  return {
    name,
    address,
    city,
    state,
    zip,
    country,
    phone,
    email,
    website
  };
}

// Custom hook for text selection
function useSelectionIn(nodeRef: React.RefObject<HTMLElement>) {
  const [selection, setSelection] = useState("");
  
  useEffect(() => {
    const el = nodeRef.current;
    if (!el) return;
    
    function handleMouseUp() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return;
      setSelection(sel.toString().trim());
    }
    
    if (el) {
      el.addEventListener("mouseup", handleMouseUp);
      el.addEventListener("keyup", handleMouseUp);
      
      return () => {
        el.removeEventListener("mouseup", handleMouseUp);
        el.removeEventListener("keyup", handleMouseUp);
      };
    }
  }, [nodeRef]);
  
  return [selection, setSelection] as const;
}

export default function TextParser() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inputText, setInputText] = useState("");
  const [parsedData, setParsedData] = useState<ParsedContact | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ParsedContact | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useSelectionIn(previewRef);
  const [learnedPatterns, setLearnedPatterns] = useState<Record<string, string[]>>({});
  
  // Fetch saved contacts
  const { data: contacts = [], isLoading } = useQuery<ParsedContact[]>({
    queryKey: ['/api/parsed-contacts'],
  });
  
  // Save contact mutation
  const saveMutation = useMutation({
    mutationFn: async (contact: ParsedContact) => {
      const response = await fetch('/api/parsed-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact),
      });
      if (!response.ok) throw new Error('Failed to save contact');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/parsed-contacts'] });
      toast({ title: "Contact saved successfully" });
      setParsedData(null);
      setInputText("");
    },
    onError: () => {
      toast({ title: "Failed to save contact", variant: "destructive" });
    },
  });
  
  // Update contact mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: ParsedContact) => {
      const response = await fetch(`/api/parsed-contacts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update contact');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/parsed-contacts'] });
      toast({ title: "Contact updated successfully" });
      setEditingId(null);
      setEditForm(null);
    },
    onError: () => {
      toast({ title: "Failed to update contact", variant: "destructive" });
    },
  });
  
  // Delete contact mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/parsed-contacts/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete contact');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/parsed-contacts'] });
      toast({ title: "Contact deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete contact", variant: "destructive" });
    },
  });
  
  // Fetch from URL mutation
  const fetchUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) throw new Error('Failed to fetch URL');
      const data = await response.json();
      return data.text;
    },
    onSuccess: (text) => {
      setInputText(text);
      handleParse(text);
    },
    onError: () => {
      toast({ title: "Failed to fetch URL", variant: "destructive" });
    },
  });
  
  const handleParse = (text?: string) => {
    const textToParse = text || inputText;
    if (!textToParse.trim()) {
      toast({ title: "Please enter some text to parse", variant: "destructive" });
      return;
    }
    
    // Check if it's a URL
    if (/^https?:\/\//i.test(textToParse.trim())) {
      fetchUrlMutation.mutate(textToParse.trim());
      return;
    }
    
    const parsed = parseText(textToParse);
    
    // Apply learned patterns
    Object.entries(learnedPatterns).forEach(([field, patterns]) => {
      patterns.forEach(pattern => {
        if (textToParse.includes(pattern)) {
          (parsed as any)[field] = pattern;
        }
      });
    });
    
    setParsedData(parsed);
    toast({ title: "Text parsed successfully" });
  };
  
  const handleFieldAssign = (field: keyof ParsedContact) => {
    if (!selection || !parsedData) return;
    
    // Update parsed data
    setParsedData({
      ...parsedData,
      [field]: selection
    });
    
    // Learn the pattern
    setLearnedPatterns(prev => ({
      ...prev,
      [field]: [...(prev[field] || []), selection]
    }));
    
    toast({ title: `Assigned "${selection}" to ${field}` });
    setSelection("");
  };
  
  const exportToCSV = () => {
    if (!contacts.length) {
      toast({ title: "No contacts to export", variant: "destructive" });
      return;
    }
    
    const headers = ["Name", "Address", "City", "State", "Zip", "Country", "Phone", "Email", "Website"];
    const csvContent = [
      headers.join(","),
      ...contacts.map((c: ParsedContact) => [
        `"${c.name}"`,
        `"${c.address}"`,
        `"${c.city}"`,
        `"${c.state}"`,
        `"${c.zip}"`,
        `"${c.country}"`,
        `"${c.phone}"`,
        `"${c.email}"`,
        `"${c.website}"`
      ].join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({ title: `Exported ${contacts.length} contacts to CSV` });
  };
  
  const handleEdit = (contact: ParsedContact) => {
    setEditingId(contact.id!);
    setEditForm(contact);
  };
  
  const handleSaveEdit = () => {
    if (!editForm || !editForm.id) return;
    updateMutation.mutate(editForm);
  };
  
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };
  
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Text Parser</h1>
        <p className="text-muted-foreground">
          Parse contact information from text, URLs, or documents
        </p>
      </div>
      
      <Tabs defaultValue="parse" className="space-y-6">
        <TabsList>
          <TabsTrigger value="parse">Parse Text</TabsTrigger>
          <TabsTrigger value="contacts">Saved Contacts ({contacts.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="parse" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Input Text</CardTitle>
              <CardDescription>
                Paste text, a website URL, or upload a document to parse
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste text here or enter a URL (e.g., https://example.com)..."
                className="min-h-[200px] font-mono text-sm"
              />
              
              <div className="flex gap-2">
                <Button onClick={() => handleParse()} disabled={!inputText.trim()}>
                  <FileText className="mr-2 h-4 w-4" />
                  Parse Text
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setInputText("");
                    setParsedData(null);
                  }}
                  disabled={!inputText && !parsedData}
                >
                  Clear
                </Button>
                {inputText.trim().startsWith("http") && (
                  <Button 
                    variant="outline"
                    onClick={() => fetchUrlMutation.mutate(inputText.trim())}
                    disabled={fetchUrlMutation.isPending}
                  >
                    <Globe className="mr-2 h-4 w-4" />
                    {fetchUrlMutation.isPending ? "Fetching..." : "Fetch URL"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          
          {parsedData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Preview</CardTitle>
                  <CardDescription>
                    Select text to assign to fields
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div 
                    ref={previewRef}
                    className="p-4 border rounded-lg bg-muted/50 min-h-[200px] whitespace-pre-wrap select-text cursor-text"
                  >
                    {inputText}
                  </div>
                  {selection && (
                    <Alert className="mt-4">
                      <AlertDescription>
                        Selected: "{selection}"
                        <div className="flex flex-wrap gap-2 mt-2">
                          {Object.keys(parsedData).filter(k => k !== 'id').map(field => (
                            <Button
                              key={field}
                              size="sm"
                              variant="outline"
                              onClick={() => handleFieldAssign(field as keyof ParsedContact)}
                            >
                              Assign to {field}
                            </Button>
                          ))}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Parsed Data</CardTitle>
                  <CardDescription>
                    Review and edit parsed information
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(parsedData).filter(([k]) => k !== 'id').map(([field, value]) => (
                    <div key={field} className="space-y-2">
                      <Label className="capitalize">{field}</Label>
                      <Input
                        value={value as string}
                        onChange={(e) => setParsedData({
                          ...parsedData,
                          [field]: e.target.value
                        })}
                        placeholder={`Enter ${field}...`}
                      />
                    </div>
                  ))}
                  
                  <div className="flex gap-2 pt-4">
                    <Button 
                      onClick={() => saveMutation.mutate(parsedData)}
                      disabled={saveMutation.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {saveMutation.isPending ? "Saving..." : "Save Contact"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(parsedData, null, 2));
                        toast({ title: "Copied to clipboard" });
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy JSON
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="contacts" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Saved Contacts</CardTitle>
                  <CardDescription>
                    {contacts.length} contact{contacts.length !== 1 ? 's' : ''} in database
                  </CardDescription>
                </div>
                <Button onClick={exportToCSV} disabled={!contacts.length}>
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading contacts...
                </div>
              ) : contacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No contacts saved yet. Parse some text to get started.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.map((contact: ParsedContact) => (
                        <TableRow key={contact.id}>
                          {editingId === contact.id ? (
                            <>
                              <TableCell>
                                <Input
                                  value={editForm?.name || ""}
                                  onChange={(e) => setEditForm({
                                    ...editForm!,
                                    name: e.target.value
                                  })}
                                  className="h-8"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={editForm?.email || ""}
                                  onChange={(e) => setEditForm({
                                    ...editForm!,
                                    email: e.target.value
                                  })}
                                  className="h-8"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={editForm?.phone || ""}
                                  onChange={(e) => setEditForm({
                                    ...editForm!,
                                    phone: e.target.value
                                  })}
                                  className="h-8"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={editForm?.city || ""}
                                  onChange={(e) => setEditForm({
                                    ...editForm!,
                                    city: e.target.value
                                  })}
                                  className="h-8"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={editForm?.state || ""}
                                  onChange={(e) => setEditForm({
                                    ...editForm!,
                                    state: e.target.value
                                  })}
                                  className="h-8 w-16"
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex gap-1 justify-end">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleSaveEdit}
                                    disabled={updateMutation.isPending}
                                  >
                                    <Save className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleCancelEdit}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="font-medium">{contact.name}</TableCell>
                              <TableCell>{contact.email}</TableCell>
                              <TableCell>{contact.phone}</TableCell>
                              <TableCell>{contact.city}</TableCell>
                              <TableCell>{contact.state}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex gap-1 justify-end">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleEdit(contact)}
                                  >
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => contact.id && deleteMutation.mutate(contact.id)}
                                    disabled={deleteMutation.isPending}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}