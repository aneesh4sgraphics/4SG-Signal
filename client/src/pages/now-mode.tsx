import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { 
  Phone, 
  Mail, 
  PhoneMissed, 
  PauseCircle,
  CheckCircle2,
  ArrowLeft,
  Building2,
  User,
  Clock,
  Zap,
  Trophy,
  Sparkles
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Customer {
  id: string;
  company: string;
  name: string;
  email: string;
  phone: string;
}

interface CoachingMoment {
  id: number;
  customerId: string;
  action: string;
  whyNow: string;
  priority: number;
  customer: Customer | null;
}

interface NowModeResponse {
  moment: CoachingMoment | null;
  completed: number;
  dailyCap: number;
  remaining: number;
  allDone?: boolean;
  message?: string;
}

const MOMENT_ACTIONS: Record<string, { label: string; icon: string }> = {
  follow_up_quote: { label: 'Follow Up on Quote', icon: 'phone' },
  follow_up_sample: { label: 'Follow Up on Sample', icon: 'package' },
  check_reorder: { label: 'Check Reorder Status', icon: 'refresh-cw' },
  win_back: { label: 'Win Back Customer', icon: 'heart' },
  send_sample: { label: 'Send Sample', icon: 'package' },
  send_quote: { label: 'Send Quote', icon: 'file-text' },
  confirm_machine: { label: 'Confirm Machine Type', icon: 'settings' },
  schedule_call: { label: 'Schedule a Call', icon: 'calendar' },
  check_feedback: { label: 'Check Sample Feedback', icon: 'message-circle' },
  introduce_category: { label: 'Introduce New Category', icon: 'layers' },
};

export default function NowMode() {
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<NowModeResponse>({
    queryKey: ["/api/now-mode/current"],
    refetchOnWindowFocus: false,
  });

  const completeMutation = useMutation({
    mutationFn: async ({ momentId, outcome, notes }: { momentId: number; outcome: string; notes?: string }) => {
      return apiRequest("POST", "/api/now-mode/complete", { momentId, outcome, notes });
    },
    onSuccess: () => {
      setNotes("");
      setShowNotes(false);
      queryClient.invalidateQueries({ queryKey: ["/api/now-mode/current"] });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to complete moment",
        variant: "destructive",
      });
    },
  });

  const handleOutcome = (outcome: string) => {
    if (!data?.moment) return;
    completeMutation.mutate({
      momentId: data.moment.id,
      outcome,
      notes: notes || undefined,
    });
  };

  const progress = data && data.dailyCap > 0 ? (data.completed / data.dailyCap) * 100 : 0;

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #E8E5F0 0%, #F0EDF7 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}>
          <Zap size={48} style={{ color: '#6F42C1', animation: 'pulse 1.5s infinite' }} />
          <span style={{ color: '#6B6B8C', fontSize: '16px', fontWeight: 500 }}>Loading Now Mode...</span>
        </div>
      </div>
    );
  }

  if (data?.allDone) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #E8E5F0 0%, #F0EDF7 100%)',
        padding: '40px 24px',
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <Button variant="ghost" style={{ marginBottom: '24px', gap: '8px' }}>
              <ArrowLeft size={18} />
              Back to Dashboard
            </Button>
          </Link>

          <Card style={{ 
            borderRadius: '2px', 
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          }}>
            <CardContent style={{ 
              padding: '60px 40px', 
              textAlign: 'center',
              background: 'linear-gradient(135deg, #28A745 0%, #20c997 100%)',
            }}>
              <Trophy size={80} style={{ color: '#FFFFFF', marginBottom: '24px' }} />
              <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#FFFFFF', marginBottom: '16px' }}>
                All Done for Today!
              </h1>
              <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.9)', marginBottom: '24px' }}>
                You completed {data.completed} coaching moments. Great work!
              </p>
              <div style={{
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '2px',
                padding: '16px 24px',
                display: 'inline-block',
              }}>
                <Sparkles size={24} style={{ color: '#FFFFFF' }} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!data?.moment) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #E8E5F0 0%, #F0EDF7 100%)',
        padding: '40px 24px',
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <Button variant="ghost" style={{ marginBottom: '24px', gap: '8px' }}>
              <ArrowLeft size={18} />
              Back to Dashboard
            </Button>
          </Link>

          <Card style={{ 
            borderRadius: '2px', 
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          }}>
            <CardContent style={{ 
              padding: '60px 40px', 
              textAlign: 'center',
            }}>
              <Clock size={64} style={{ color: '#6B6B8C', marginBottom: '24px' }} />
              <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#2C2C54', marginBottom: '16px' }}>
                No Moments Right Now
              </h1>
              <p style={{ fontSize: '16px', color: '#6B6B8C', marginBottom: '24px' }}>
                {data?.message || "Check back later for new coaching moments."}
              </p>
              <Progress value={progress} className="h-3" style={{ maxWidth: '300px', margin: '0 auto' }} />
              <p style={{ fontSize: '14px', color: '#6B6B8C', marginTop: '12px' }}>
                {data?.completed || 0} of {data?.dailyCap || 6} completed today
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const moment = data.moment;
  const actionInfo = MOMENT_ACTIONS[moment.action] || { label: moment.action, icon: 'zap' };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #E8E5F0 0%, #F0EDF7 100%)',
      padding: '40px 24px',
    }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <Button variant="ghost" style={{ gap: '8px' }}>
              <ArrowLeft size={18} />
              Back
            </Button>
          </Link>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#2C2C54' }}>
              {data.completed} / {data.dailyCap}
            </div>
            <div style={{ fontSize: '12px', color: '#6B6B8C' }}>moments today</div>
          </div>
        </div>

        <Progress value={progress} className="h-2 mb-6" />

        <Card style={{ 
          borderRadius: '2px', 
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #6F42C1 0%, #8B5CF6 100%)',
            padding: '24px',
            color: '#FFFFFF',
          }}>
            <div style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', opacity: 0.8 }}>
              Coaching Moment
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>
              {actionInfo.label}
            </h2>
          </div>

          <CardContent style={{ padding: '24px' }}>
            <div style={{ 
              background: 'rgba(111, 66, 193, 0.08)', 
              borderRadius: '2px', 
              padding: '20px',
              marginBottom: '24px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <Building2 size={20} style={{ color: '#6F42C1' }} />
                <span style={{ fontSize: '18px', fontWeight: 600, color: '#2C2C54' }}>
                  {moment.customer?.company || 'Unknown Company'}
                </span>
              </div>
              {moment.customer?.name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <User size={16} style={{ color: '#6B6B8C' }} />
                  <span style={{ fontSize: '14px', color: '#6B6B8C' }}>{moment.customer.name}</span>
                </div>
              )}
              {moment.customer?.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <Phone size={16} style={{ color: '#6B6B8C' }} />
                  <a href={`tel:${moment.customer.phone}`} style={{ fontSize: '14px', color: '#0D6EFD', textDecoration: 'none' }}>
                    {moment.customer.phone}
                  </a>
                </div>
              )}
              {moment.customer?.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Mail size={16} style={{ color: '#6B6B8C' }} />
                  <a href={`mailto:${moment.customer.email}`} style={{ fontSize: '14px', color: '#0D6EFD', textDecoration: 'none' }}>
                    {moment.customer.email}
                  </a>
                </div>
              )}
            </div>

            <div style={{ 
              background: '#FFF8E5', 
              borderRadius: '2px', 
              padding: '16px',
              marginBottom: '24px',
              border: '1px solid rgba(255, 193, 7, 0.3)',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#B8860B', marginBottom: '4px', textTransform: 'uppercase' }}>
                Why Now
              </div>
              <p style={{ fontSize: '14px', color: '#2C2C54', margin: 0, lineHeight: 1.5 }}>
                {moment.whyNow}
              </p>
            </div>

            {showNotes && (
              <div style={{ marginBottom: '24px' }}>
                <Textarea
                  placeholder="Add notes (optional)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ borderRadius: '2px', minHeight: '80px' }}
                />
              </div>
            )}

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(2, 1fr)', 
              gap: '12px',
            }}>
              <Button
                onClick={() => handleOutcome('called')}
                disabled={completeMutation.isPending}
                style={{
                  background: '#28A745',
                  color: '#FFFFFF',
                  borderRadius: '2px',
                  padding: '16px',
                  height: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <Phone size={24} />
                <span style={{ fontSize: '14px', fontWeight: 600 }}>Called</span>
              </Button>

              <Button
                onClick={() => handleOutcome('emailed')}
                disabled={completeMutation.isPending}
                style={{
                  background: '#0D6EFD',
                  color: '#FFFFFF',
                  borderRadius: '2px',
                  padding: '16px',
                  height: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <Mail size={24} />
                <span style={{ fontSize: '14px', fontWeight: 600 }}>Emailed</span>
              </Button>

              <Button
                onClick={() => handleOutcome('no_answer')}
                disabled={completeMutation.isPending}
                variant="outline"
                style={{
                  borderRadius: '2px',
                  padding: '16px',
                  height: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  borderColor: '#FD7E14',
                  color: '#FD7E14',
                }}
              >
                <PhoneMissed size={24} />
                <span style={{ fontSize: '14px', fontWeight: 600 }}>No Answer</span>
              </Button>

              <Button
                onClick={() => handleOutcome('pause')}
                disabled={completeMutation.isPending}
                variant="outline"
                style={{
                  borderRadius: '2px',
                  padding: '16px',
                  height: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  borderColor: '#6B6B8C',
                  color: '#6B6B8C',
                }}
              >
                <PauseCircle size={24} />
                <span style={{ fontSize: '14px', fontWeight: 600 }}>Pause</span>
              </Button>
            </div>

            <Button
              variant="ghost"
              onClick={() => setShowNotes(!showNotes)}
              style={{ width: '100%', marginTop: '16px', color: '#6B6B8C' }}
            >
              {showNotes ? 'Hide Notes' : 'Add Notes'}
            </Button>

            <Link 
              href={`/client-detail/${moment.customerId}`} 
              style={{ 
                display: 'block', 
                textAlign: 'center', 
                marginTop: '16px',
                fontSize: '14px',
                color: '#6F42C1',
                textDecoration: 'none',
              }}
            >
              View Full Customer Profile
            </Link>
          </CardContent>
        </Card>

        <p style={{ 
          textAlign: 'center', 
          fontSize: '14px', 
          color: '#6B6B8C', 
          marginTop: '24px',
        }}>
          {data.remaining} more moment{data.remaining !== 1 ? 's' : ''} remaining today
        </p>
      </div>
    </div>
  );
}