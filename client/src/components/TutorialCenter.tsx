import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import TutorialOverlay from "./TutorialOverlay";
import {
  GraduationCap,
  Play,
  CheckCircle2,
  Clock,
  Rocket,
  Calculator,
  Users,
  Package,
  FileText,
  Compass,
  RotateCcw,
} from "lucide-react";
import { TUTORIALS, TUTORIAL_CATEGORIES, getTutorialById, type Tutorial } from "@/lib/tutorials";
import type { UserTutorialProgress } from "@shared/schema";

const ICON_MAP: Record<string, any> = {
  Compass,
  Calculator,
  Users,
  Package,
  FileText,
  Rocket,
};

interface TutorialCenterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TutorialCenter({ open, onOpenChange }: TutorialCenterProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTutorial, setActiveTutorial] = useState<Tutorial | null>(null);
  const [activeCategory, setActiveCategory] = useState('getting-started');

  const { data: progress } = useQuery<UserTutorialProgress[]>({
    queryKey: ["/api/tutorials/progress"],
  });

  const startTutorialMutation = useMutation({
    mutationFn: async (tutorialId: string) => {
      const tutorial = getTutorialById(tutorialId);
      if (!tutorial) throw new Error("Tutorial not found");
      
      return apiRequest("POST", "/api/tutorials/progress", {
        tutorialId,
        status: "in_progress",
        currentStep: 0,
        totalSteps: tutorial.steps.length,
        startedAt: new Date().toISOString(),
      });
    },
    onSuccess: (_, tutorialId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tutorials/progress"] });
      const tutorial = getTutorialById(tutorialId);
      if (tutorial) {
        setActiveTutorial(tutorial);
        onOpenChange(false);
      }
    },
  });

  const completeTutorialMutation = useMutation({
    mutationFn: async (tutorialId: string) => {
      return apiRequest("PATCH", `/api/tutorials/progress/${tutorialId}`, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tutorials/progress"] });
      setActiveTutorial(null);
      toast({
        title: "Tutorial completed!",
        description: "Great job! You've completed this tutorial.",
      });
    },
  });

  const skipTutorialMutation = useMutation({
    mutationFn: async (tutorialId: string) => {
      return apiRequest("PATCH", `/api/tutorials/progress/${tutorialId}`, {
        status: "skipped",
        skippedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tutorials/progress"] });
      setActiveTutorial(null);
    },
  });

  const resetTutorialMutation = useMutation({
    mutationFn: async (tutorialId: string) => {
      const tutorial = getTutorialById(tutorialId);
      if (!tutorial) throw new Error("Tutorial not found");
      
      return apiRequest("PATCH", `/api/tutorials/progress/${tutorialId}`, {
        status: "not_started",
        currentStep: 0,
        startedAt: null,
        completedAt: null,
        skippedAt: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tutorials/progress"] });
      toast({
        title: "Tutorial reset",
        description: "You can start this tutorial again.",
      });
    },
  });

  const getProgressForTutorial = (tutorialId: string) => {
    return progress?.find(p => p.tutorialId === tutorialId);
  };

  const getTutorialStatus = (tutorialId: string) => {
    const p = getProgressForTutorial(tutorialId);
    if (!p) return 'not_started';
    return p.status;
  };

  const getCompletedCount = () => {
    return progress?.filter(p => p.status === 'completed').length || 0;
  };

  const renderTutorialCard = (tutorial: Tutorial) => {
    const status = getTutorialStatus(tutorial.id);
    const tutorialProgress = getProgressForTutorial(tutorial.id);
    const Icon = ICON_MAP[tutorial.icon] || GraduationCap;
    const isCompleted = status === 'completed';
    const isInProgress = status === 'in_progress';

    return (
      <Card 
        key={tutorial.id}
        className={`transition-all hover:shadow-md ${isCompleted ? 'border-green-200 bg-green-50/50' : ''}`}
        data-testid={`tutorial-card-${tutorial.id}`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${isCompleted ? 'bg-green-100' : 'bg-primary/10'}`}>
                <Icon className={`h-5 w-5 ${isCompleted ? 'text-green-600' : 'text-primary'}`} />
              </div>
              <div>
                <CardTitle className="text-base">{tutorial.title}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {tutorial.estimatedMinutes} min
                  </Badge>
                  {isCompleted && (
                    <Badge className="bg-green-100 text-green-700 text-xs">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Completed
                    </Badge>
                  )}
                  {isInProgress && (
                    <Badge className="bg-blue-100 text-blue-700 text-xs">
                      In Progress
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CardDescription className="mb-3">{tutorial.description}</CardDescription>
          
          {isInProgress && tutorialProgress && (
            <div className="mb-3">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Progress</span>
                <span>{tutorialProgress.currentStep || 0} / {tutorialProgress.totalSteps}</span>
              </div>
              <Progress value={((tutorialProgress.currentStep || 0) / tutorialProgress.totalSteps) * 100} className="h-1" />
            </div>
          )}

          <div className="flex gap-2">
            {!isCompleted && (
              <Button
                size="sm"
                onClick={() => startTutorialMutation.mutate(tutorial.id)}
                disabled={startTutorialMutation.isPending}
                data-testid={`btn-start-tutorial-${tutorial.id}`}
              >
                <Play className="h-4 w-4 mr-1" />
                {isInProgress ? 'Continue' : 'Start'}
              </Button>
            )}
            {isCompleted && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => resetTutorialMutation.mutate(tutorial.id)}
                disabled={resetTutorialMutation.isPending}
                data-testid={`btn-reset-tutorial-${tutorial.id}`}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Restart
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[80vh]" data-testid="tutorial-center-dialog">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-primary/10">
                <GraduationCap className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">Learning Center</DialogTitle>
                <DialogDescription>
                  Interactive tutorials to help you master the application
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {getCompletedCount()} / {TUTORIALS.length} completed
              </Badge>
              <Progress value={(getCompletedCount() / TUTORIALS.length) * 100} className="w-32 h-2" />
            </div>
          </DialogHeader>

          <Tabs value={activeCategory} onValueChange={setActiveCategory} className="mt-4">
            <TabsList className="grid grid-cols-4 mb-4">
              {Object.entries(TUTORIAL_CATEGORIES).map(([key, cat]) => {
                const CatIcon = ICON_MAP[cat.icon] || GraduationCap;
                return (
                  <TabsTrigger key={key} value={key} className="flex items-center gap-1.5">
                    <CatIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">{cat.title}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            <ScrollArea className="h-[400px] pr-4">
              {Object.keys(TUTORIAL_CATEGORIES).map(category => (
                <TabsContent key={category} value={category} className="space-y-4 mt-0">
                  {TUTORIALS.filter(t => t.category === category).map(renderTutorialCard)}
                  {TUTORIALS.filter(t => t.category === category).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No tutorials available in this category yet.
                    </div>
                  )}
                </TabsContent>
              ))}
            </ScrollArea>
          </Tabs>
        </DialogContent>
      </Dialog>

      {activeTutorial && (
        <TutorialOverlay
          tutorial={activeTutorial}
          onComplete={() => completeTutorialMutation.mutate(activeTutorial.id)}
          onSkip={() => skipTutorialMutation.mutate(activeTutorial.id)}
          onStepChange={(step) => {
            apiRequest("PATCH", `/api/tutorials/progress/${activeTutorial.id}`, {
              currentStep: step,
            }).catch(console.error);
          }}
        />
      )}
    </>
  );
}
