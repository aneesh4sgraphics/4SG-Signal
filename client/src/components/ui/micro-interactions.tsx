import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Loader2, Zap, Heart, Star, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

// Ripple effect for button clicks
export const RippleButton = ({ children, className, onClick, ...props }: any) => {
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);

  const createRipple = (e: React.MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newRipple = {
      id: Date.now(),
      x,
      y
    };

    setRipples(prev => [...prev, newRipple]);
    
    // Remove ripple after animation
    setTimeout(() => {
      setRipples(prev => prev.filter(ripple => ripple.id !== newRipple.id));
    }, 600);

    // Call original onClick
    if (onClick) onClick(e);
  };

  return (
    <button
      className={cn("relative overflow-hidden", className)}
      onClick={createRipple}
      {...props}
    >
      {children}
      <AnimatePresence>
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            className="absolute bg-white/30 rounded-full pointer-events-none"
            style={{
              left: ripple.x - 10,
              top: ripple.y - 10,
            }}
            initial={{ width: 20, height: 20, opacity: 1 }}
            animate={{ width: 400, height: 400, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          />
        ))}
      </AnimatePresence>
    </button>
  );
};

// Floating success indicator
export const FloatingSuccess = ({ message, onComplete }: { message: string; onComplete: () => void }) => (
  <motion.div
    className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2"
    initial={{ opacity: 0, y: -50, scale: 0.8 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.3 }}
    onAnimationComplete={() => {
      setTimeout(() => onComplete(), 2000);
    }}
  >
    <Check className="w-4 h-4" />
    {message}
  </motion.div>
);

// Loading state with micro-animations
export const LoadingSpinner = ({ message = "Loading..." }: { message?: string }) => (
  <motion.div
    className="flex items-center gap-2"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
  >
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
    >
      <Loader2 className="w-4 h-4" />
    </motion.div>
    <motion.span
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity }}
    >
      {message}
    </motion.span>
  </motion.div>
);

// Pulsing heart for favorite actions
export const PulsingHeart = ({ active, onClick }: { active: boolean; onClick: () => void }) => (
  <motion.button
    onClick={onClick}
    className={cn(
      "p-2 rounded-full transition-colors duration-200",
      active ? "text-red-500" : "text-gray-400 hover:text-red-400"
    )}
    whileHover={{ scale: 1.1 }}
    whileTap={{ scale: 0.95 }}
  >
    <motion.div
      animate={active ? { scale: [1, 1.2, 1] } : {}}
      transition={{ duration: 0.3 }}
    >
      <Heart className={cn("w-5 h-5", active && "fill-current")} />
    </motion.div>
  </motion.button>
);

// Floating particles for special actions
export const ParticleEffect = ({ trigger, onComplete }: { trigger: boolean; onComplete: () => void }) => {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    x: Math.random() * 200 - 100,
    y: Math.random() * 200 - 100,
    icon: [Star, Sparkles, Zap][Math.floor(Math.random() * 3)]
  }));

  return (
    <AnimatePresence>
      {trigger && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {particles.map((particle) => {
            const Icon = particle.icon;
            return (
              <motion.div
                key={particle.id}
                className="absolute top-1/2 left-1/2"
                initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0, 1, 0.5],
                  x: particle.x,
                  y: particle.y,
                  rotate: 360
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                onAnimationComplete={() => {
                  if (particle.id === particles.length - 1) {
                    onComplete();
                  }
                }}
              >
                <Icon className="w-6 h-6 text-yellow-400" />
              </motion.div>
            );
          })}
        </div>
      )}
    </AnimatePresence>
  );
};

// Hover glow effect for cards
export const GlowCard = ({ children, className, ...props }: any) => (
  <motion.div
    className={cn("relative", className)}
    whileHover={{
      boxShadow: "0 10px 30px rgba(59, 130, 246, 0.3)",
      y: -2
    }}
    transition={{ duration: 0.2 }}
    {...props}
  >
    {children}
  </motion.div>
);

// Progress indicator with micro-animations
export const AnimatedProgress = ({ progress, className }: { progress: number; className?: string }) => (
  <div className={cn("w-full bg-gray-200 rounded-full h-2 overflow-hidden", className)}>
    <motion.div
      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
      initial={{ width: 0 }}
      animate={{ width: `${progress}%` }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    />
  </div>
);

// Shake animation for errors
export const ShakeInput = ({ children, error }: { children: React.ReactNode; error: boolean }) => (
  <motion.div
    animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
    transition={{ duration: 0.4 }}
  >
    {children}
  </motion.div>
);

// Bouncing button for important actions
export const BouncingButton = ({ children, className, ...props }: any) => (
  <motion.button
    className={className}
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
    animate={{ y: [0, -5, 0] }}
    transition={{
      duration: 2,
      repeat: Infinity,
      repeatType: "reverse",
      ease: "easeInOut"
    }}
    {...props}
  >
    {children}
  </motion.button>
);

// Success checkmark animation
export const SuccessCheckmark = ({ show, onComplete }: { show: boolean; onComplete: () => void }) => (
  <AnimatePresence>
    {show && (
      <motion.div
        className="fixed inset-0 flex items-center justify-center bg-black/20 z-50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onComplete}
      >
        <motion.div
          className="bg-white rounded-full p-8 shadow-2xl"
          initial={{ scale: 0, rotate: 180 }}
          animate={{ scale: 1, rotate: 0 }}
          exit={{ scale: 0, rotate: -180 }}
          transition={{ duration: 0.5, ease: "backOut" }}
          onAnimationComplete={() => {
            setTimeout(() => onComplete(), 1500);
          }}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
            <Check className="w-16 h-16 text-green-500" />
          </motion.div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

// Typing indicator
export const TypingIndicator = () => (
  <div className="flex items-center gap-1">
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        className="w-2 h-2 bg-gray-400 rounded-full"
        animate={{ y: [0, -8, 0] }}
        transition={{
          duration: 0.6,
          repeat: Infinity,
          delay: i * 0.1
        }}
      />
    ))}
  </div>
);

// Morphing icon button
export const MorphingButton = ({ 
  icons, 
  currentIndex, 
  onClick, 
  className 
}: { 
  icons: any[]; 
  currentIndex: number; 
  onClick: () => void; 
  className?: string 
}) => {
  const CurrentIcon = icons[currentIndex];
  
  return (
    <motion.button
      onClick={onClick}
      className={cn("p-2 rounded-lg", className)}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ rotate: -90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          exit={{ rotate: 90, opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <CurrentIcon className="w-5 h-5" />
        </motion.div>
      </AnimatePresence>
    </motion.button>
  );
};