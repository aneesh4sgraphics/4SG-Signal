import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BulkEmailComposerProps {
  leadIds: number[];
  onClose: () => void;
  onSent: (count: number) => void;
}

export default function BulkEmailComposer({ leadIds, onClose, onSent }: BulkEmailComposerProps) {
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

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
            onClick={() => sendMutation.mutate()}
            disabled={!canSend || sendMutation.isPending}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            Send to {leadIds.length} Lead{leadIds.length !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}
