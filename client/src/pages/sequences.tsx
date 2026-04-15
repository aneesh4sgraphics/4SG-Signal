import { useState, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TiptapImage from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronLeft,
  Star,
  Share2,
  HelpCircle,
  MoreHorizontal,
  Mail,
  Plus,
  ArrowDown,
  Clock,
  Trash2,
  MoreVertical,
  Users,
  Settings,
  Edit3,
  Info,
  Play,
  AlertCircle,
  Search,
  CheckCircle2,
  PauseCircle,
  XCircle,
  ChevronDown,
  Zap,
  User,
  Building2,
  Braces,
  Bold,
  Italic,
  ImagePlus,
  Smartphone,
  Monitor,
  Sun,
  Moon,
  Eye,
  Send,
  FlaskConical,
  FileText,
  PenTool,
  Save,
  Loader2,
  Copy,
  Edit2,
  SlidersHorizontal,
} from 'lucide-react';

// ─── US States for filter ─────────────────────────────────────────────────────
const US_STATE_OPTIONS = [
  { abbr: 'AL', name: 'Alabama' }, { abbr: 'AK', name: 'Alaska' },
  { abbr: 'AZ', name: 'Arizona' }, { abbr: 'AR', name: 'Arkansas' },
  { abbr: 'CA', name: 'California' }, { abbr: 'CO', name: 'Colorado' },
  { abbr: 'CT', name: 'Connecticut' }, { abbr: 'DE', name: 'Delaware' },
  { abbr: 'FL', name: 'Florida' }, { abbr: 'GA', name: 'Georgia' },
  { abbr: 'HI', name: 'Hawaii' }, { abbr: 'ID', name: 'Idaho' },
  { abbr: 'IL', name: 'Illinois' }, { abbr: 'IN', name: 'Indiana' },
  { abbr: 'IA', name: 'Iowa' }, { abbr: 'KS', name: 'Kansas' },
  { abbr: 'KY', name: 'Kentucky' }, { abbr: 'LA', name: 'Louisiana' },
  { abbr: 'ME', name: 'Maine' }, { abbr: 'MD', name: 'Maryland' },
  { abbr: 'MA', name: 'Massachusetts' }, { abbr: 'MI', name: 'Michigan' },
  { abbr: 'MN', name: 'Minnesota' }, { abbr: 'MS', name: 'Mississippi' },
  { abbr: 'MO', name: 'Missouri' }, { abbr: 'MT', name: 'Montana' },
  { abbr: 'NE', name: 'Nebraska' }, { abbr: 'NV', name: 'Nevada' },
  { abbr: 'NH', name: 'New Hampshire' }, { abbr: 'NJ', name: 'New Jersey' },
  { abbr: 'NM', name: 'New Mexico' }, { abbr: 'NY', name: 'New York' },
  { abbr: 'NC', name: 'North Carolina' }, { abbr: 'ND', name: 'North Dakota' },
  { abbr: 'OH', name: 'Ohio' }, { abbr: 'OK', name: 'Oklahoma' },
  { abbr: 'OR', name: 'Oregon' }, { abbr: 'PA', name: 'Pennsylvania' },
  { abbr: 'RI', name: 'Rhode Island' }, { abbr: 'SC', name: 'South Carolina' },
  { abbr: 'SD', name: 'South Dakota' }, { abbr: 'TN', name: 'Tennessee' },
  { abbr: 'TX', name: 'Texas' }, { abbr: 'UT', name: 'Utah' },
  { abbr: 'VT', name: 'Vermont' }, { abbr: 'VA', name: 'Virginia' },
  { abbr: 'WA', name: 'Washington' }, { abbr: 'WV', name: 'West Virginia' },
  { abbr: 'WI', name: 'Wisconsin' }, { abbr: 'WY', name: 'Wyoming' },
  { abbr: 'DC', name: 'DC' },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface DripCampaign {
  id: number;
  name: string;
  description?: string | null;
  isActive: boolean;
  triggerType?: string;
  settings?: {
    sendingWindowStart?: string;
    sendingWindowEnd?: string;
    timezone?: string;
    businessDaysOnly?: boolean;
    unsubscribeLinkText?: string;
    threadEmails?: boolean;
    includeSenderSignature?: boolean;
    exitOnReply?: boolean;
  };
  steps?: DripStep[];
  createdAt?: string;
}

interface DripStep {
  id: number;
  campaignId: number;
  stepOrder: number;
  name: string;
  subject: string;
  body: string;
  delayAmount: number;
  delayUnit: string;
  isActive: boolean;
}

interface EnrichedAssignment {
  id: number;
  campaignId: number;
  customerId?: string | null;
  leadId?: number | null;
  status: string;
  currentStepIndex: number;
  enrolledAt?: string;
  name?: string;
  type?: 'lead' | 'customer';
  stepsSent?: number;
  stepsTotal?: number;
}

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  on_purchase: 'On Purchase',
  on_quote: 'On Quote Sent',
  on_signup: 'On Sign-up',
};

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'America/New_Y...' },
  { value: 'America/Chicago', label: 'America/Chicago' },
  { value: 'America/Denver', label: 'America/Denver' },
  { value: 'America/Los_Angeles', label: 'America/Los_A...' },
  { value: 'America/Phoenix', label: 'America/Phoenix' },
  { value: 'UTC', label: 'UTC' },
];

