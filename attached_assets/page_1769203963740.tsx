'use client';

import { useState } from 'react';
import { Flame, Lightbulb, MapPin, ChevronLeft, Coffee, ChevronDown, ChevronRight, Phone, Mail, FileText } from 'lucide-react';

export default function SpotlightPage() {
  const [completed, setCompleted] = useState(12);
  const [total] = useState(30);
  const [isPaused, setIsPaused] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [streak, setStreak] = useState(5);
  const [callScriptOpen, setCallScriptOpen] = useState(false);
  const [emailIdeasOpen, setEmailIdeasOpen] = useState(false);

  const handleOutcome = (outcome: string) => {
    if (!isPaused && !isComplete) {
      setCompleted(completed + 1);
      if (completed + 1 >= total) {
        setIsComplete(true);
      }
    }
  };

  const customerNotes = [
    { date: 'Jan 20, 2026', text: 'Left voicemail about upgrade promotion. Will follow up next week.' },
    { date: 'Jan 15, 2026', text: 'Spoke with Sarah - interested in X200 upgrade but waiting on Q1 budget approval.' },
    { date: 'Jan 8, 2026', text: 'Initial outreach via email. Opened but no response yet.' },
  ];

  const callScriptIdeas = [
    'Open with ROI stats from similar Enterprise clients',
    'Mention the Q1 promotion ending soon',
    'Ask about their current maintenance costs',
    'Reference their X200 and C500 usage patterns',
  ];

  const emailIdeas = [
    'Send case study from similar manufacturing company',
    'Follow-up template with pricing comparison',
    'Share ROI calculator link',
    'Invite to upcoming product webinar',
  ];

  return (
    <div className="h-screen bg-background p-6 flex flex-col items-center overflow-hidden">
      {/* Header Row */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-4">
        <button className="flex items-center gap-1 text-foreground hover:opacity-75 transition text-sm">
          <ChevronLeft className="w-4 h-4" />
          <span className="font-medium">Back</span>
        </button>
        
        {/* Progress Bar */}
        <div className="flex items-center gap-3 flex-1 mx-8">
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ 
                width: `${(completed / total) * 100}%`,
                background: 'linear-gradient(90deg, #F87171 0%, #A78BFA 50%, #3B82F6 100%)'
              }}
            />
          </div>
          <span className="text-sm font-bold text-foreground">{completed}/{total}</span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Flame className="w-3 h-3 text-primary" />
            <span>{streak}</span>
          </div>
        </div>

        <button
          onClick={() => setIsPaused(!isPaused)}
          className="px-4 py-1.5 rounded-full text-sm font-medium bg-white text-foreground shadow-sm hover:shadow-md transition border border-border"
        >
          {isPaused ? 'Resume' : 'Pause'}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-5xl flex-1 flex gap-4 overflow-hidden">
        {/* Left Sidebar - Stats & Progress */}
        <div className="w-48 flex-shrink-0 flex flex-col gap-3">
          {/* Progress Card */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Progress</p>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{ 
                    width: `${(completed / total) * 100}%`,
                    background: 'linear-gradient(90deg, #F87171 0%, #A78BFA 50%, #3B82F6 100%)'
                  }}
                />
              </div>
              <span className="text-sm font-bold text-foreground">{completed}/{total}</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-secondary" />
                  <span className="text-xs text-muted-foreground">Efficiency</span>
                </div>
                <span className="text-sm font-bold text-foreground">94%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className="w-3 h-3 text-primary" />
                  <span className="text-xs text-muted-foreground">Streak</span>
                </div>
                <span className="text-sm font-bold text-foreground">{streak}</span>
              </div>
            </div>
          </div>

          {/* Bucket Progress */}
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Buckets</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="w-3/4 h-full bg-blue-500 rounded-full" />
                </div>
                <span className="text-xs text-muted-foreground w-12">Calls</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="w-1/2 h-full bg-purple-500 rounded-full" />
                </div>
                <span className="text-xs text-muted-foreground w-12">Follow</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="w-1/4 h-full bg-orange-400 rounded-full" />
                </div>
                <span className="text-xs text-muted-foreground w-12">Outreach</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center Column - Task Card */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {isPaused ? (
            <div className="flex-1 flex items-center justify-center bg-white rounded-2xl shadow-sm">
              <div className="text-center p-8">
                <Coffee className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-foreground mb-2">Session Paused</h2>
                <p className="text-muted-foreground text-sm mb-6">Take a break. Your progress is saved.</p>
                <button
                  onClick={() => setIsPaused(false)}
                  className="px-6 py-2 rounded-full font-semibold text-sm bg-gradient-to-r from-primary to-accent text-white hover:shadow-lg transition shadow-sm"
                >
                  Resume Session
                </button>
              </div>
            </div>
          ) : isComplete ? (
            <div className="flex-1 flex items-center justify-center bg-white rounded-2xl shadow-sm">
              <div className="text-center p-8">
                <div className="text-4xl mb-4">{"✨"}</div>
                <h2 className="text-2xl font-bold text-foreground mb-2">Day Complete!</h2>
                <p className="text-muted-foreground text-sm mb-6">Amazing work! You completed all {total} tasks.</p>
                <button
                  onClick={() => {
                    setIsComplete(false);
                    setCompleted(0);
                    setStreak(streak + 1);
                  }}
                  className="px-6 py-2 rounded-full font-semibold text-sm bg-gradient-to-r from-secondary to-accent text-white hover:shadow-lg transition shadow-sm"
                >
                  View Dashboard
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Task Card */}
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col">
                {/* Why Now Banner */}
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-5 py-2.5 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-white opacity-75" />
                  <div>
                    <p className="text-white text-sm font-semibold">Why Now: Calls</p>
                    <p className="text-blue-100 text-xs">High priority outbound</p>
                  </div>
                </div>

                {/* Customer Info */}
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-2xl font-bold text-foreground mb-1">TechCorp Inc.</h3>
                      <p className="text-muted-foreground text-sm mb-2">Sarah Johnson</p>
                      <div className="flex items-center gap-4 text-sm">
                        <a href="mailto:sarah@techcorp.com" className="text-accent hover:underline">sarah@techcorp.com</a>
                        <a href="tel:+1234567890" className="text-accent hover:underline">+1 (234) 567-890</a>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100">
                      <Flame className="w-3 h-3 text-primary" />
                      <span className="text-xs font-semibold text-primary">Hot</span>
                    </div>
                  </div>

                  {/* Two-column info */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-yellow-50 rounded-xl p-3 flex gap-2">
                      <Lightbulb className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-foreground text-xs mb-1">Tip</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">They mentioned budget concerns. Lead with ROI metrics.</p>
                      </div>
                    </div>
                    <div className="bg-muted rounded-xl p-3">
                      <p className="font-semibold text-foreground text-xs mb-2">Machines</p>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white text-foreground border border-border">X200</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white text-foreground border border-border">C500</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent text-white">Upgrade Kit</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Info Row */}
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <a href="#" className="text-accent hover:underline text-xs font-medium">View Map</a>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-secondary text-white">Enterprise</span>
                    <span className="text-xs text-muted-foreground">Rep: <span className="font-semibold text-foreground">You</span></span>
                  </div>
                </div>
              </div>

              {/* Notes Section */}
              <div className="mt-3 bg-white rounded-2xl shadow-sm p-4 flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer Notes</p>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2">
                  {customerNotes.map((note, idx) => (
                    <div key={idx} className="bg-muted rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">{note.date}</p>
                      <p className="text-sm text-foreground">{note.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Outcomes */}
              <div className="mt-3 bg-white rounded-2xl shadow-sm p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Outcome</p>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => handleOutcome('call')}
                    className="flex-1 px-3 py-2 rounded-full text-sm font-semibold bg-white text-foreground border-2 border-blue-500 hover:bg-blue-50 transition"
                  >
                    Call Done
                  </button>
                  <button
                    onClick={() => handleOutcome('email')}
                    className="flex-1 px-3 py-2 rounded-full text-sm font-semibold bg-white text-foreground border-2 border-green-500 hover:bg-green-50 transition"
                  >
                    Email Sent
                  </button>
                  <button
                    onClick={() => handleOutcome('followup')}
                    className="flex-1 px-3 py-2 rounded-full text-sm font-semibold bg-white text-foreground border-2 border-primary hover:bg-red-50 transition"
                  >
                    Scheduled
                  </button>
                </div>
                <div className="flex gap-6 justify-center mt-4">
                  <button className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted px-4 py-2 rounded-lg transition">Skip</button>
                  <button className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted px-4 py-2 rounded-lg transition">Bad Fit</button>
                  <button className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted px-4 py-2 rounded-lg transition">Do Not Contact</button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Sidebar - Collapsible Trays */}
        {!isPaused && !isComplete && (
          <div className="w-64 flex-shrink-0 flex flex-col gap-3">
            {/* Calling Script Ideas Tray */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <button
                onClick={() => setCallScriptOpen(!callScriptOpen)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition"
              >
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-semibold text-foreground">Calling Script Ideas</span>
                </div>
                {callScriptOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
              {callScriptOpen && (
                <div className="px-4 pb-4 space-y-2">
                  {callScriptIdeas.map((idea, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground leading-relaxed">{idea}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Email Ideas Tray */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <button
                onClick={() => setEmailIdeasOpen(!emailIdeasOpen)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition"
              >
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-purple-500" />
                  <span className="text-sm font-semibold text-foreground">Email Ideas</span>
                </div>
                {emailIdeasOpen ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
              {emailIdeasOpen && (
                <div className="px-4 pb-4 space-y-2">
                  {emailIdeas.map((idea, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground leading-relaxed">{idea}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
