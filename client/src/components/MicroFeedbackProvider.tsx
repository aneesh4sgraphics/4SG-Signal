import React, { createContext, useContext, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { 
  FloatingSuccess, 
  ParticleEffect, 
  SuccessCheckmark,
  LoadingSpinner 
} from '@/components/ui/micro-interactions';

interface FeedbackState {
  successMessage: string | null;
  showParticles: boolean;
  showCheckmark: boolean;
  isGlobalLoading: boolean;
  loadingMessage: string;
}

interface FeedbackContextType {
  showSuccess: (message: string, withParticles?: boolean) => void;
  showCheckmark: () => void;
  triggerParticles: () => void;
  setGlobalLoading: (loading: boolean, message?: string) => void;
}

const FeedbackContext = createContext<FeedbackContextType | null>(null);

export const useFeedback = () => {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a MicroFeedbackProvider');
  }
  return context;
};

export const MicroFeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<FeedbackState>({
    successMessage: null,
    showParticles: false,
    showCheckmark: false,
    isGlobalLoading: false,
    loadingMessage: 'Loading...'
  });

  const showSuccess = (message: string, withParticles: boolean = false) => {
    setState(prev => ({
      ...prev,
      successMessage: message,
      showParticles: withParticles
    }));
  };

  const showCheckmark = () => {
    setState(prev => ({ ...prev, showCheckmark: true }));
  };

  const triggerParticles = () => {
    setState(prev => ({ ...prev, showParticles: true }));
  };

  const setGlobalLoading = (loading: boolean, message: string = 'Loading...') => {
    setState(prev => ({
      ...prev,
      isGlobalLoading: loading,
      loadingMessage: message
    }));
  };

  const clearSuccess = () => {
    setState(prev => ({ ...prev, successMessage: null }));
  };

  const clearParticles = () => {
    setState(prev => ({ ...prev, showParticles: false }));
  };

  const clearCheckmark = () => {
    setState(prev => ({ ...prev, showCheckmark: false }));
  };

  return (
    <FeedbackContext.Provider value={{
      showSuccess,
      showCheckmark,
      triggerParticles,
      setGlobalLoading
    }}>
      {children}
      
      {/* Global Loading Overlay */}
      <AnimatePresence>
        {state.isGlobalLoading && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 shadow-2xl">
              <LoadingSpinner message={state.loadingMessage} />
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Message */}
      <AnimatePresence>
        {state.successMessage && (
          <FloatingSuccess
            message={state.successMessage}
            onComplete={clearSuccess}
          />
        )}
      </AnimatePresence>

      {/* Particle Effects */}
      <ParticleEffect
        trigger={state.showParticles}
        onComplete={clearParticles}
      />

      {/* Success Checkmark */}
      <SuccessCheckmark
        show={state.showCheckmark}
        onComplete={clearCheckmark}
      />
    </FeedbackContext.Provider>
  );
};