const UNSUB_OPTIONS = [
  { value: 'Stop hearing from me', label: 'Stop hearing from me' },
  { value: 'Unsubscribe', label: 'Unsubscribe' },
  { value: 'Opt-out', label: 'Opt-out' },
  { value: 'None', label: 'None' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function delayLabel(amount: number, unit: string): string {
  if (amount === 0) return 'immediately';
  return `${amount} ${amount === 1 ? unit.replace(/s$/, '') : unit}`;
}

function statusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-100 text-green-700 border-0">Active</Badge>;
    case 'paused':
      return <Badge className="bg-yellow-100 text-yellow-700 border-0">Paused</Badge>;
    case 'completed':
      return <Badge className="bg-blue-100 text-blue-700 border-0">Completed</Badge>;
    case 'cancelled':
      return <Badge className="bg-gray-100 text-gray-600 border-0">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ─── Available template variables ─────────────────────────────────────────────
const TEMPLATE_VARIABLES = [
  { label: 'First Name',     token: '{{First Name}}',     group: 'Contact' },
  { label: 'Last Name',      token: '{{Last Name}}',      group: 'Contact' },
  { label: 'Full Name',      token: '{{Full Name}}',      group: 'Contact' },
  { label: 'Email',          token: '{{Email}}',          group: 'Contact' },
  { label: 'Company',        token: '{{Company}}',        group: 'Contact' },
  { label: 'Sales Rep Name', token: '{{Sales Rep Name}}', group: 'Sender' },
  { label: 'Unsubscribe Link', token: '{{Unsubscribe Link}}', group: 'Sender' },
];

// ─── Step Card ────────────────────────────────────────────────────────────────
function StepCard({
  step,
  index,
  onUpdate,
  onDelete,
}: {
  step: DripStep;
  index: number;
  onUpdate: (id: number, data: Partial<DripStep>) => void;
  onDelete: (id: number) => void;
}) {
  const [subject, setSubject] = useState(step.subject || '');
  const [showVars, setShowVars] = useState(false);
  const [showImagePanel, setShowImagePanel] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [activeField, setActiveField] = useState<'subject' | 'body'>('body');
  const [isImageSelected, setIsImageSelected] = useState(false);
  const [bodyMode, setBodyMode] = useState<'visual' | 'html'>('visual');
  const [htmlBody, setHtmlBody] = useState(step.body || '');

  const subjectRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setSubject(step.subject || ''); }, [step.subject]);

  // ── TipTap rich-text editor ───────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, blockquote: false }),
      TiptapImage.configure({ allowBase64: true, inline: false }),
      Placeholder.configure({ placeholder: 'Start typing your email…' }),
    ],
    content: step.body || '',
    onFocus: () => { setActiveField('body'); setShowVars(false); },
    onBlur: ({ editor: ed }) => {
      const html = ed.getHTML();
      if (html !== (step.body || '')) onUpdate(step.id, { body: html });
    },
  });

  // Sync external changes (e.g. server update) into editor
  useEffect(() => {
    if (bodyMode === 'html') {
      setHtmlBody(step.body || '');
      return;
    }
    if (editor && !editor.isFocused) {
      const current = editor.getHTML();
      if (current !== (step.body || '')) {
        editor.commands.setContent(step.body || '', false);
      }
    }
  }, [step.body]);

  // Track whether an image node is selected
  useEffect(() => {
    if (!editor) return;
    const update = () => setIsImageSelected(editor.isActive('image'));
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
    };
  }, [editor]);

  // ── Variable insertion ────────────────────────────────────────────────────
  function insertVariable(token: string) {
    if (activeField === 'subject' && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      const newVal = subject.slice(0, start) + token + subject.slice(end);
      setSubject(newVal);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
      onUpdate(step.id, { subject: newVal });
    } else if (editor) {
      editor.chain().focus().insertContent(token).run();
      onUpdate(step.id, { body: editor.getHTML() });
    }
    setShowVars(false);
  }

  // ── Image helpers ─────────────────────────────────────────────────────────
  function insertImageUrl() {
    if (!imageUrl.trim() || !editor) return;
    editor.chain().focus().setImage({ src: imageUrl.trim() }).run();
    onUpdate(step.id, { body: editor.getHTML() });
    setImageUrl('');
    setShowImagePanel(false);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      editor.chain().focus().setImage({ src }).run();
      onUpdate(step.id, { body: editor.getHTML() });
      setShowImagePanel(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function resizeSelectedImage(width: string) {
    if (!editor) return;
    const { state, view } = editor;
    const { selection } = state;
    const node = state.doc.nodeAt(selection.from);
    if (node?.type.name === 'image') {
      const attrs = { ...node.attrs, width };
      view.dispatch(state.tr.setNodeMarkup(selection.from, undefined, attrs));
      setTimeout(() => onUpdate(step.id, { body: editor.getHTML() }), 0);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-indigo-100 flex items-center justify-center">
            <Mail className="h-3 w-3 text-indigo-600" />
          </div>
          <span className="text-sm font-medium text-gray-700">Step {index + 1}</span>
          <span className="text-sm text-gray-400">Automated email</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Variables button */}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 gap-1"
              onClick={() => setShowVars(v => !v)}
            >
              <Braces className="h-3.5 w-3.5" />
              Variables
            </Button>
            {showVars && (
              <div className="absolute right-0 top-8 z-50 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                <p className="px-3 py-1.5 text-[10px] font-semibold tracking-wider text-gray-400 uppercase border-b border-gray-100">
                  Insert variable — active field: {activeField}
                </p>
                {['Contact', 'Sender'].map(group => (
                  <div key={group}>
                    <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{group}</p>
                    {TEMPLATE_VARIABLES.filter(v => v.group === group).map(v => (
                      <button
                        key={v.token}
                        className="w-full text-left flex items-center justify-between px-3 py-1.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                        onMouseDown={e => { e.preventDefault(); insertVariable(v.token); }}
                      >
                        <span>{v.label}</span>
                        <code className="text-[10px] text-gray-400 font-mono">{v.token}</code>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreVertical className="h-4 w-4 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-500" onClick={() => onDelete(step.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Remove step
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Subject */}
      <div className="flex items-center px-4 py-2.5 border-b border-gray-100">
        <span className="text-xs font-medium text-gray-400 w-14 shrink-0">Subject</span>
        <input
          ref={subjectRef}
          type="text"
          className="flex-1 text-sm text-gray-800 bg-transparent outline-none placeholder:text-gray-300"
          placeholder="Enter email subject…"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          onFocus={() => { setActiveField('subject'); setShowVars(false); }}
          onBlur={() => {
            if (subject !== (step.subject || '')) onUpdate(step.id, { subject });
          }}
        />
      </div>

      {/* Formatting toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-gray-50/60">
        <div className="flex items-center gap-0.5">
          {bodyMode === 'visual' && (<>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBold().run(); }}
            className={`h-6 w-6 flex items-center justify-center rounded text-xs font-bold transition-colors ${
              editor?.isActive('bold') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
            title="Bold (Ctrl+B)"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleItalic().run(); }}
            className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
              editor?.isActive('italic') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
            title="Italic (Ctrl+I)"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); setShowImagePanel(v => !v); }}
            className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
              showImagePanel ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
            title="Insert image"
          >
            <ImagePlus className="h-3.5 w-3.5" />
          </button>
          </>)}
        </div>
        {/* Visual / HTML toggle — always shown, pinned right */}
        <div style={{ display: 'flex', border: '0.5px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
          <button
            type="button"
            title={isFullHtmlDoc(htmlBody) ? 'Full HTML document — Visual editing disabled' : 'Switch to Visual editor'}
            onMouseDown={e => {
              e.preventDefault();
              if (bodyMode === 'visual') return;
              if (isFullHtmlDoc(htmlBody)) return;
              editor?.commands.setContent(extractBodyContent(htmlBody), false);
              setBodyMode('visual');
            }}
            style={{
              padding: '2px 8px', fontSize: '11px', fontWeight: 500, border: 'none',
              cursor: isFullHtmlDoc(htmlBody) ? 'not-allowed' : 'pointer',
              background: bodyMode === 'visual' ? '#1a1a1a' : 'transparent',
              color: bodyMode === 'visual' ? '#fff' : (isFullHtmlDoc(htmlBody) ? '#d1d5db' : '#9ca3af'),
              opacity: isFullHtmlDoc(htmlBody) ? 0.5 : 1,
            }}
          >
            Visual
          </button>
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); if (bodyMode !== 'html') { setHtmlBody(editor?.getHTML() || ''); setBodyMode('html'); } }}
            style={{ padding: '2px 8px', fontSize: '11px', fontWeight: 500, border: 'none', cursor: 'pointer', background: bodyMode === 'html' ? '#1a1a1a' : 'transparent', color: bodyMode === 'html' ? '#fff' : '#9ca3af' }}
          >
            {'</>'} HTML
          </button>
        </div>
      </div>

      {/* Image insert panel */}
      {showImagePanel && (
        <div className="px-4 py-2.5 border-b border-gray-100 bg-indigo-50/40 flex items-center gap-2">
          <input
            type="text"
            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white outline-none focus:border-indigo-400"
            placeholder="Paste image URL…"
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') insertImageUrl(); if (e.key === 'Escape') setShowImagePanel(false); }}
            autoFocus
          />
          <Button size="sm" className="h-7 text-xs px-3" onClick={insertImageUrl} disabled={!imageUrl.trim()}>
            Insert
          </Button>
          <span className="text-xs text-gray-400">or</span>
          <label
            htmlFor={`img-upload-${step.id}`}
            className="h-7 text-xs px-3 inline-flex items-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground cursor-pointer select-none font-medium transition-colors"
          >
            Upload
          </label>
          <input id={`img-upload-${step.id}`} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          <button
            type="button"
            className="text-gray-400 hover:text-gray-600 ml-1"
            onClick={() => setShowImagePanel(false)}
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Image resize bar — appears when an image is selected in the editor */}
      {isImageSelected && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-indigo-100 bg-indigo-50/50">
          <span className="text-[10px] text-indigo-500 font-semibold uppercase tracking-wide mr-1">Image size:</span>
          {[
            { label: 'Small', width: '180px' },
            { label: 'Medium', width: '360px' },
            { label: 'Large', width: '540px' },
            { label: 'Full width', width: '100%' },
          ].map(({ label, width }) => (
            <button
              key={label}
              type="button"
              onMouseDown={e => { e.preventDefault(); resizeSelectedImage(width); }}
              className="px-2 py-0.5 rounded text-xs font-medium bg-white border border-indigo-200 hover:bg-indigo-100 hover:border-indigo-400 hover:text-indigo-700 text-gray-600 transition-colors shadow-sm"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Body — visual or raw HTML */}
      <div className="px-4 py-3">
        {bodyMode === 'visual' ? (
          <EditorContent editor={editor} />
        ) : (
          <div>
            <textarea
              value={htmlBody}
              onChange={e => {
                setHtmlBody(e.target.value);
                onUpdate(step.id, { body: e.target.value });
              }}
              placeholder={`Paste your HTML email code here...\n\nExample:\n<!DOCTYPE html>\n<html>\n<body style="font-family: Arial, sans-serif;">\n  <h1>Hello {{firstName}}!</h1>\n  <p>Your message here.</p>\n</body>\n</html>`}
              style={{
                width: '100%',
                minHeight: '280px',
                fontFamily: 'monospace',
                fontSize: '12px',
                lineHeight: '1.6',
                padding: '10px',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                background: '#fafafa',
                color: '#1f2937',
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              spellCheck={false}
            />
            <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>
              Paste HTML from Designmodo, Stripo, or any email builder. Variables like {'{{firstName}}'} work in HTML too.
            </p>
          </div>
        )}
      </div>

      {/* Click-outside overlay to close panels */}
      {(showVars || showImagePanel) && (
        <div className="fixed inset-0 z-40" onClick={() => { setShowVars(false); setShowImagePanel(false); }} />
      )}
    </div>
  );
}

// ─── Signature Tab ────────────────────────────────────────────────────────────
const FOUR_S_LOGO_URL = `${window.location.origin}/4s-logo.png`;

function buildFourSSignatureHtml(name: string, cellPhone: string): string {
  const escapedName = (name || 'Your Name').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapedPhone = (cellPhone || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cellLine = escapedPhone
    ? `<div style="font-weight: bold; margin-bottom: 4px; color: #22963e;">C: ${escapedPhone}</div>`
    : '';
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5;">
  <img src="${FOUR_S_LOGO_URL}" alt="4S Graphics" style="width: 60px; height: auto; margin-bottom: 6px; display: block;" />
  <div style="font-weight: bold; margin-bottom: 10px; color: #333;">Synthetic &amp; Specialty Substrates Suppliers</div>
  <div style="margin-bottom: 6px; color: #333;">-</div>
  <div style="font-weight: bold; margin-bottom: 4px; color: #333;">${escapedName}</div>
  ${cellLine}
  <div style="font-weight: bold; margin-bottom: 4px; color: #333;">T. (954) 493.6484 x 101</div>
  <div style="margin-bottom: 4px; color: #333;">764 NW 57th Court, Fort Lauderdale, FL - 33309</div>
  <div><a href="https://www.4sgraphics.com" style="color: #22963e; text-decoration: none;">www.4sgraphics.com</a></div>
</div>`;
}

function SignatureTab() {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', cellPhone: '', signatureHtml: '' });
  const [preview, setPreview] = useState(false);

  const { data: sig, isLoading } = useQuery<any | null>({
    queryKey: ['/api/email/signature'],
  });

  useEffect(() => {
    if (sig) {
      setForm({
        name: sig.name || '',
        cellPhone: sig.cellPhone || '',
        signatureHtml: sig.signatureHtml || '',
      });
    }
  }, [sig]);

  const saveSig = useMutation({
    mutationFn: () => apiRequest('POST', '/api/email/signature', { ...form }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email/signature'] });
      toast({ title: 'Signature saved' });
    },
    onError: () => toast({ title: 'Failed to save signature', variant: 'destructive' }),
  });

  const deleteSig = useMutation({
    mutationFn: () => apiRequest('DELETE', '/api/email/signature'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email/signature'] });
      setForm({ name: '', cellPhone: '', signatureHtml: '' });
      toast({ title: 'Signature removed' });
    },
    onError: () => toast({ title: 'Failed to remove signature', variant: 'destructive' }),
  });

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-gray-900">Email Signature</h2>
        <p className="text-xs text-gray-500 mt-0.5">Your signature is automatically appended to every email you send. It must be configured before sending.</p>
      </div>

      {/* Alert if no signature */}
      {!isLoading && !sig && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-white text-xs font-bold">!</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-800">No signature set up yet</p>
            <p className="text-xs text-amber-700 mt-0.5">Fill in your name and cell phone below, then click "Generate Signature" to create your branded 4S Graphics email footer.</p>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        {/* Name + Cell */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">Your name <span className="text-red-500">*</span></p>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Aneesh Prabhu" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">Cell phone <span className="text-xs text-gray-400">(shown in green)</span></p>
            <Input value={form.cellPhone} onChange={e => setForm(f => ({ ...f, cellPhone: e.target.value }))} placeholder="e.g. (260) 580.0526" />
            <p className="text-[10px] text-gray-400 mt-1">Leave blank to hide from signature.</p>
          </div>
        </div>

        {/* Generate button */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!form.name}
            className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
            onClick={() => setForm(f => ({ ...f, signatureHtml: buildFourSSignatureHtml(f.name, f.cellPhone) }))}
          >
            <Zap className="h-3.5 w-3.5" />
            Generate 4S Graphics Signature
          </Button>
          <p className="text-xs text-gray-400">Builds branded footer with logo, office phone & address.</p>
        </div>

        {/* Preview */}
        {form.signatureHtml && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-700">Signature preview</p>
              <button onClick={() => setPreview(p => !p)} className="text-xs text-indigo-600 hover:underline">
                {preview ? 'Hide' : 'Show'} preview
              </button>
            </div>
            {preview && (
              <div
                className="bg-white border border-gray-200 rounded-lg p-5"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(form.signatureHtml || '') }}
              />
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          {sig && (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-600 hover:bg-red-50 gap-1.5"
              disabled={deleteSig.isPending}
              onClick={() => {
                if (window.confirm('Delete this email signature? This cannot be undone.')) {
                  deleteSig.mutate();
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove signature
            </Button>
          )}
          <div className="ml-auto">
            <Button
              size="sm"
              disabled={!form.name || !form.signatureHtml || saveSig.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
              onClick={() => saveSig.mutate()}
            >
              {saveSig.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Signature
            </Button>
          </div>
        </div>
      </div>

      {/* Example of what it looks like */}
      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-medium text-gray-500 mb-3">What your signature will look like in emails:</p>
        <div
          className="bg-white rounded-lg p-4 border border-gray-100"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(buildFourSSignatureHtml(form.name || 'Your Name', form.cellPhone)),
          }}
        />
      </div>
    </div>
  );
}

// ─── Templates Tab ────────────────────────────────────────────────────────────
const TEMPLATE_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'product_info', label: 'Product Info' },
  { value: 'account_payments', label: 'Account/Payments' },
  { value: 'other', label: 'Other' },
];

const TEMPLATE_VARS = [
  { label: '{{client.first_name}}', token: '{{client.first_name}}' },
  { label: '{{client.last_name}}', token: '{{client.last_name}}' },
  { label: '{{client.name}}', token: '{{client.name}}' },
  { label: '{{client.company}}', token: '{{client.company}}' },
  { label: '{{client.email}}', token: '{{client.email}}' },
  { label: '{{user.name}}', token: '{{user.name}}' },
];

function isFullHtmlDoc(html: string): boolean {
  const t = (html || '').trim().toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html');
}

function extractBodyContent(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1].trim() : html;
}

function TemplateBodyEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const [showImagePanel, setShowImagePanel] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [isImageSelected, setIsImageSelected] = useState(false);
  const [bodyMode, setBodyMode] = useState<'visual' | 'html'>(() => isFullHtmlDoc(value) ? 'html' : 'visual');
  const [htmlBody, setHtmlBody] = useState(value || '');
  const [showPreview, setShowPreview] = useState(false);
  const uploadId = useRef(`tpl-upload-${Math.random().toString(36).slice(2)}`);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, blockquote: false }),
      TiptapImage.configure({ allowBase64: true, inline: false }),
      Placeholder.configure({ placeholder: 'Write your email body here…' }),
    ],
    content: value || '',
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });

  useEffect(() => {
    if (bodyMode === 'html') {
      // In HTML mode: keep htmlBody in sync with value, never touch Tiptap
      setHtmlBody(value || '');
      return;
    }
    if (editor && !editor.isFocused) {
      const current = editor.getHTML();
      if (current !== (value || '')) editor.commands.setContent(value || '', false);
    }
  }, [value]);

  useEffect(() => {
    if (!editor) return;
    const update = () => setIsImageSelected(editor.isActive('image'));
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    return () => { editor.off('selectionUpdate', update); editor.off('transaction', update); };
  }, [editor]);

  function insertImageUrl() {
    if (!imageUrl.trim() || !editor) return;
    editor.chain().focus().setImage({ src: imageUrl.trim() }).run();
    onChange(editor.getHTML());
    setImageUrl('');
    setShowImagePanel(false);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    const reader = new FileReader();
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result as string }).run();
      setTimeout(() => onChange(editor.getHTML()), 0);
      setShowImagePanel(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-gray-50/60">
        <div className="flex items-center gap-0.5">
          {bodyMode === 'visual' && (<>
          <button type="button" onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleBold().run(); }}
            className={`h-6 w-6 flex items-center justify-center rounded text-xs font-bold transition-colors ${editor?.isActive('bold') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
            title="Bold">
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button type="button" onMouseDown={e => { e.preventDefault(); editor?.chain().focus().toggleItalic().run(); }}
            className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${editor?.isActive('italic') ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
            title="Italic">
            <Italic className="h-3.5 w-3.5" />
          </button>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <button type="button" onMouseDown={e => { e.preventDefault(); setShowImagePanel(v => !v); }}
            className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${showImagePanel ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
            title="Insert image">
            <ImagePlus className="h-3.5 w-3.5" />
          </button>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="h-6 px-1.5 flex items-center gap-1 rounded text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors">
                <Braces className="h-3.5 w-3.5" />
                <span className="text-[11px]">Variables</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {TEMPLATE_VARS.map(v => (
                <DropdownMenuItem key={v.token} className="text-xs font-mono" onSelect={() => editor?.chain().focus().insertContent(v.token).run()}>
                  {v.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          </>)}
        </div>
        {/* Visual / HTML toggle — always pinned right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {bodyMode === 'html' && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); setShowPreview(v => !v); }}
              title="Toggle preview"
              style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 8px', fontSize: '11px', fontWeight: 500, border: '0.5px solid #e5e7eb', borderRadius: '6px', cursor: 'pointer', background: showPreview ? '#e0e7ff' : 'transparent', color: showPreview ? '#4f46e5' : '#9ca3af' }}
            >
              <Eye style={{ width: '12px', height: '12px' }} /> Preview
            </button>
          )}
          <div style={{ display: 'flex', border: '0.5px solid #e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
            <button
              type="button"
              title={isFullHtmlDoc(htmlBody) ? 'Full HTML document — Visual editing disabled' : 'Switch to Visual editor'}
              onMouseDown={e => {
                e.preventDefault();
                if (bodyMode === 'visual') return;
                if (isFullHtmlDoc(htmlBody)) return; // block Visual for full docs
                editor?.commands.setContent(extractBodyContent(htmlBody), false); // false = don't fire onUpdate
                setBodyMode('visual');
              }}
              style={{
                padding: '2px 8px', fontSize: '11px', fontWeight: 500, border: 'none', cursor: isFullHtmlDoc(htmlBody) ? 'not-allowed' : 'pointer',
                background: bodyMode === 'visual' ? '#1a1a1a' : 'transparent',
                color: bodyMode === 'visual' ? '#fff' : (isFullHtmlDoc(htmlBody) ? '#d1d5db' : '#9ca3af'),
                opacity: isFullHtmlDoc(htmlBody) ? 0.5 : 1,
              }}
            >
              Visual
            </button>
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); if (bodyMode !== 'html') { setHtmlBody(editor?.getHTML() || ''); setBodyMode('html'); setShowPreview(false); } }}
              style={{ padding: '2px 8px', fontSize: '11px', fontWeight: 500, border: 'none', cursor: 'pointer', background: bodyMode === 'html' ? '#1a1a1a' : 'transparent', color: bodyMode === 'html' ? '#fff' : '#9ca3af' }}
            >
              {'</>'} HTML
            </button>
          </div>
        </div>
      </div>

      {/* Image panel */}
      {showImagePanel && (
        <div className="px-4 py-2.5 border-b border-gray-100 bg-indigo-50/40 flex items-center gap-2">
          <input type="text" className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 bg-white outline-none focus:border-indigo-400"
            placeholder="Paste image URL…" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') insertImageUrl(); if (e.key === 'Escape') setShowImagePanel(false); }} autoFocus />
          <Button size="sm" className="h-7 text-xs px-3" onClick={insertImageUrl} disabled={!imageUrl.trim()}>Insert</Button>
          <span className="text-xs text-gray-400">or</span>
          <label htmlFor={uploadId.current} className="h-7 text-xs px-3 inline-flex items-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground cursor-pointer select-none font-medium transition-colors">
            Upload
          </label>
          <input id={uploadId.current} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          <button type="button" className="text-gray-400 hover:text-gray-600 ml-1" onClick={() => setShowImagePanel(false)}>
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Image resize bar */}
      {isImageSelected && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-b border-indigo-100 bg-indigo-50/50">
          <span className="text-[10px] text-indigo-500 font-semibold uppercase tracking-wide mr-1">Image size:</span>
          {[{ label: 'Small', width: '180px' }, { label: 'Medium', width: '360px' }, { label: 'Large', width: '540px' }, { label: 'Full width', width: '100%' }].map(({ label, width }) => (
            <button key={label} type="button"
              onMouseDown={e => {
                e.preventDefault();
                if (!editor) return;
                const { state, view } = editor;
                const node = state.doc.nodeAt(state.selection.from);
                if (node?.type.name === 'image') {
                  view.dispatch(state.tr.setNodeMarkup(state.selection.from, undefined, { ...node.attrs, width }));
                  setTimeout(() => onChange(editor.getHTML()), 0);
                }
              }}
              className="px-2 py-0.5 rounded text-xs font-medium bg-white border border-indigo-200 hover:bg-indigo-100 hover:border-indigo-400 hover:text-indigo-700 text-gray-600 transition-colors shadow-sm">
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Editor area */}
      {bodyMode === 'visual' ? (
        <div className="px-4 py-3 min-h-[180px] prose prose-sm max-w-none">
          <EditorContent editor={editor} />
        </div>
      ) : (
        <div className="px-4 py-3 space-y-3">
          {/* Full-doc notice */}
          {isFullHtmlDoc(htmlBody) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '11px', color: '#92400e' }}>
              <span style={{ fontWeight: 600 }}>Full HTML document detected</span> — stored as-is, Visual mode disabled to preserve {'<head>'} styles.
            </div>
          )}
          <textarea
            value={htmlBody}
            onChange={e => { setHtmlBody(e.target.value); onChange(e.target.value); }}
            placeholder={`Paste your full HTML email here (Canva, Mailchimp, etc.)...\n\n<!DOCTYPE html>\n<html>\n<head>\n  <style>/* your styles */</style>\n</head>\n<body>\n  ...\n</body>\n</html>`}
            style={{
              width: '100%',
              minHeight: '240px',
              fontFamily: 'monospace',
              fontSize: '12px',
              lineHeight: '1.6',
              padding: '10px',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              background: '#fafafa',
              color: '#1f2937',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            spellCheck={false}
          />
          <p style={{ fontSize: '11px', color: '#9ca3af' }}>
            Full HTML documents (including {'<head>/<style>'}) are stored exactly as pasted. Variables like {'{{client.firstName}}'} work inside HTML too.
          </p>
          {/* Isolated iframe preview */}
          {showPreview && htmlBody.trim() && (
            <div>
              <p style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>Preview (isolated, no app CSS)</p>
              <iframe
                srcDoc={htmlBody}
                title="HTML email preview"
                style={{ width: '100%', height: '500px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff' }}
                sandbox="allow-same-origin"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TemplatesTab({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [showEditor, setShowEditor] = useState(false);
  const [editingTpl, setEditingTpl] = useState<any | null>(null);
  const [toDelete, setToDelete] = useState<any | null>(null);
  const [previewTpl, setPreviewTpl] = useState<any | null>(null);
  const [tplSearch, setTplSearch] = useState('');
  const [form, setForm] = useState({
    name: '', description: '', subject: '', body: '', category: 'general',
  });

  const resetForm = () => setForm({ name: '', description: '', subject: '', body: '', category: 'general' });

  const { data: templates = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/email/templates'],
  });

  const createTpl = useMutation({
    mutationFn: () => apiRequest('POST', '/api/email/templates', { ...form, variables: [], usageType: 'client_email' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email/templates'] });
      setShowEditor(false); resetForm();
      toast({ title: 'Template created' });
    },
    onError: () => toast({ title: 'Failed to create template', variant: 'destructive' }),
  });

  const updateTpl = useMutation({
    mutationFn: () => apiRequest('PATCH', `/api/email/templates/${editingTpl?.id}`, { ...form, variables: [] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email/templates'] });
      setShowEditor(false); setEditingTpl(null); resetForm();
      toast({ title: 'Template updated' });
    },
    onError: () => toast({ title: 'Failed to update template', variant: 'destructive' }),
  });

  const deleteTpl = useMutation({
    mutationFn: () => apiRequest('DELETE', `/api/email/templates/${toDelete?.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email/templates'] });
      setToDelete(null);
      toast({ title: 'Template deleted' });
    },
    onError: () => toast({ title: 'Failed to delete template', variant: 'destructive' }),
  });

  const openEdit = (tpl: any) => {
    setEditingTpl(tpl);
    setForm({ name: tpl.name, description: tpl.description || '', subject: tpl.subject, body: tpl.body, category: tpl.category || 'general' });
    setShowEditor(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard' });
  };

  const filtered = templates.filter(t =>
    !tplSearch || t.name?.toLowerCase().includes(tplSearch.toLowerCase()) || t.subject?.toLowerCase().includes(tplSearch.toLowerCase())
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Email Templates</h2>
          <p className="text-xs text-gray-500 mt-0.5">Reusable templates for quick sending from lead and contact pages</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
            <Input value={tplSearch} onChange={e => setTplSearch(e.target.value)} placeholder="Search templates…" className="pl-8 h-8 text-sm w-48" />
          </div>
          {isAdmin && (
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5" onClick={() => { setEditingTpl(null); resetForm(); setShowEditor(true); }}>
              <Plus className="h-3.5 w-3.5" />
              New Template
            </Button>
          )}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
          <FileText className="h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">{tplSearch ? 'No templates match your search' : 'No templates yet'}</p>
          {isAdmin && !tplSearch && (
            <Button size="sm" onClick={() => { resetForm(); setShowEditor(true); }}>
              <Plus className="h-4 w-4 mr-1.5" />Create first template
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(tpl => (
            <div key={tpl.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 transition-colors group">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{tpl.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{TEMPLATE_CATEGORIES.find(c => c.value === tpl.category)?.label || 'General'}</p>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={() => setPreviewTpl(tpl)} className="p-1.5 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50" title="Preview">
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => copyToClipboard(tpl.body)} className="p-1.5 rounded-md text-gray-400 hover:text-green-600 hover:bg-green-50" title="Copy body">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  {isAdmin && (
                    <>
                      <button onClick={() => openEdit(tpl)} className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50" title="Edit">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setToDelete(tpl)} className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {tpl.description && <p className="text-xs text-gray-500 mb-2 line-clamp-1">{tpl.description}</p>}
              <div className="bg-gray-50 rounded-lg px-3 py-1.5 text-xs text-gray-600 truncate">
                <span className="text-gray-400 mr-1">Subject:</span>{tpl.subject}
              </div>
              <div className="mt-2">
                <Badge variant={tpl.isActive ? 'default' : 'secondary'} className="text-[10px] h-4 px-1.5">
                  {tpl.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showEditor} onOpenChange={v => { if (!v) { setShowEditor(false); setEditingTpl(null); resetForm(); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTpl ? 'Edit Template' : 'New Email Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Template name *</p>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Product Introduction" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Category</p>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Description (optional)</p>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What is this template for?" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Subject line *</p>
              <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Check out our new {{product.name}}" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Body *</p>
              <TemplateBodyEditor
                value={form.body}
                onChange={html => setForm(f => ({ ...f, body: html }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setShowEditor(false); setEditingTpl(null); resetForm(); }}>Cancel</Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              disabled={!form.name || !form.subject || !form.body || createTpl.isPending || updateTpl.isPending}
              onClick={() => editingTpl ? updateTpl.mutate() : createTpl.mutate()}
            >
              {(createTpl.isPending || updateTpl.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
              {editingTpl ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewTpl} onOpenChange={v => { if (!v) setPreviewTpl(null); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-indigo-500" />
              {previewTpl?.name}
            </DialogTitle>
          </DialogHeader>
          {previewTpl && (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg px-4 py-2.5 text-sm">
                <span className="text-gray-400 text-xs font-medium">Subject: </span>
                <span className="text-gray-800 font-medium">{previewTpl.subject}</span>
              </div>
              {/* Isolated iframe preview — no app CSS, no DOMPurify stripping */}
              {isFullHtmlDoc(previewTpl.body || '') ? (
                <iframe
                  srcDoc={previewTpl.body || ''}
                  title="Email preview"
                  style={{ width: '100%', height: '560px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff' }}
                  sandbox="allow-same-origin"
                />
              ) : (
                <iframe
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:sans-serif;font-size:14px;color:#1f2937;padding:16px;margin:0}img{max-width:100%}</style></head><body>${previewTpl.body || ''}</body></html>`}
                  title="Email preview"
                  style={{ width: '100%', minHeight: '200px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff' }}
                  sandbox="allow-same-origin"
                />
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(previewTpl.body)} className="gap-1.5">
                  <Copy className="h-3.5 w-3.5" />
                  Copy body
                </Button>
                {isAdmin && (
                  <Button size="sm" onClick={() => { openEdit(previewTpl); setPreviewTpl(null); }} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white">
                    <Edit2 className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!toDelete} onOpenChange={v => { if (!v) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.name}" will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteTpl.mutate()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Test Email Dialog ────────────────────────────────────────────────────────
function TestEmailDialog({
  open,
  onClose,
  campaignId,
  steps,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: number;
  steps: DripStep[];
}) {
  const { toast } = useToast();
  const [stepId, setStepId] = useState<number | null>(steps[0]?.id ?? null);
  const [type, setType] = useState<'lead' | 'customer'>('lead');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{ id: string; label: string } | null>(null);
  const [step, setStep] = useState<'pick-contact' | 'confirm'>('pick-contact');

  // Reset when opened
  useEffect(() => {
    if (open) {
      setStepId(steps[0]?.id ?? null);
      setType('lead');
      setSearch('');
      setSelected(null);
      setStep('pick-contact');
    }
  }, [open]);

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: leadsData } = useQuery<any>({
    queryKey: ['/api/leads', 'search', debouncedSearch],
    queryFn: () => fetch(`/api/leads?search=${encodeURIComponent(debouncedSearch)}&limit=40`, { credentials: 'include' }).then(r => r.json()),
    enabled: open && type === 'lead',
  });
  const { data: customersResult } = useQuery<any>({
    queryKey: ['/api/customers', 'search', debouncedSearch],
    queryFn: () => fetch(`/api/customers?paginated=true&search=${encodeURIComponent(debouncedSearch)}&limit=40`, { credentials: 'include' }).then(r => r.json()),
    enabled: open && type === 'customer',
  });
  const leadsResult: any[] = leadsData?.leads ?? (Array.isArray(leadsData) ? leadsData : []);
  const customerList: any[] = customersResult?.data ?? (Array.isArray(customersResult) ? customersResult : []);

  const items = type === 'lead'
    ? leadsResult.map((l: any) => ({ id: String(l.id), label: [l.name || [l.firstName, l.lastName].filter(Boolean).join(' '), l.company].filter(Boolean).join(' — ') }))
    : customerList.map((c: any) => ({ id: String(c.id), label: [[c.firstName, c.lastName].filter(Boolean).join(' '), c.company].filter((i: any) => i != null && String(i).trim()).join(' — ') || c.email || 'Unknown' }));

  const sendTest = useMutation({
    mutationFn: async () => {
      if (!stepId || !selected) throw new Error('Missing step or contact');
      return apiRequest('POST', `/api/drip-campaigns/${campaignId}/steps/${stepId}/test-send`, {
        recipientType: type,
        recipientId: selected.id,
      });
    },
    onSuccess: async (res: any) => {
      const data = await res.json();
      toast({ title: `Test email sent to ${data.sentTo}`, description: 'Check your inbox in a few seconds.' });
      onClose();
    },
    onError: () => toast({ title: 'Failed to send test email', variant: 'destructive' }),
  });

  const selectedStep = steps.find(s => s.id === stepId);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-indigo-500" />
            Send Test Email
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step picker */}
          {steps.length > 1 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Which step to test?</p>
              <div className="flex flex-wrap gap-1.5">
                {steps.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStepId(s.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      stepId === s.id
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400 hover:text-indigo-600'
                    }`}
                  >
                    {s.name || `Step ${s.stepOrder}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Type toggle */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5">Select a contact to preview with their data</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              {(['lead', 'customer'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setType(t); setSelected(null); setSearch(''); }}
                  className={`flex-1 py-1.5 font-medium transition-colors ${
                    type === t ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {t === 'lead' ? 'Lead' : 'Customer'}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${type}s…`}
              className="pl-8 text-sm h-9"
            />
          </div>

          {/* List */}
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
            {items.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No {type}s found</p>
            ) : items.slice(0, 40).map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                  selected?.id === item.id
                    ? 'bg-indigo-50 text-indigo-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {item.label || '(No name)'}
              </button>
            ))}
          </div>

          {/* Selected + info */}
          {selected && (
            <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 text-xs text-green-800">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-green-600" />
              <div>
                <p className="font-medium">{selected.label}</p>
                <p className="text-green-600 mt-0.5">Their name & details will fill in the template. The email will arrive in <strong>your</strong> inbox.</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} size="sm">Cancel</Button>
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
            disabled={!selected || !stepId || sendTest.isPending}
            onClick={() => sendTest.mutate()}
          >
            <Send className="h-3.5 w-3.5" />
            {sendTest.isPending ? 'Sending…' : 'Send to my inbox'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Enroll Dialog ────────────────────────────────────────────────────────────
function EnrollDialog({
  open,
  onClose,
  campaignId,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: number;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<'lead' | 'customer'>('lead');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [stateSearch, setStateSearch] = useState('');
  const [statePopOpen, setStatePopOpen] = useState(false);
  const [filters, setFilters] = useState({
    states: [] as string[],
    stages: [] as string[],
    pricingTiers: [] as string[],
    assignedRep: '',
    lastContactedAfter: '',
    lastContactedBefore: '',
    lastMailerAfter: '',
    lastMailerBefore: '',
    neverMailed: false,
    zipCode: '',
    milesRadius: 50,
  });

  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debouncedZip, setDebouncedZip] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedZip(filters.zipCode), 600);
    return () => clearTimeout(t);
  }, [filters.zipCode]);

  useEffect(() => { setSelected(new Set()); setSearch(''); }, [type]);

  const { data: filterOptions } = useQuery<{ stages: string[]; pricingTiers: string[]; reps: string[] }>({
    queryKey: ['/api/drip-campaigns/filter-options', type],
    queryFn: async () => {
      const res = await fetch(`/api/drip-campaigns/filter-options?type=${type}`);
      return res.json();
    },
    enabled: open,
  });

  const buildParams = () => {
    const p = new URLSearchParams();
    p.set('type', type);
    if (debouncedSearch) p.set('search', debouncedSearch);
    filters.states.forEach(s => p.append('states[]', s));
    filters.stages.forEach(s => p.append('stages[]', s));
    filters.pricingTiers.forEach(t => p.append('pricingTiers[]', t));
    if (filters.assignedRep) p.set('assignedRep', filters.assignedRep);
    if (filters.lastContactedAfter) p.set('lastContactedAfter', filters.lastContactedAfter);
    if (filters.lastContactedBefore) p.set('lastContactedBefore', filters.lastContactedBefore);
    if (filters.neverMailed) p.set('neverMailed', 'true');
    if (filters.lastMailerAfter) p.set('lastMailerAfter', filters.lastMailerAfter);
    if (filters.lastMailerBefore) p.set('lastMailerBefore', filters.lastMailerBefore);
    if (debouncedZip.length === 5 && filters.milesRadius > 0) {
      p.set('zipCode', debouncedZip);
      p.set('milesRadius', String(filters.milesRadius));
    }
    return p.toString();
  };

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: [
      '/api/drip-campaigns/filter-recipients',
      type, debouncedSearch,
      filters.states.join(','), filters.stages.join(','), filters.pricingTiers.join(','),
      filters.assignedRep, filters.lastContactedAfter, filters.lastContactedBefore,
      filters.neverMailed, filters.lastMailerAfter, filters.lastMailerBefore,
      debouncedZip, filters.milesRadius,
    ],
    queryFn: async () => {
      const res = await fetch(`/api/drip-campaigns/filter-recipients?${buildParams()}`);
      return res.json();
    },
    enabled: open,
  });

  const enroll = useMutation({
    mutationFn: async () => {
      const promises = Array.from(selected).map(id => {
        const body = type === 'lead'
          ? { leadId: parseInt(id), campaignId }
          : { customerId: id, campaignId };
        return apiRequest('POST', `/api/drip-campaigns/${campaignId}/assignments`, body);
      });
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns', campaignId, 'assignments', 'enriched'] });
      toast({ title: `${selected.size} contact(s) enrolled` });
      setSelected(new Set());
      onClose();
    },
    onError: () => toast({ title: 'Failed to enroll', variant: 'destructive' }),
  });

  const activeFilterCount = [
    filters.states.length > 0,
    filters.stages.length > 0,
    filters.pricingTiers.length > 0,
    !!filters.assignedRep,
    !!filters.lastContactedAfter || !!filters.lastContactedBefore,
    filters.neverMailed || !!filters.lastMailerAfter || !!filters.lastMailerBefore,
    debouncedZip.length === 5 && filters.milesRadius > 0,
  ].filter(Boolean).length;

  const clearFilters = () => setFilters({
    states: [], stages: [], pricingTiers: [], assignedRep: '',
    lastContactedAfter: '', lastContactedBefore: '',
    lastMailerAfter: '', lastMailerBefore: '',
    neverMailed: false, zipCode: '', milesRadius: 50,
  });

  const toggleState = (abbr: string) =>
    setFilters(f => ({ ...f, states: f.states.includes(abbr) ? f.states.filter(s => s !== abbr) : [...f.states, abbr] }));

  const toggleStage = (stage: string) =>
    setFilters(f => ({ ...f, stages: f.stages.includes(stage) ? f.stages.filter(s => s !== stage) : [...f.stages, stage] }));

  const toggleTier = (tier: string) =>
    setFilters(f => ({ ...f, pricingTiers: f.pricingTiers.includes(tier) ? f.pricingTiers.filter(s => s !== tier) : [...f.pricingTiers, tier] }));

  const allSelectedOnPage = items.length > 0 && items.every((item: any) => selected.has(item.id));
  const toggleSelectAll = () => {
    if (allSelectedOnPage) {
      setSelected(prev => { const n = new Set(prev); items.forEach((item: any) => n.delete(item.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); items.forEach((item: any) => n.add(item.id)); return n; });
    }
  };

  const filteredStateOptions = US_STATE_OPTIONS.filter(s =>
    s.name.toLowerCase().includes(stateSearch.toLowerCase()) ||
    s.abbr.toLowerCase().includes(stateSearch.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-3">
        <DialogHeader className="flex-shrink-0 pb-0">
          <DialogTitle>Enroll Recipients</DialogTitle>
        </DialogHeader>

        {/* Type selector + filter toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {(['lead', 'customer'] as const).map(t => (
            <Button key={t} variant={type === t ? 'default' : 'outline'} size="sm"
              onClick={() => { setType(t); setSelected(new Set()); }}
              className="capitalize h-8 text-xs"
            >
              {t === 'lead' ? <User className="h-3.5 w-3.5 mr-1.5" /> : <Building2 className="h-3.5 w-3.5 mr-1.5" />}
              {t}s
            </Button>
          ))}
          <div className="flex-1" />
          <Button variant={showFilters ? 'default' : 'outline'} size="sm"
            className="h-8 text-xs gap-1.5" onClick={() => setShowFilters(s => !s)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-rose-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] leading-none">
                {activeFilterCount}
              </span>
            )}
          </Button>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-gray-400 hover:text-gray-700" onClick={clearFilters}>
              Clear all
            </Button>
          )}
        </div>

        {/* Search bar */}
        <div className="relative flex-shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search by name, email, or company…" value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9 h-8 text-sm" />
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="border rounded-lg p-3 bg-gray-50 space-y-3 flex-shrink-0 text-xs">

            {/* States */}
            <div className="flex flex-wrap gap-2 items-start">
              <span className="text-gray-500 font-medium pt-1 w-20 flex-shrink-0">State</span>
              <Popover open={statePopOpen} onOpenChange={setStatePopOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    {filters.states.length === 0 ? 'All states' : `${filters.states.length} selected`}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2" align="start">
                  <Input placeholder="Search states…" value={stateSearch}
                    onChange={e => setStateSearch(e.target.value)} className="h-7 text-xs mb-2" />
                  <div className="max-h-52 overflow-y-auto space-y-0.5">
                    {filteredStateOptions.map(s => (
                      <label key={s.abbr} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-100 cursor-pointer">
                        <input type="checkbox" checked={filters.states.includes(s.abbr)}
                          onChange={() => toggleState(s.abbr)} className="rounded" />
                        <span className="text-xs">{s.name} <span className="text-gray-400">({s.abbr})</span></span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              {filters.states.map(abbr => (
                <span key={abbr} className="inline-flex items-center gap-0.5 bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 text-[11px]">
                  {abbr}
                  <button onClick={() => toggleState(abbr)} className="hover:text-blue-900 ml-0.5">×</button>
                </span>
              ))}
            </div>

            {/* Stage (leads only) */}
            {type === 'lead' && filterOptions?.stages && filterOptions.stages.length > 0 && (
              <div className="flex flex-wrap gap-2 items-start">
                <span className="text-gray-500 font-medium pt-1 w-20 flex-shrink-0">Stage</span>
                <div className="flex flex-wrap gap-1">
                  {filterOptions.stages.map(s => (
                    <button key={s} onClick={() => toggleStage(s)}
                      className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${filters.stages.includes(s) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'}`}>
                      {s.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pricing Tier */}
            {filterOptions?.pricingTiers && filterOptions.pricingTiers.length > 0 && (
              <div className="flex flex-wrap gap-2 items-start">
                <span className="text-gray-500 font-medium pt-1 w-20 flex-shrink-0">Tier</span>
                <div className="flex flex-wrap gap-1">
                  {filterOptions.pricingTiers.map(t => (
                    <button key={t} onClick={() => toggleTier(t)}
                      className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${filters.pricingTiers.includes(t) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Assigned Rep */}
            {filterOptions?.reps && filterOptions.reps.length > 0 && (
              <div className="flex gap-2 items-center">
                <span className="text-gray-500 font-medium w-20 flex-shrink-0">Rep</span>
                <Select value={filters.assignedRep || '__all__'}
                  onValueChange={v => setFilters(f => ({ ...f, assignedRep: v === '__all__' ? '' : v }))}>
                  <SelectTrigger className="h-7 text-xs w-48"><SelectValue placeholder="All reps" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All reps</SelectItem>
                    {filterOptions.reps.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Last Contacted */}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-gray-500 font-medium w-20 flex-shrink-0">Last Contacted</span>
              <span className="text-gray-400 text-[11px]">After</span>
              <Input type="date" className="h-7 text-xs w-36" value={filters.lastContactedAfter}
                onChange={e => setFilters(f => ({ ...f, lastContactedAfter: e.target.value }))} />
              <span className="text-gray-400 text-[11px]">Before</span>
              <Input type="date" className="h-7 text-xs w-36" value={filters.lastContactedBefore}
                onChange={e => setFilters(f => ({ ...f, lastContactedBefore: e.target.value }))} />
            </div>

            {/* Last Mailer Sent */}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-gray-500 font-medium w-20 flex-shrink-0">Last Mailer</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={filters.neverMailed}
                  onChange={e => setFilters(f => ({ ...f, neverMailed: e.target.checked }))} className="rounded" />
                <span className="text-[11px] text-gray-600">Never mailed</span>
              </label>
              {!filters.neverMailed && (
                <>
                  <span className="text-gray-400 text-[11px]">After</span>
                  <Input type="date" className="h-7 text-xs w-36" value={filters.lastMailerAfter}
                    onChange={e => setFilters(f => ({ ...f, lastMailerAfter: e.target.value }))} />
                  <span className="text-gray-400 text-[11px]">Before</span>
                  <Input type="date" className="h-7 text-xs w-36" value={filters.lastMailerBefore}
                    onChange={e => setFilters(f => ({ ...f, lastMailerBefore: e.target.value }))} />
                </>
              )}
            </div>

            {/* Near Zip */}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-gray-500 font-medium w-20 flex-shrink-0">Near Zip</span>
              <Input placeholder="e.g. 90210" maxLength={5} className="h-7 text-xs w-24"
                value={filters.zipCode}
                onChange={e => setFilters(f => ({ ...f, zipCode: e.target.value.replace(/\D/g, '').substring(0, 5) }))} />
              <span className="text-gray-400 text-[11px]">within</span>
              <Input type="number" min={1} max={500} className="h-7 text-xs w-16"
                value={filters.milesRadius}
                onChange={e => setFilters(f => ({ ...f, milesRadius: Math.max(1, parseInt(e.target.value) || 50) }))} />
              <span className="text-gray-400 text-[11px]">miles</span>
              {debouncedZip.length === 5 && filters.milesRadius > 0 && (
                <span className="text-blue-600 text-[11px]">↳ within {filters.milesRadius}mi of {debouncedZip}</span>
              )}
            </div>

          </div>
        )}

        {/* Results header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-gray-500">
            {isLoading ? 'Searching…' : `${items.length} result${items.length !== 1 ? 's' : ''}${items.length === 500 ? ' (max 500 shown)' : ''}`}
            {selected.size > 0 && <span className="ml-2 text-indigo-600 font-medium">{selected.size} selected</span>}
          </span>
          {items.length > 0 && (
            <button className="text-xs text-indigo-600 hover:underline" onClick={toggleSelectAll}>
              {allSelectedOnPage ? 'Deselect all' : `Select all ${items.length}`}
            </button>
          )}
        </div>

        {/* Results list */}
        <div className="border rounded-lg flex-1 overflow-y-auto divide-y min-h-0" style={{ maxHeight: '260px' }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No results</p>
          ) : (
            items.map((item: any) => (
              <label key={item.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={selected.has(item.id)}
                  onChange={e => {
                    const n = new Set(selected);
                    e.target.checked ? n.add(item.id) : n.delete(item.id);
                    setSelected(n);
                  }}
                  className="rounded flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-gray-800 truncate">{item.label}</p>
                  {item.sublabel && <p className="text-[11px] text-gray-400 truncate">{item.sublabel}</p>}
                </div>
              </label>
            ))
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={selected.size === 0 || enroll.isPending} onClick={() => enroll.mutate()}>
            {enroll.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            Enroll {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Sequence Dialog ───────────────────────────────────────────────────────
function NewSequenceDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: () => apiRequest('POST', '/api/drip-campaigns', { name: name || 'Untitled Sequence', isActive: false, triggerType: 'manual' }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns'] });
      onCreated(data.id);
      setName('');
      onClose();
    },
    onError: () => toast({ title: 'Failed to create sequence', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Sequence</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="e.g. CliQ Aqueous Products – New Customer Intro"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && create.mutate()}
          autoFocus
        />
        <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
          Use the format <span className="font-medium text-gray-500">[Product / Campaign] – [Audience or Stage]</span> so you can instantly tell who this sequence targets and why. A clear name makes it easy to enroll the right people and track results.
        </p>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SequencesPage() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'recipients' | 'settings'>('editor');
  const [mainView, setMainView] = useState<'sequences' | 'templates' | 'signature'>('sequences');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [addingStep, setAddingStep] = useState(false);
  const [newStepName, setNewStepName] = useState('');

  // Preview & test-email modal state
  const [showPreview, setShowPreview] = useState(false);
  const [previewStepId, setPreviewStepId] = useState<number | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [showTestEmail, setShowTestEmail] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: campaigns = [], isLoading } = useQuery<DripCampaign[]>({
    queryKey: ['/api/drip-campaigns'],
  });

  const { data: currentSeq } = useQuery<DripCampaign>({
    queryKey: ['/api/drip-campaigns', selectedId],
    enabled: selectedId !== null,
  });

  const { data: enrichedAssignments = [] } = useQuery<EnrichedAssignment[]>({
    queryKey: ['/api/drip-campaigns', selectedId, 'assignments', 'enriched'],
    queryFn: async () => {
      const res = await fetch(`/api/drip-campaigns/${selectedId}/assignments/enriched`);
      return res.json();
    },
    enabled: selectedId !== null,
  });

  // Local settings state (right panel), synced when campaign loads
  const [localSettings, setLocalSettings] = useState<NonNullable<DripCampaign['settings']>>({
    sendingWindowStart: '09:00',
    sendingWindowEnd: '17:00',
    timezone: 'America/New_York',
    businessDaysOnly: true,
    unsubscribeLinkText: 'Stop hearing from me',
    threadEmails: true,
    includeSenderSignature: true,
    exitOnReply: true,
  });

  useEffect(() => {
    if (currentSeq?.settings) {
      setLocalSettings(s => ({ ...s, ...currentSeq.settings }));
    }
  }, [currentSeq?.id]);

  // Name/description inline editing
  const [localName, setLocalName] = useState('');
  const [localDesc, setLocalDesc] = useState('');
  useEffect(() => {
    if (currentSeq) {
      setLocalName(currentSeq.name);
      setLocalDesc(currentSeq.description || '');
    }
  }, [currentSeq?.id]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updateCampaign = useMutation({
    mutationFn: (data: Partial<DripCampaign>) =>
      apiRequest('PATCH', `/api/drip-campaigns/${selectedId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns'] }),
    onError: () => toast({ title: 'Save failed', variant: 'destructive' }),
  });

  const deleteCampaign = useMutation({
    mutationFn: () => apiRequest('DELETE', `/api/drip-campaigns/${selectedId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns'] });
      setSelectedId(null);
      toast({ title: 'Sequence deleted' });
    },
    onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
  });

  const createStep = useMutation({
    mutationFn: (data: any) => apiRequest('POST', `/api/drip-campaigns/${selectedId}/steps`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns', selectedId] });
      setAddingStep(false);
      setNewStepName('');
    },
    onError: () => toast({ title: 'Failed to add step', variant: 'destructive' }),
  });

  const updateStep = useMutation({
    mutationFn: ({ stepId, data }: { stepId: number; data: Partial<DripStep> }) =>
      apiRequest('PATCH', `/api/drip-campaigns/${selectedId}/steps/${stepId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns', selectedId] }),
    onError: () => toast({ title: 'Failed to update step', variant: 'destructive' }),
  });

  const deleteStep = useMutation({
    mutationFn: (stepId: number) =>
      apiRequest('DELETE', `/api/drip-campaigns/${selectedId}/steps/${stepId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns', selectedId] }),
    onError: () => toast({ title: 'Failed to delete step', variant: 'destructive' }),
  });

  const updateAssignment = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest('PATCH', `/api/drip-campaigns/assignments/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns', selectedId, 'assignments', 'enriched'] }),
  });

  // ── Settings save helper ──────────────────────────────────────────────────
  function saveSettings(patch: NonNullable<DripCampaign['settings']>) {
    const merged = { ...localSettings, ...patch };
    setLocalSettings(merged);
    updateCampaign.mutate({ settings: merged });
  }

  const steps = (currentSeq?.steps || []).sort((a, b) => a.stepOrder - b.stepOrder);

  // ─────────────────────────────────────────────────────────────────────────
  // LIST VIEW
  // ─────────────────────────────────────────────────────────────────────────
  if (!selectedId) {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-indigo-500" />
              <h1 className="text-lg font-semibold text-gray-900">Email Sequences</h1>
            </div>
            {/* View toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setMainView('sequences')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${mainView === 'sequences' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Sequences
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${mainView === 'sequences' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-400'}`}>{campaigns.length}</span>
              </button>
              <button
                onClick={() => setMainView('templates')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${mainView === 'templates' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Templates
              </button>
              <button
                onClick={() => setMainView('signature')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${mainView === 'signature' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Signature
              </button>
            </div>
          </div>
          {mainView === 'sequences' && (
            <Button
              size="sm"
              onClick={() => setShowNewDialog(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              New Sequence
            </Button>
          )}
        </div>

        {/* Templates View */}
        {mainView === 'templates' && (
          <div className="flex-1 overflow-auto">
            <TemplatesTab isAdmin={true} />
          </div>
        )}

        {/* Signature View */}
        {mainView === 'signature' && (
          <div className="flex-1 overflow-auto">
            <SignatureTab />
          </div>
        )}

        {/* Table */}
        {mainView === 'sequences' && (
        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Loading…</div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
                <Zap className="h-6 w-6 text-indigo-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">No sequences yet</p>
              <p className="text-xs text-gray-400">Create your first automated email sequence</p>
              <Button size="sm" onClick={() => setShowNewDialog(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                New Sequence
              </Button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Trigger</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Steps</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {campaigns.map(c => (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => { setSelectedId(c.id); setActiveTab('editor'); }}
                    >
                      <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {TRIGGER_LABELS[c.triggerType || 'manual'] || c.triggerType}
                      </td>
                      <td className="px-4 py-3">
                        {c.isActive
                          ? <Badge className="bg-green-100 text-green-700 border-0 text-xs">Active</Badge>
                          : <Badge className="bg-gray-100 text-gray-500 border-0 text-xs">Draft</Badge>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{(c.steps || []).length}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        <NewSequenceDialog
          open={showNewDialog}
          onClose={() => setShowNewDialog(false)}
          onCreated={id => setSelectedId(id)}
        />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DETAIL VIEW (Attio-style)
  // ─────────────────────────────────────────────────────────────────────────
  if (!currentSeq) {
    return <div className="flex items-center justify-center h-full text-gray-400">Loading sequence…</div>;
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Top breadcrumb bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-white z-10">
        <div className="flex items-center gap-1.5 text-sm">
          <button
            onClick={() => setSelectedId(null)}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Sequences
          </button>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-800">{currentSeq.name}</span>
          <button className="ml-1 text-gray-300 hover:text-yellow-400 transition-colors">
            <Star className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="gap-1.5 text-sm text-gray-600">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
            <HelpCircle className="h-4 w-4 text-gray-400" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
                <MoreHorizontal className="h-4 w-4 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-red-500"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete sequence
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Sub-nav: Tabs + Enable toggle + Enroll button ──────────────── */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b bg-white">
        {/* Tabs */}
        <div className="flex items-center gap-0">
          {(['editor', 'recipients', 'settings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'editor' && <Edit3 className="h-3.5 w-3.5" />}
              {tab === 'recipients' && <Users className="h-3.5 w-3.5" />}
              {tab === 'settings' && <Settings className="h-3.5 w-3.5" />}
              <span className="capitalize">{tab}</span>
              {tab === 'recipients' && (
                <span className="ml-0.5 text-xs text-gray-400">{enrichedAssignments.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={currentSeq.isActive}
              onCheckedChange={v => updateCampaign.mutate({ isActive: v })}
            />
            <span className="text-sm text-gray-600">Enable sequence</span>
          </div>
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={() => setShowEnroll(true)}
          >
            Enroll recipients
          </Button>
        </div>
      </div>

      {/* ── Main content area ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Center / Editor column ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-gray-50">

          {/* ── EDITOR TAB ──────────────────────────────────────────── */}
          {activeTab === 'editor' && (
            <div className="flex flex-col items-center py-6 px-4 min-h-full">

              {/* Not published banner */}
              {!currentSeq.isActive && (
                <div className="w-full max-w-2xl mb-5">
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-blue-500" />
                      <span className="text-sm text-blue-700">This sequence has not yet been published</span>
                    </div>
                    <Button
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white h-7 text-xs"
                      onClick={() => updateCampaign.mutate({ isActive: true })}
                    >
                      Publish sequence
                    </Button>
                  </div>
                </div>
              )}

              {/* Start trigger row */}
              <div className="w-full max-w-2xl mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  </div>
                  <span>Start</span>
                  <button className="inline-flex items-center gap-1 font-medium text-gray-800 hover:text-indigo-600 transition-colors">
                    immediately
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <span>after enrollment</span>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                </div>
              </div>

              {/* Steps */}
              <div className="w-full max-w-2xl flex flex-col gap-0">
                {steps.map((step, idx) => (
                  <div key={step.id} className="flex flex-col">
                    {/* Delay indicator between steps (not before first) */}
                    {idx > 0 && (
                      <div className="flex flex-col items-center py-2">
                        <div className="w-px h-4 bg-gray-300" />
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-1.5 my-1 px-3 py-1 rounded-full bg-white border border-gray-200 text-xs text-gray-500 shadow-sm hover:border-indigo-400 hover:text-indigo-600 transition-colors cursor-pointer">
                              <Clock className="h-3 w-3" />
                              Wait {delayLabel(step.delayAmount, step.delayUnit)}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-3" align="center">
                            <p className="text-xs font-semibold text-gray-500 mb-2">Wait how many days?</p>
                            <div className="flex gap-1.5">
                              {[1, 2, 3, 4, 5, 6].map(d => (
                                <button
                                  key={d}
                                  onClick={() => updateStep.mutate({ stepId: step.id, data: { delayAmount: d, delayUnit: 'days' } })}
                                  className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${
                                    step.delayAmount === d
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-gray-100 text-gray-700 hover:bg-indigo-100 hover:text-indigo-700'
                                  }`}
                                >
                                  {d}
                                </button>
                              ))}
                            </div>
                            <p className="text-xs text-gray-400 mt-2 text-center">
                              {step.delayAmount === 1 ? '1 day' : `${step.delayAmount} days`} selected
                            </p>
                          </PopoverContent>
                        </Popover>
                        <div className="w-px h-4 bg-gray-300" />
                      </div>
                    )}
                    <StepCard
                      step={step}
                      index={idx}
                      onUpdate={(id, data) => updateStep.mutate({ stepId: id, data })}
                      onDelete={id => deleteStep.mutate(id)}
                    />
                  </div>
                ))}
              </div>

              {/* Add step */}
              <div className="w-full max-w-2xl mt-4 flex flex-col items-center">
                <div className="w-px h-5 bg-gray-300" />
                {addingStep ? (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 w-full">
                    <p className="text-xs font-semibold text-gray-500 mb-2">New Step</p>
                    <Input
                      placeholder="Step name (e.g. Introduction email)"
                      value={newStepName}
                      onChange={e => setNewStepName(e.target.value)}
                      className="mb-3 text-sm"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          createStep.mutate({
                            name: newStepName || 'Step',
                            subject: '',
                            body: '',
                            delayAmount: steps.length === 0 ? 0 : 3,
                            delayUnit: 'days',
                            stepOrder: steps.length + 1,
                          });
                        }
                        if (e.key === 'Escape') setAddingStep(false);
                      }}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={createStep.isPending}
                        onClick={() => createStep.mutate({
                          name: newStepName || 'Step',
                          subject: '',
                          body: '',
                          delayAmount: steps.length === 0 ? 0 : 3,
                          delayUnit: 'days',
                          stepOrder: steps.length + 1,
                        })}
                      >
                        Add step
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setAddingStep(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingStep(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full border border-dashed border-gray-300 bg-white text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors shadow-sm"
                  >
                    <Plus className="h-4 w-4" />
                    Add step to sequence
                  </button>
                )}
              </div>

              {/* ── Test / Preview strip ─────────────────────────────── */}
              {steps.length > 0 && (
                <div className="mt-8 w-full max-w-2xl">
                  <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl px-5 py-4">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-indigo-800">Want to test this sequence?</p>
                      <p className="text-xs text-indigo-500 mt-0.5">Send yourself a preview with real contact data, or see how it looks on a phone.</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-indigo-300 text-indigo-700 hover:bg-indigo-100 gap-1.5"
                        onClick={() => {
                          setPreviewStepId(steps[0]?.id ?? null);
                          setShowPreview(true);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        See Preview
                      </Button>
                      <Button
                        size="sm"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                        onClick={() => setShowTestEmail(true)}
                      >
                        <Send className="h-3.5 w-3.5" />
                        Send Test Email
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── RECIPIENTS TAB ──────────────────────────────────────── */}
          {activeTab === 'recipients' && (
            <div className="p-6">
              {enrichedAssignments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
                  <Users className="h-8 w-8 text-gray-300" />
                  <p className="text-sm text-gray-500">No recipients enrolled yet</p>
                  <Button size="sm" onClick={() => setShowEnroll(true)}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Enroll recipients
                  </Button>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Name</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Type</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Progress</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Enrolled</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {enrichedAssignments.map(a => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {a.name || `#${a.id}`}
                          </td>
                          <td className="px-4 py-3 text-gray-500 capitalize">
                            {a.type || '—'}
                          </td>
                          <td className="px-4 py-3">{statusBadge(a.status)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-indigo-500 rounded-full"
                                  style={{ width: `${a.stepsTotal ? (a.stepsSent || 0) / a.stepsTotal * 100 : 0}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-400">
                                {a.stepsSent || 0}/{a.stepsTotal || steps.length}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">
                            {a.enrolledAt ? new Date(a.enrolledAt).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {a.status === 'active' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-yellow-600"
                                  onClick={() => updateAssignment.mutate({ id: a.id, status: 'paused' })}
                                >
                                  <PauseCircle className="h-3.5 w-3.5 mr-1" />
                                  Pause
                                </Button>
                              )}
                              {a.status === 'paused' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-green-600"
                                  onClick={() => updateAssignment.mutate({ id: a.id, status: 'active' })}
                                >
                                  <Play className="h-3.5 w-3.5 mr-1" />
                                  Resume
                                </Button>
                              )}
                              {(a.status === 'active' || a.status === 'paused') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-red-500"
                                  onClick={() => {
                                    if (window.confirm('Cancel this drip assignment? The lead will stop receiving emails from this sequence.')) {
                                      updateAssignment.mutate({ id: a.id, status: 'cancelled' });
                                    }
                                  }}
                                >
                                  <XCircle className="h-3.5 w-3.5 mr-1" />
                                  Cancel
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── SETTINGS TAB ────────────────────────────────────────── */}
          {activeTab === 'settings' && (
            <div className="p-6 max-w-md">
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Trigger Type</label>
                  <Select
                    value={currentSeq.triggerType || 'manual'}
                    onValueChange={v => updateCampaign.mutate({ triggerType: v })}
                  >
                    <SelectTrigger className="text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TRIGGER_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-4 border-t">
                  <p className="text-xs font-medium text-red-500 mb-2">Danger Zone</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-500 border-red-200 hover:bg-red-50"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete this sequence
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right settings panel ────────────────────────────────────── */}
        {(activeTab === 'editor' || activeTab === 'recipients') && (
          <div className="w-72 border-l border-gray-200 bg-white overflow-y-auto shrink-0">
            <div className="p-4 space-y-5">

              {/* Sequence name */}
              <div>
                <input
                  type="text"
                  className="w-full font-semibold text-gray-900 text-base bg-transparent outline-none border-0 p-0 placeholder:text-gray-300"
                  value={localName}
                  onChange={e => setLocalName(e.target.value)}
                  onBlur={() => {
                    if (localName !== currentSeq.name) {
                      updateCampaign.mutate({ name: localName });
                    }
                  }}
                  placeholder="Sequence name"
                />
                <textarea
                  className="w-full text-sm text-gray-400 bg-transparent outline-none resize-none mt-1 placeholder:text-gray-300"
                  rows={2}
                  placeholder="Add a description…"
                  value={localDesc}
                  onChange={e => setLocalDesc(e.target.value)}
                  onBlur={() => {
                    if (localDesc !== (currentSeq.description || '')) {
                      updateCampaign.mutate({ description: localDesc });
                    }
                  }}
                />
              </div>

              {/* Delivery */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold text-gray-800 mb-3">Delivery</p>

                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1.5">Sending window</p>
                  <div className="flex items-center gap-1.5">
                    <select
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-400"
                      value={localSettings.sendingWindowStart || '09:00'}
                      onChange={e => saveSettings({ sendingWindowStart: e.target.value })}
                    >
                      {['06:00','07:00','08:00','09:00','10:00','11:00','12:00'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <span className="text-gray-400 text-xs">-</span>
                    <select
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-400"
                      value={localSettings.sendingWindowEnd || '17:00'}
                      onChange={e => saveSettings({ sendingWindowEnd: e.target.value })}
                    >
                      {['12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <select
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-400"
                      value={localSettings.timezone || 'America/New_York'}
                      onChange={e => saveSettings({ timezone: e.target.value })}
                    >
                      {TIMEZONE_OPTIONS.map(tz => (
                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-gray-700">Business days only</span>
                    <HelpCircle className="h-3.5 w-3.5 text-gray-300" />
                  </div>
                  <Switch
                    checked={!!localSettings.businessDaysOnly}
                    onCheckedChange={v => saveSettings({ businessDaysOnly: v })}
                  />
                </div>
              </div>

              {/* Email */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold text-gray-800 mb-3">Email</p>

                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1.5">Unsubscribe link</p>
                  <Select
                    value={localSettings.unsubscribeLinkText || 'Stop hearing from me'}
                    onValueChange={v => saveSettings({ unsubscribeLinkText: v })}
                  >
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNSUB_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-700">Thread emails</span>
                  <Switch
                    checked={!!localSettings.threadEmails}
                    onCheckedChange={v => saveSettings({ threadEmails: v })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Include sender signature</span>
                  <Switch
                    checked={!!localSettings.includeSenderSignature}
                    onCheckedChange={v => saveSettings({ includeSenderSignature: v })}
                  />
                </div>
              </div>

              {/* Exit criteria */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-800">Exit criteria</p>
                </div>

                <div className="flex flex-col gap-1 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className={`h-4 w-4 ${localSettings.exitOnReply ? 'text-green-500' : 'text-gray-300'}`} />
                      <span className="text-sm text-gray-700">Reply received</span>
                    </div>
                    <Switch
                      checked={!!localSettings.exitOnReply}
                      onCheckedChange={v => saveSettings({ exitOnReply: v })}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 pl-6">
                    {localSettings.exitOnReply
                      ? 'When a recipient replies, the sequence stops automatically — no further steps will send.'
                      : 'Enable to stop the sequence when the recipient replies.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}

      {/* Test Email Dialog */}
      <TestEmailDialog
        open={showTestEmail}
        onClose={() => setShowTestEmail(false)}
        campaignId={selectedId}
        steps={steps}
      />

      {/* Preview Modal */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-indigo-600" />
                Email Preview
              </DialogTitle>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 mr-8">
                <button
                  onClick={() => setPreviewDevice('mobile')}
                  className={`p-1.5 rounded-md transition-all ${previewDevice === 'mobile' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Mobile preview"
                >
                  <Smartphone className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPreviewDevice('desktop')}
                  className={`p-1.5 rounded-md transition-all ${previewDevice === 'desktop' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Desktop preview"
                >
                  <Monitor className="h-4 w-4" />
                </button>
                <div className="w-px h-5 bg-gray-300 mx-0.5" />
                <button
                  onClick={() => setPreviewTheme('light')}
                  className={`p-1.5 rounded-md transition-all ${previewTheme === 'light' ? 'bg-white shadow-sm text-amber-500' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Light mode"
                >
                  <Sun className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPreviewTheme('dark')}
                  className={`p-1.5 rounded-md transition-all ${previewTheme === 'dark' ? 'bg-gray-700 shadow-sm text-blue-300' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Dark mode"
                >
                  <Moon className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Step selector (tabs) */}
            {steps.length > 1 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {steps.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setPreviewStepId(s.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      previewStepId === s.id
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400 hover:text-indigo-600'
                    }`}
                  >
                    {s.name || `Step ${s.stepOrder}`}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">Variables are shown with sample data — real names fill in when the email sends</p>
          </DialogHeader>

          <div className="flex justify-center py-2">
            {(() => {
              const previewStep = steps.find(s => s.id === previewStepId) || steps[0];
              if (!previewStep) return <p className="text-sm text-gray-400">No steps yet</p>;

              // Sample variable substitution for preview
              const sampleVars: Record<string, string> = {
                'First Name': 'Jane', 'Last Name': 'Smith', 'Full Name': 'Jane Smith',
                'Email': 'jane@acmecorp.com', 'Company': 'Acme Corporation',
                'Sales Rep Name': '4S Graphics Team', 'Unsubscribe Link': '#',
              };
              const applyPreviewVars = (t: string) => {
                let out = t || '';
                for (const [k, v] of Object.entries(sampleVars)) {
                  out = out.replace(new RegExp(`\\{\\{\\s*${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\}\\}`, 'gi'), v);
                }
                return out.replace(/\{\{[^}]*\}\}/g, '');
              };
              const subject = applyPreviewVars(previewStep.subject || '');
              const body    = applyPreviewVars(previewStep.body || '');

              return (
                <div className={`relative transition-all duration-300 ${previewDevice === 'mobile' ? 'w-[320px]' : 'w-full max-w-[600px]'}`}>
                  {previewDevice === 'mobile' ? (
                    <div className={`rounded-[2.5rem] border-[6px] p-1 shadow-xl ${previewTheme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-gray-100'}`}>
                      <div className={`w-12 h-1.5 rounded-full mx-auto mt-1 mb-2 ${previewTheme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`} />
                      <div className={`rounded-[1.8rem] overflow-hidden ${previewTheme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}>
                        <div className={`px-4 py-2.5 border-b ${previewTheme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${previewTheme === 'dark' ? 'bg-indigo-800 text-indigo-200' : 'bg-indigo-100 text-indigo-600'}`}>
                              4S
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-semibold truncate ${previewTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>4S Graphics</p>
                              <p className={`text-[10px] truncate ${previewTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>to jane@acmecorp.com</p>
                            </div>
                            <span className={`text-[10px] ${previewTheme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Now</span>
                          </div>
                          <p className={`text-sm font-semibold truncate ${previewTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{subject || '(No subject)'}</p>
                        </div>
                        <div
                          className={`px-4 py-3 text-sm overflow-y-auto prose prose-sm max-w-none ${previewTheme === 'dark' ? 'text-gray-200 prose-headings:text-gray-100 prose-a:text-blue-400 prose-strong:text-gray-100' : 'text-gray-800 prose-headings:text-gray-900 prose-a:text-blue-600'}`}
                          style={{ maxHeight: '380px', fontSize: '13px', lineHeight: '1.5' }}
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body || '<p style="color:#999">No content yet</p>') }}
                        />
                      </div>
                      <div className={`w-16 h-1.5 rounded-full mx-auto mt-2 mb-1 ${previewTheme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`} />
                    </div>
                  ) : (
                    <div className={`rounded-xl border shadow-lg overflow-hidden ${previewTheme === 'dark' ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                      <div className={`px-4 py-3 border-b ${previewTheme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${previewTheme === 'dark' ? 'bg-indigo-800 text-indigo-200' : 'bg-indigo-100 text-indigo-600'}`}>4S</div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${previewTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>4S Graphics</p>
                            <p className={`text-xs ${previewTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>to jane@acmecorp.com</p>
                          </div>
                          <span className={`text-xs ${previewTheme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Just now</span>
                        </div>
                        <p className={`text-base font-semibold ${previewTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>{subject || '(No subject)'}</p>
                      </div>
                      <div
                        className={`px-6 py-5 prose prose-sm max-w-none overflow-y-auto ${previewTheme === 'dark' ? 'text-gray-200 prose-headings:text-gray-100 prose-a:text-blue-400 prose-strong:text-gray-100' : 'text-gray-800 prose-headings:text-gray-900 prose-a:text-blue-600'}`}
                        style={{ maxHeight: '440px', fontSize: '14px', lineHeight: '1.6' }}
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body || '<p style="color:#999">No content yet</p>') }}
                      />
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg text-xs bg-gray-50 text-gray-500">
            <User className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Preview uses sample data: <strong>Jane Smith</strong> at <strong>Acme Corporation</strong>. Real names and details will be filled in when the email sends.</span>
          </div>
        </DialogContent>
      </Dialog>

      <EnrollDialog
        open={showEnroll}
        onClose={() => setShowEnroll(false)}
        campaignId={selectedId}
      />

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sequence?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{currentSeq.name}" and all its steps and enrollments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { setShowDeleteConfirm(false); deleteCampaign.mutate(); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NewSequenceDialog
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onCreated={id => setSelectedId(id)}
      />
    </div>
  );
}
