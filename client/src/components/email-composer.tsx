import { useState, createContext, useContext, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, X, FileText, Loader2, Code, Eye } from "lucide-react";
import type { EmailTemplate, Customer } from "@shared/schema";
import { EmailRichTextEditor, type EmailRichTextEditorRef } from "@/components/EmailRichTextEditor";
import { useAuth } from "@/hooks/useAuth";

interface EmailComposeConfig {
  to?: string;
  subject?: string;
  body?: string;
  customerId?: string;
  customerName?: string;
  templateId?: number;
  variables?: Record<string, string>;
  usageType?: string;
  onSent?: () => void;
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

// Returns true if the string is a complete HTML document (starts with <!DOCTYPE or <html)
function isFullHtmlDoc(html: string): boolean {
  const t = (html || '').trim().toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html');
}

// Isolated iframe that renders email HTML without app CSS interference
function HtmlPreviewFrame({ html, minHeight = 200 }: { html: string; minHeight?: number }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(minHeight);

  const srcDoc = isFullHtmlDoc(html)
    ? html
    : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;font-size:14px;color:#1f2937;padding:16px;margin:0;word-break:break-word}img{max-width:100%}</style></head><body>${html}</body></html>`;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onLoad = () => {
      try {
        const h = frame.contentDocument?.body?.scrollHeight;
        if (h && h > minHeight) setHeight(h + 32);
      } catch {}
    };
    frame.addEventListener('load', onLoad);
    return () => frame.removeEventListener('load', onLoad);
  }, [srcDoc, minHeight]);

  return (
    <iframe
      ref={frameRef}
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-scripts allow-popups"
      style={{ width: '100%', height, border: '1px solid #e5e7eb', borderRadius: 6, display: 'block' }}
      title="Email preview"
    />
  );
}

