import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { X, ChevronLeft, ChevronRight, SkipForward } from "lucide-react";
import { useLocation } from "wouter";
import type { Tutorial, TutorialStep } from "@/lib/tutorials";

interface TutorialOverlayProps {
  tutorial: Tutorial;
  onComplete: () => void;
  onSkip: () => void;
  onStepChange?: (step: number) => void;
}

export default function TutorialOverlay({ tutorial, onComplete, onSkip, onStepChange }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [, setLocation] = useLocation();
  const overlayRef = useRef<HTMLDivElement>(null);

  const step = tutorial.steps[currentStep];
  const progress = ((currentStep + 1) / tutorial.steps.length) * 100;

  const findTarget = useCallback(() => {
    if (!step.targetSelector) {
      setTargetRect(null);
      return;
    }

    const element = document.querySelector(step.targetSelector);
    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [step.targetSelector]);

  useEffect(() => {
    findTarget();
    const interval = setInterval(findTarget, 500);
    return () => clearInterval(interval);
  }, [findTarget]);

  useEffect(() => {
    onStepChange?.(currentStep);
  }, [currentStep, onStepChange]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkip();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep]);

  const handleNext = () => {
    if (step.navigateTo) {
      setLocation(step.navigateTo);
    }
    
    if (currentStep < tutorial.steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const getTooltipPosition = () => {
    if (!targetRect || step.position === 'center') {
      return {
        position: 'fixed' as const,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const padding = step.highlightPadding || 12;
    const tooltipWidth = 380;
    const tooltipHeight = 200;
    const margin = 16;

    let top: number;
    let left: number;

    switch (step.position) {
      case 'top':
        top = targetRect.top - tooltipHeight - margin;
        left = targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2);
        break;
      case 'bottom':
        top = targetRect.bottom + margin;
        left = targetRect.left + (targetRect.width / 2) - (tooltipWidth / 2);
        break;
      case 'left':
        top = targetRect.top + (targetRect.height / 2) - (tooltipHeight / 2);
        left = targetRect.left - tooltipWidth - margin;
        break;
      case 'right':
        top = targetRect.top + (targetRect.height / 2) - (tooltipHeight / 2);
        left = targetRect.right + margin;
        break;
      default:
        top = targetRect.bottom + margin;
        left = targetRect.left;
    }

    top = Math.max(margin, Math.min(top, window.innerHeight - tooltipHeight - margin));
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipWidth - margin));

    return {
      position: 'fixed' as const,
      top: `${top}px`,
      left: `${left}px`,
    };
  };

  const getHighlightStyle = () => {
    if (!targetRect) return null;

    const padding = step.highlightPadding || 8;
    return {
      position: 'fixed' as const,
      top: targetRect.top - padding,
      left: targetRect.left - padding,
      width: targetRect.width + (padding * 2),
      height: targetRect.height + (padding * 2),
      border: '3px solid hsl(var(--primary))',
      borderRadius: '2px',
      boxShadow: '0 0 0 4px rgba(var(--primary), 0.2), 0 0 30px rgba(var(--primary), 0.3)',
      pointerEvents: 'none' as const,
      zIndex: 10001,
      transition: 'all 0.3s ease-out',
    };
  };

  const overlayContent = (
    <div 
      ref={overlayRef}
      className="fixed inset-0 z-[10000]"
      data-testid="tutorial-overlay"
    >
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onSkip}
      />

      {targetRect && <div style={getHighlightStyle()!} />}

      <Card 
        className="z-[10002] w-[380px] shadow-2xl border-2 border-primary/20"
        style={getTooltipPosition()}
        data-testid="tutorial-tooltip"
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-xs">
              Step {currentStep + 1} of {tutorial.steps.length}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onSkip}
              data-testid="btn-tutorial-close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardTitle className="text-lg mt-2">{step.title}</CardTitle>
          <Progress value={progress} className="h-1 mt-2" />
        </CardHeader>
        <CardContent className="pt-0">
          <CardDescription className="text-sm text-foreground/80 mb-4">
            {step.description}
          </CardDescription>
          
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  data-testid="btn-tutorial-prev"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onSkip}
                className="text-muted-foreground"
                data-testid="btn-tutorial-skip"
              >
                <SkipForward className="h-4 w-4 mr-1" />
                Skip Tour
              </Button>
              <Button
                size="sm"
                onClick={handleNext}
                data-testid="btn-tutorial-next"
              >
                {currentStep === tutorial.steps.length - 1 ? 'Finish' : 'Next'}
                {currentStep < tutorial.steps.length - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return createPortal(overlayContent, document.body);
}
