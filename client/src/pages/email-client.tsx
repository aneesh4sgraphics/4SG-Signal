import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Mail, 
  Send, 
  Inbox, 
  RefreshCw, 
  PenSquare,
  ChevronRight,
  Clock,
  User,
  Tag,
  Loader2
} from "lucide-react";
import { format } from "date-fns";

interface EmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  labelIds: string[];
  body?: string;
}

interface EmailLabel {
  id: string;
  name: string;
  type: string;
}

export default function EmailClient() {
  const { toast } = useToast();
  const [selectedLabel, setSelectedLabel] = useState("INBOX");
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  const { data: labelsData, isLoading: labelsLoading, error: labelsError } = useQuery<EmailLabel[]>({
    queryKey: ["/api/email/labels"],
    queryFn: async () => {
      const res = await fetch('/api/email/labels', { credentials: 'include' });
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  });
  
  const labels = Array.isArray(labelsData) ? labelsData : [];

  const { data: messagesData, isLoading: messagesLoading, refetch: refetchMessages, error: messagesError } = useQuery<EmailMessage[]>({
    queryKey: ["/api/email/messages", selectedLabel],
    queryFn: async () => {
      const res = await fetch(`/api/email/messages?label=${selectedLabel}&maxResults=30`, { credentials: 'include' });
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  });
  
  const messages = Array.isArray(messagesData) ? messagesData : [];

  const { data: fullMessage, isLoading: messageLoading } = useQuery<EmailMessage>({
    queryKey: ["/api/email/messages", selectedMessage?.id],
    queryFn: () => fetch(`/api/email/messages/${selectedMessage?.id}`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!selectedMessage?.id
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (data: { to: string; subject: string; body: string }) => {
      return apiRequest("POST", "/api/email/send", data);
    },
    onSuccess: () => {
      toast({ title: "Email sent successfully" });
      setComposeOpen(false);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      queryClient.invalidateQueries({ queryKey: ["/api/email/messages"] });
    },
    onError: (error) => {
      toast({ 
        title: "Failed to send email", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    }
  });

  const handleSendEmail = () => {
    if (!composeTo || !composeSubject || !composeBody) {
      toast({ title: "Please fill all fields", variant: "destructive" });
      return;
    }
    sendEmailMutation.mutate({ to: composeTo, subject: composeSubject, body: composeBody });
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return format(date, "MMM d, h:mm a");
    } catch {
      return dateStr;
    }
  };

  const extractSenderName = (from: string) => {
    const match = from.match(/^([^<]+)</);
    return match ? match[1].trim() : from.split("@")[0];
  };

  const systemLabels = labels.filter(l => l.type === "system" && ["INBOX", "SENT", "DRAFT", "STARRED", "IMPORTANT"].includes(l.id || l.name));

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Email Client</h1>
        <p className="text-gray-600">Manage your Gmail inbox</p>
      </div>
      <div className="flex gap-4 h-[calc(100vh-200px)]">
        {/* Sidebar with labels */}
        <div className="w-56 flex-shrink-0">
          <Card className="h-full">
            <CardHeader className="py-3">
              <Button 
                className="w-full" 
                onClick={() => setComposeOpen(true)}
                data-testid="button-compose"
              >
                <PenSquare className="h-4 w-4 mr-2" />
                Compose
              </Button>
            </CardHeader>
            <CardContent className="p-2">
              <ScrollArea className="h-[calc(100%-80px)]">
                {labelsLoading ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    {systemLabels.map((label) => (
                      <button
                        key={label.id}
                        onClick={() => setSelectedLabel(label.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                          selectedLabel === label.id
                            ? "bg-purple-100 text-purple-700 font-medium"
                            : "hover:bg-gray-100 text-gray-700"
                        }`}
                        data-testid={`label-${label.id}`}
                      >
                        {label.id === "INBOX" && <Inbox className="h-4 w-4" />}
                        {label.id === "SENT" && <Send className="h-4 w-4" />}
                        {label.id === "DRAFT" && <PenSquare className="h-4 w-4" />}
                        {label.id === "STARRED" && <Tag className="h-4 w-4" />}
                        {label.id === "IMPORTANT" && <Tag className="h-4 w-4" />}
                        {label.name}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Message list */}
        <div className="w-80 flex-shrink-0">
          <Card className="h-full">
            <CardHeader className="py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium">{selectedLabel}</CardTitle>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => refetchMessages()}
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[calc(100vh-280px)]">
                {messagesLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <Mail className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>No messages</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {messages.map((msg) => (
                      <button
                        key={msg.id}
                        onClick={() => setSelectedMessage(msg)}
                        className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${
                          selectedMessage?.id === msg.id ? "bg-purple-50" : ""
                        }`}
                        data-testid={`message-${msg.id}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <User className="h-3 w-3 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900 truncate flex-1">
                            {extractSenderName(msg.from)}
                          </span>
                          <span className="text-xs text-gray-400 flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {formatDate(msg.date)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-800 truncate">{msg.subject || "(No subject)"}</p>
                        <p className="text-xs text-gray-500 truncate mt-1">{msg.snippet}</p>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Message detail */}
        <div className="flex-1">
          <Card className="h-full">
            {selectedMessage ? (
              <>
                <CardHeader className="border-b">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{selectedMessage.subject || "(No subject)"}</CardTitle>
                      <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
                        <User className="h-4 w-4" />
                        <span>{selectedMessage.from}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {formatDate(selectedMessage.date)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setComposeTo(selectedMessage.from.match(/<([^>]+)>/)?.[1] || selectedMessage.from);
                        setComposeSubject(`Re: ${selectedMessage.subject}`);
                        setComposeBody(`\n\n---\nOn ${selectedMessage.date}, ${selectedMessage.from} wrote:\n> ${selectedMessage.snippet}`);
                        setComposeOpen(true);
                      }}
                      data-testid="button-reply"
                    >
                      Reply
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <ScrollArea className="h-[calc(100vh-380px)]">
                    {messageLoading ? (
                      <div className="flex justify-center p-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : fullMessage?.body ? (
                      <div 
                        className="prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: fullMessage.body }}
                      />
                    ) : (
                      <p className="text-gray-600">{selectedMessage.snippet}</p>
                    )}
                  </ScrollArea>
                </CardContent>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <Mail className="h-16 w-16 mx-auto mb-4 text-gray-200" />
                  <p>Select a message to read</p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Compose Dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                type="email"
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                placeholder="recipient@example.com"
                data-testid="input-to"
              />
            </div>
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                placeholder="Email subject"
                data-testid="input-subject"
              />
            </div>
            <div>
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                placeholder="Write your message..."
                rows={10}
                data-testid="input-body"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSendEmail} 
              disabled={sendEmailMutation.isPending}
              data-testid="button-send"
            >
              {sendEmailMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
