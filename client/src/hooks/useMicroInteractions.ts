import { useState, useCallback } from 'react';

export interface MicroInteractionState {
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  message: string;
  showParticles: boolean;
  progress: number;
}

export const useMicroInteractions = () => {
  const [state, setState] = useState<MicroInteractionState>({
    isLoading: false,
    isSuccess: false,
    isError: false,
    message: '',
    showParticles: false,
    progress: 0
  });

  const startLoading = useCallback((message: string = 'Loading...') => {
    setState(prev => ({
      ...prev,
      isLoading: true,
      isSuccess: false,
      isError: false,
      message,
      progress: 0
    }));
  }, []);

  const updateProgress = useCallback((progress: number) => {
    setState(prev => ({
      ...prev,
      progress: Math.min(100, Math.max(0, progress))
    }));
  }, []);

  const showSuccess = useCallback((message: string = 'Success!', showParticles: boolean = false) => {
    setState(prev => ({
      ...prev,
      isLoading: false,
      isSuccess: true,
      isError: false,
      message,
      showParticles,
      progress: 100
    }));

    // Auto-clear success state after 3 seconds
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        isSuccess: false,
        showParticles: false,
        message: ''
      }));
    }, 3000);
  }, []);

  const showError = useCallback((message: string = 'Error occurred') => {
    setState(prev => ({
      ...prev,
      isLoading: false,
      isSuccess: false,
      isError: true,
      message,
      progress: 0
    }));

    // Auto-clear error state after 4 seconds
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        isError: false,
        message: ''
      }));
    }, 4000);
  }, []);

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      isSuccess: false,
      isError: false,
      message: '',
      showParticles: false,
      progress: 0
    });
  }, []);

  const triggerParticles = useCallback(() => {
    setState(prev => ({ ...prev, showParticles: true }));
    setTimeout(() => {
      setState(prev => ({ ...prev, showParticles: false }));
    }, 1500);
  }, []);

  return {
    state,
    startLoading,
    updateProgress,
    showSuccess,
    showError,
    reset,
    triggerParticles
  };
};

// Specific hooks for common operations
export const useAsyncOperation = () => {
  const microInteractions = useMicroInteractions();

  const executeAsync = useCallback(async <T>(
    operation: () => Promise<T>,
    options: {
      loadingMessage?: string;
      successMessage?: string;
      errorMessage?: string;
      showParticles?: boolean;
      onProgress?: (progress: number) => void;
    } = {}
  ): Promise<T | null> => {
    const {
      loadingMessage = 'Processing...',
      successMessage = 'Completed successfully!',
      errorMessage = 'Operation failed',
      showParticles = false,
      onProgress
    } = options;

    try {
      microInteractions.startLoading(loadingMessage);
      
      // Simulate progress if onProgress is provided
      if (onProgress) {
        const progressInterval = setInterval(() => {
          microInteractions.updateProgress(Math.random() * 30 + 10);
        }, 200);
        
        const result = await operation();
        clearInterval(progressInterval);
        microInteractions.updateProgress(100);
        
        setTimeout(() => {
          microInteractions.showSuccess(successMessage, showParticles);
        }, 200);
        
        return result;
      } else {
        const result = await operation();
        microInteractions.showSuccess(successMessage, showParticles);
        return result;
      }
    } catch (error) {
      microInteractions.showError(errorMessage);
      console.error('Async operation failed:', error);
      return null;
    }
  }, [microInteractions]);

  return {
    ...microInteractions,
    executeAsync
  };
};

// Hook for form submission feedback
export const useFormFeedback = () => {
  const microInteractions = useMicroInteractions();
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  const setFieldError = useCallback((fieldName: string, hasError: boolean) => {
    setFieldErrors(prev => ({ ...prev, [fieldName]: hasError }));
  }, []);

  const clearFieldErrors = useCallback(() => {
    setFieldErrors({});
  }, []);

  const submitForm = useCallback(async <T>(
    formData: any,
    submitFunction: (data: any) => Promise<T>,
    options: {
      successMessage?: string;
      errorMessage?: string;
      showParticles?: boolean;
    } = {}
  ): Promise<T | null> => {
    const {
      successMessage = 'Form submitted successfully!',
      errorMessage = 'Form submission failed',
      showParticles = true
    } = options;

    clearFieldErrors();
    
    return microInteractions.executeAsync(
      () => submitFunction(formData),
      { 
        loadingMessage: 'Submitting...',
        successMessage,
        errorMessage,
        showParticles
      }
    );
  }, [microInteractions, clearFieldErrors]);

  return {
    ...microInteractions,
    fieldErrors,
    setFieldError,
    clearFieldErrors,
    submitForm
  };
};

// Hook for data operations (CRUD)
export const useDataOperations = () => {
  const microInteractions = useMicroInteractions();

  const create = useCallback(async <T>(
    createFunction: () => Promise<T>,
    itemName: string = 'item'
  ): Promise<T | null> => {
    return microInteractions.executeAsync(
      createFunction,
      {
        loadingMessage: `Creating ${itemName}...`,
        successMessage: `${itemName.charAt(0).toUpperCase() + itemName.slice(1)} created successfully!`,
        errorMessage: `Failed to create ${itemName}`,
        showParticles: true
      }
    );
  }, [microInteractions]);

  const update = useCallback(async <T>(
    updateFunction: () => Promise<T>,
    itemName: string = 'item'
  ): Promise<T | null> => {
    return microInteractions.executeAsync(
      updateFunction,
      {
        loadingMessage: `Updating ${itemName}...`,
        successMessage: `${itemName.charAt(0).toUpperCase() + itemName.slice(1)} updated successfully!`,
        errorMessage: `Failed to update ${itemName}`,
        showParticles: false
      }
    );
  }, [microInteractions]);

  const remove = useCallback(async <T>(
    deleteFunction: () => Promise<T>,
    itemName: string = 'item'
  ): Promise<T | null> => {
    return microInteractions.executeAsync(
      deleteFunction,
      {
        loadingMessage: `Deleting ${itemName}...`,
        successMessage: `${itemName.charAt(0).toUpperCase() + itemName.slice(1)} deleted successfully!`,
        errorMessage: `Failed to delete ${itemName}`,
        showParticles: false
      }
    );
  }, [microInteractions]);

  return {
    ...microInteractions,
    create,
    update,
    remove
  };
};