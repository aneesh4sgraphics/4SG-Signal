import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { EmailTemplate } from '@shared/schema';

interface BulkEmailComposerProps {
  leadIds: number[];
  onClose: () => void;
  onSent: (count: number) => void;
}

export default function BulkEmailComposer({ leadIds, onClose, onSent }: BulkEmailComposerProps) {
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const { data: templates = [] } = useQuery<EmailTemplate[]>({
    queryKey: ['/api/email/templates'],
  });

  const activeTemplates = templates.filter(t => t.isActive);

  const handleTemplateSelect = (templateId: string) => {
    const tpl = activeTemplates.find(t => String(t.id) === templateId);
    if (!tpl) return;
    setSubject(tpl.subject);
    setBody(tpl.body);
    setShowPreview(false);
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/leads/bulk-email', {
        leadIds,
        subject,
        body,
      });
      return res.json();
    },
    onSuccess: (data) => {
      onSent(data.sent || leadIds.length);
    },
    onError: (err: any) => {
      toast({ title: 'Send failed', description: err.message, variant: 'destructive' });
    },
  });

  const canSend = subject.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="space-y-4 py-2">
      {activeTemplates.length > 0 && (
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-gray-500" />
            Load Template
          </Label>
          <Select onValueChange={handleTemplateSelect}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a template to pre-fill subject & message…" />
            </SelectTrigger>
            <SelectContent>
              {activeTemplates.map(tpl => (
                <SelectItem key={tpl.id} value={String(tpl.id)}>
                  <span className="font-medium">{tpl.name}</span>
                  {tpl.category && (
                    <span className="ml-2 text-xs text-gray-400 capitalize">{tpl.category.replace(/_/g, ' ')}</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400">Selecting a template will populate the fields below. You can still edit after.</p>
        </div>
      )}

      <div className="space-y-1">
        <Label>Subject</Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Quick intro — waterproof papers for your print shop"
        />
      </div>
      <div className="space-y-1">
        <Label>Message</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your email here. Use {{name}} to personalize with the lead's name and {{company}} for their company."
          className="min-h-[200px]"
        />
        <p className="text-xs text-gray-400">Use {'{{name}}'} and {'{{company}}'} for personalization</p>
      </div>
      <div className="flex justify-between items-center pt-2">
        <p className="text-sm text-gray-500">Sending to {leadIds.length} lead{leadIds.length !== 1 ? 's' : ''}</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} disabled={sendMutation.isPending}>Cancel</Button>
          <Button
            onClick={() => setShowPreview(true)}
            disabled={!canSend || sendMutation.isPending}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Send className="w-4 h-4 mr-2" />
            Preview & Send
          </Button>
        </div>
      </div>

      {showPreview && (
        <div className="mt-4 border rounded-lg p-4 bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">Preview (first lead)</p>
            <button onClick={() => setShowPreview(false)} className="text-xs text-gray-400 hover:text-gray-600">Edit</button>
          </div>
          <p className="text-xs text-gray-500 mb-1"><strong>Subject:</strong> {subject.replace(/\{\{name\}\}/g, 'John').replace(/\{\{company\}\}/g, 'Acme Print Co')}</p>
          <div className="text-xs text-gray-700 whitespace-pre-wrap bg-white border rounded p-3 mt-2 max-h-32 overflow-y-auto">
            {body.replace(/\{\{name\}\}/g, 'John').replace(/\{\{company\}\}/g, 'Acme Print Co')}
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>Edit</Button>
            <Button
              size="sm"
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {sendMutation.isPending ? 'Sending...' : `Confirm & Send to ${leadIds.length} lead${leadIds.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
