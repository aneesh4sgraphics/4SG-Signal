import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Star, Heart, Coffee, Sun, Zap } from 'lucide-react';

interface WelcomeAnimationProps {
  userName: string;
  onComplete: () => void;
}

const welcomeMessages = [
  "Welcome back, superstar! ✨",
  "Ready to create amazing quotes? 🚀",
  "Your pricing tools await! 💪",
  "Time to make magic happen! ⚡",
  "Let's build something great today! 🌟"
];

const motivationalQuotes = [
  "Great things never come from comfort zones!",
  "Every expert was once a beginner!",
  "Success is the sum of small efforts!",
  "Make today amazing!",
  "You've got this! 🔥"
];

const FloatingIcon = ({ icon: Icon, delay = 0 }: { icon: any; delay?: number }) => (
  <motion.div
    className="absolute text-4xl"
    initial={{ 
      opacity: 0, 
      scale: 0,
      rotate: -180,
      x: Math.random() * 100 - 50,
      y: Math.random() * 100 - 50
    }}
    animate={{ 
      opacity: [0, 1, 0],
      scale: [0, 1.2, 0],
      rotate: [0, 360],
      y: [0, -100]
    }}
    transition={{ 
      duration: 3,
      delay: delay,
      ease: "easeOut"
    }}
    style={{
      left: `${Math.random() * 80 + 10}%`,
      top: `${Math.random() * 80 + 10}%`,
      color: `hsl(${Math.random() * 360}, 70%, 60%)`
    }}
  >
    <Icon />
  </motion.div>
);

const WelcomeAnimation: React.FC<WelcomeAnimationProps> = ({ userName, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [showFireworks, setShowFireworks] = useState(false);
  
  const message = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
  const quote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];

  useEffect(() => {
    const timer1 = setTimeout(() => setCurrentStep(1), 800);
    const timer2 = setTimeout(() => setCurrentStep(2), 3000);
    const timer3 = setTimeout(() => setShowFireworks(true), 3500);
    const timer4 = setTimeout(() => setCurrentStep(3), 5000);
    const timer5 = setTimeout(() => onComplete(), 7000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);
    };
  }, [onComplete]);

  return (
    <motion.div
      className="fixed inset-0 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center z-50"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Animated Background Particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-white rounded-full"
            initial={{ 
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
              scale: 0
            }}
            animate={{
              scale: [0, 1, 0],
              opacity: [0, 1, 0],
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Fireworks */}
      {showFireworks && (
        <div className="absolute inset-0">
          {[Sparkles, Star, Heart, Coffee, Sun, Zap].map((Icon, i) => (
            <FloatingIcon key={i} icon={Icon} delay={i * 0.2} />
          ))}
        </div>
      )}

      {/* Main Content */}
      <div className="text-center text-white z-10">
        <AnimatePresence mode="wait">
          {currentStep >= 0 && (
            <motion.div
              key="welcome"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <motion.h1 
                className="text-6xl font-bold mb-4"
                animate={{ 
                  scale: [1, 1.1, 1],
                  textShadow: [
                    "0 0 20px rgba(255,255,255,0.5)",
                    "0 0 40px rgba(255,255,255,0.8)",
                    "0 0 20px rgba(255,255,255,0.5)"
                  ]
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                Hello, {userName}!
              </motion.h1>
            </motion.div>
          )}

          {currentStep >= 1 && (
            <motion.div
              key="message"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
            >
              <motion.p 
                className="text-2xl mb-6"
                animate={{ 
                  y: [0, -10, 0],
                }}
                transition={{ 
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                {message}
              </motion.p>
            </motion.div>
          )}

          {currentStep >= 2 && (
            <motion.div
              key="quote"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.6 }}
            >
              <motion.p 
                className="text-lg italic opacity-90"
                animate={{ 
                  opacity: [0.7, 1, 0.7],
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                "{quote}"
              </motion.p>
            </motion.div>
          )}

          {currentStep >= 3 && (
            <motion.div
              key="enter"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.9 }}
            >
              <motion.p 
                className="text-xl mt-8"
                animate={{ 
                  scale: [1, 1.05, 1],
                }}
                transition={{ 
                  duration: 1,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                Entering your workspace...
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pulse Animation */}
      <motion.div
        className="absolute inset-0 bg-white rounded-full opacity-10"
        animate={{
          scale: [0, 4],
          opacity: [0.3, 0],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeOut"
        }}
      />
    </motion.div>
  );
};

export default WelcomeAnimation;