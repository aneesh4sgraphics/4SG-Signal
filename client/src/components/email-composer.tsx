import { useState, createContext, useContext, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, X, FileText, Loader2 } from "lucide-react";
import type { EmailTemplate, Customer } from "@shared/schema";

interface EmailComposeConfig {
  to?: string;
  subject?: string;
  body?: string;
  customerId?: string;
  customerName?: string;
  templateId?: number;
  variables?: Record<string, string>;
  usageType?: string; // quick_quotes, price_list, client_email, marketing
  onSent?: () => void; // Callback when email is successfully sent
}

interface EmailComposerContextType {
  open: (config: EmailComposeConfig) => void;
  close: () => void;
  isOpen: boolean;
}

const EmailComposerContext = createContext<EmailComposerContextType | null>(null);

export function useEmailComposer() {
  const context = useContext(EmailComposerContext);
  if (!context) {
    throw new Error("useEmailComposer must be used within EmailComposerProvider");
  }
  return context;
}

export function EmailComposerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<EmailComposeConfig>({});

  const open = useCallback((newConfig: EmailComposeConfig) => {
    setConfig(newConfig);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setConfig({});
  }, []);

  return (
    <EmailComposerContext.Provider value={{ open, close, isOpen }}>
      {children}
      <EmailComposePopup 
        isOpen={isOpen} 
        onClose={close} 
        initialConfig={config}
        onSent={config.onSent}
      />
    </EmailComposerContext.Provider>
  );
}

interface EmailComposePopupProps {
  isOpen: boolean;
  onClose: () => void;
  initialConfig: EmailComposeConfig;
  onSent?: () => void;
}

function EmailComposePopup({ isOpen, onClose, initialConfig, onSent }: EmailComposePopupProps) {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [variables, setVariables] = useState<Record<string, string>>({});

  const { data: templates = [] } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email/templates"],
    enabled: isOpen,
  });

  const sendMutation = useMutation({
    mutationFn: async (data: { 
      to: string; 
      subject: string; 
      body: string; 
      customerId?: string; 
      templateId?: number;
      recipientName?: string;
      variableData?: Record<string, string>;
    }) => {
      const res = await apiRequest("POST", "/api/email/send", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Email sent!",
        description: "Your email has been sent successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/email/sends"] });
      onSent?.();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send email",
        description: error.message || "Please check your Gmail connection and try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (isOpen) {
      setTo(initialConfig.to || "");
      setSubject(initialConfig.subject || "");
      setBody(initialConfig.body || "");
      setSelectedTemplateId(initialConfig.templateId?.toString() || "");
      setVariables(initialConfig.variables || {});
    }
  }, [isOpen, initialConfig]);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId && templateId !== "none") {
      const template = templates.find(t => t.id.toString() === templateId);
      if (template) {
        let processedSubject = template.subject;
        let processedBody = template.body;
        
        const allVars = { ...initialConfig.variables, ...variables };
        Object.entries(allVars).forEach(([key, value]) => {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          processedSubject = processedSubject.replace(regex, value);
          processedBody = processedBody.replace(regex, value);
        });
        
        setSubject(processedSubject);
        setBody(processedBody);
      }
    }
  };

  const handleSend = () => {
    if (!to.trim()) {
      toast({
        title: "Missing recipient",
        description: "Please enter an email address.",
        variant: "destructive",
      });
      return;
    }
    if (!subject.trim()) {
      toast({
        title: "Missing subject",
        description: "Please enter a subject line.",
        variant: "destructive",
      });
      return;
    }

    const allVariables = { ...initialConfig.variables, ...variables };
    sendMutation.mutate({
      to: to.trim(),
      subject: subject.trim(),
      body: body.trim(),
      customerId: initialConfig.customerId,
      templateId: selectedTemplateId && selectedTemplateId !== "none" ? parseInt(selectedTemplateId) : undefined,
      recipientName: initialConfig.customerName,
      variableData: allVariables,
    });
  };

  const activeTemplates = templates.filter(t => {
    if (!t.isActive) return false;
    // If a usageType is specified, only show templates matching that type
    if (initialConfig.usageType) {
      return (t as any).usageType === initialConfig.usageType;
    }
    // Default: show client_email templates or templates without usageType
    return !(t as any).usageType || (t as any).usageType === 'client_email';
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Compose Email
            {initialConfig.customerName && (
              <span className="text-sm font-normal text-muted-foreground">
                to {initialConfig.customerName}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {activeTemplates.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Template
              </Label>
              <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                <SelectTrigger data-testid="select-email-template">
                  <SelectValue placeholder="Choose a template (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template</SelectItem>
                  {activeTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id.toString()}>
                      {template.name}
                      {template.category && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({template.category})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email-to">To</Label>
            <Input
              id="email-to"
              data-testid="input-email-to"
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="recipient@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-subject">Subject</Label>
            <Input
              id="email-subject"
              data-testid="input-email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email-body">Message</Label>
            <Textarea
              id="email-body"
              data-testid="input-email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message..."
              className="min-h-[200px] resize-y"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={onClose}
              data-testid="button-cancel-email"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button 
              onClick={handleSend}
              disabled={sendMutation.isPending}
              data-testid="button-send-email"
            >
              {sendMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface EmailLaunchIconProps {
  email: string;
  customerId?: string;
  customerName?: string;
  variables?: Record<string, string>;
  className?: string;
  size?: "sm" | "md";
}

export function EmailLaunchIcon({ 
  email, 
  customerId, 
  customerName,
  variables = {},
  className = "",
  size = "sm"
}: EmailLaunchIconProps) {
  const { open } = useEmailComposer();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    open({
      to: email,
      customerId,
      customerName: customerName || email,
      variables: {
        'client.email': email,
        'client.name': customerName || '',
        ...variables,
      },
    });
  };

  const sizeClasses = size === "sm" 
    ? "h-4 w-4" 
    : "h-5 w-5";

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center justify-center p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors ${className}`}
      title={`Send email to ${email}`}
      data-testid={`button-email-${email}`}
    >
      <Mail className={sizeClasses} />
    </button>
  );
}