function EmailComposePopup({ isOpen, onClose, initialConfig, onSent }: EmailComposePopupProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");

  // Rich-text mode state (used when NOT a full HTML doc)
  const [richBody, setRichBody] = useState("");

  // Raw HTML mode state (used when a full HTML doc template is loaded)
  const [rawHtml, setRawHtml] = useState("");
  const [isRawHtmlMode, setIsRawHtmlMode] = useState(false);
  const [showRawSource, setShowRawSource] = useState(false);

  // Template tracking
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const editorRef = useRef<EmailRichTextEditorRef>(null);
  const hasInitializedBody = useRef(false);

  const { data: templates = [] } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email/templates"],
    enabled: isOpen,
  });

  const { data: signature } = useQuery<{ signatureHtml: string } | null>({
    queryKey: ["/api/email/signature"],
    enabled: isOpen,
  });

  const allVariables = useMemo(() => {
    const userFirstName = (user as any)?.firstName || '';
    const userLastName = (user as any)?.lastName || '';
    const userFullName = `${userFirstName} ${userLastName}`.trim() || (user as any)?.email?.split('@')[0] || '';
    const userEmail = (user as any)?.email || '';

    return {
      'user.name': userFullName,
      'user.email': userEmail,
      'user.signature': signature?.signatureHtml || '',
      ...initialConfig.variables,
      ...variables,
    };
  }, [user, signature, initialConfig.variables, variables]);

  const convertPlainTextToHtml = (text: string): string => {
    if (!text) return '';
    if (text.includes('<p>') || text.includes('<br>') || text.includes('<div>')) {
      return text;
    }
    return text
      .split('\n\n')
      .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
      .join('');
  };

  const sendMutation = useMutation({
    mutationFn: async (data: {
      to: string;
      subject: string;
      body: string;
      htmlBody?: string;
      customerId?: string;
      templateId?: number;
      recipientName?: string;
      variableData?: Record<string, string>;
    }) => {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || json.message || "Failed to send email");
      }
      return json;
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
    if (isOpen && !hasInitializedBody.current) {
      setTo(initialConfig.to || "");
      setSubject(initialConfig.subject || "");

      const bodyContent = initialConfig.body || "";

      if (isFullHtmlDoc(bodyContent)) {
        setIsRawHtmlMode(true);
        setRawHtml(bodyContent);
        setRichBody('');
      } else {
        const htmlBody = convertPlainTextToHtml(bodyContent);
        setIsRawHtmlMode(false);
        setRawHtml('');
        if (signature?.signatureHtml && !htmlBody.includes(signature.signatureHtml)) {
          setRichBody(htmlBody + '<br><br>--<br>' + signature.signatureHtml);
        } else {
          setRichBody(htmlBody);
        }
      }

      setSelectedTemplateId(initialConfig.templateId?.toString() || "");
      setVariables(initialConfig.variables || {});

      if (signature !== undefined) {
        hasInitializedBody.current = true;
      }
    }
  }, [isOpen, initialConfig, signature]);

  useEffect(() => {
    if (!isOpen) {
      hasInitializedBody.current = false;
      setIsRawHtmlMode(false);
      setRawHtml('');
      setRichBody('');
      setShowRawSource(false);
    }
  }, [isOpen]);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId && templateId !== "none") {
      const template = templates.find(t => t.id.toString() === templateId);
      if (template) {
        let processedSubject = template.subject;
        let processedBody = template.body;

        Object.entries(allVariables).forEach(([key, value]) => {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          processedSubject = processedSubject.replace(regex, value || '');
          processedBody = processedBody.replace(regex, value || '');
        });

        setSubject(processedSubject);

        if (isFullHtmlDoc(processedBody)) {
          // Full HTML document — bypass the rich text editor entirely
          console.log('[Compose] Full HTML template selected — using raw HTML mode');
          console.log('[Compose] Template stored HTML length:', template.body.length);
          console.log('[Compose] Processed HTML length:', processedBody.length);
          console.log('[Compose] HTML preview (first 400 chars):', processedBody.slice(0, 400));
          setIsRawHtmlMode(true);
          setRawHtml(processedBody);
          setRichBody('');
        } else {
          // Simple rich text template — safe to load into Tiptap
          console.log('[Compose] Rich text template selected — using editor mode');
          setIsRawHtmlMode(false);
          setRawHtml('');
          setRichBody(processedBody);
        }
      }
    } else {
      // No template selected — go back to rich text mode with whatever was there
      setIsRawHtmlMode(false);
      setRawHtml('');
    }
  };

  const stripHtml = (html: string): string => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
  };

  const handleSend = () => {
    if (!signature) {
      toast({
        title: "Signature required",
        description: "Set up your email signature in Email Sequences → Signature tab before sending.",
        variant: "destructive",
      });
      return;
    }
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

    let htmlBody: string;
    let plainTextBody: string;

    if (isRawHtmlMode) {
      // Full HTML document template — send the raw HTML exactly as stored
      // NEVER pass through the rich text editor to avoid Tiptap mangling
      htmlBody = rawHtml;
      plainTextBody = stripHtml(rawHtml);

      console.log('[Compose] ── SENDING RAW HTML TEMPLATE ──────────────────────');
      console.log('[Compose] Raw HTML length:', rawHtml.length, 'chars');
      console.log('[Compose] Raw HTML preview (first 600 chars):');
      console.log(rawHtml.slice(0, 600));
      console.log('[Compose] ────────────────────────────────────────────────────');
    } else {
      // Rich text mode — use the Tiptap editor output
      htmlBody = richBody.trim();
      plainTextBody = stripHtml(htmlBody);

      console.log('[Compose] ── SENDING RICH TEXT EMAIL ────────────────────────');
      console.log('[Compose] HTML body length:', htmlBody.length, 'chars');
      console.log('[Compose] ────────────────────────────────────────────────────');
    }

    sendMutation.mutate({
      to: to.trim(),
      subject: subject.trim(),
      body: plainTextBody.trim(),
      htmlBody,
      customerId: initialConfig.customerId,
      templateId: selectedTemplateId && selectedTemplateId !== "none" ? parseInt(selectedTemplateId) : undefined,
      recipientName: initialConfig.customerName,
      variableData: allVariables,
    });
  };

  const activeTemplates = templates.filter(t => {
    if (!t.isActive) return false;
    const tUsage = (t as any).usageType;
    if (initialConfig.usageType === 'lead_email') {
      return !tUsage || tUsage === 'client_email' || tUsage === 'lead_email';
    }
    if (initialConfig.usageType) {
      return tUsage === initialConfig.usageType;
    }
    return !tUsage || tUsage === 'client_email';
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
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
          {/* Signature warning */}
          {!signature && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <svg className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
              <div>
                <p className="text-xs font-semibold text-amber-800">No email signature set up</p>
                <p className="text-xs text-amber-700">Go to <strong>Email Sequences → Signature</strong> tab to create your signature before sending.</p>
              </div>
            </div>
          )}

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
            <div className="flex items-center justify-between">
              <Label htmlFor="email-body">Message</Label>
              {isRawHtmlMode && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-2 py-0.5">
                    Full HTML Template
                  </span>
                  <button
                    onClick={() => setShowRawSource(v => !v)}
                    className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                    title={showRawSource ? "Show preview" : "Show HTML source"}
                  >
                    {showRawSource ? <Eye className="h-3 w-3" /> : <Code className="h-3 w-3" />}
                    {showRawSource ? "Preview" : "Source"}
                  </button>
                </div>
              )}
            </div>

            {isRawHtmlMode ? (
              <div>
                {/* Full HTML template mode — isolated preview, raw HTML for sending */}
                <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 mb-2 text-xs text-indigo-700">
                  This is a full HTML email template. It will be sent exactly as designed — the rich text editor is bypassed to preserve all styles, tables, and layout.
                </div>
                {showRawSource ? (
                  <textarea
                    value={rawHtml}
                    onChange={e => setRawHtml(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: 300,
                      fontFamily: 'monospace',
                      fontSize: 11,
                      padding: '8px 10px',
                      border: '1px solid #e5e7eb',
                      borderRadius: 6,
                      resize: 'vertical',
                      background: '#1e1e1e',
                      color: '#d4d4d4',
                    }}
                  />
                ) : (
                  <HtmlPreviewFrame html={rawHtml} minHeight={250} />
                )}
              </div>
            ) : (
              <EmailRichTextEditor
                ref={editorRef}
                content={richBody}
                onChange={setRichBody}
                placeholder="Write your message..."
                className="min-h-[200px]"
              />
            )}
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
