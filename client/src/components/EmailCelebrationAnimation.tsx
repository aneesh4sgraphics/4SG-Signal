import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, CheckCircle, Sparkles, Send, Star, Heart } from 'lucide-react';

interface EmailCelebrationAnimationProps {
  onComplete: () => void;
  isVisible?: boolean;
  onClose?: () => void;
  emailCount?: number;
  recipientEmail?: string;
}

const FloatingIcon = ({ icon: Icon, delay = 0 }: { icon: any; delay?: number }) => (
  <motion.div
    className="absolute text-3xl"
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
      y: [0, -80]
    }}
    transition={{ 
      duration: 2.5,
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

const EmailCelebrationAnimation: React.FC<EmailCelebrationAnimationProps> = ({ 
  onComplete,
  isVisible = true, 
  onClose, 
  emailCount = 1, 
  recipientEmail = "customer" 
}) => {
  const [showFireworks, setShowFireworks] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (isVisible) {
      const timer1 = setTimeout(() => setCurrentStep(1), 500);
      const timer2 = setTimeout(() => setShowFireworks(true), 1000);
      const timer3 = setTimeout(() => setCurrentStep(2), 1500);
      const timer4 = setTimeout(() => {
        onComplete();
        onClose && onClose();
      }, 3000);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
        clearTimeout(timer4);
      };
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  const celebrationMessages = [
    "Email sent successfully! 🎉",
    "Quote delivered! ✨",
    "Another happy customer! 🚀",
    "Professional quote on its way! 📧"
  ];

  const message = celebrationMessages[Math.floor(Math.random() * celebrationMessages.length)];

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-white rounded-2xl p-8 max-w-md mx-4 text-center shadow-2xl relative overflow-hidden"
            initial={{ scale: 0.5, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: -20 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
          >
            {/* Fireworks Effect */}
            {showFireworks && (
              <div className="absolute inset-0 pointer-events-none">
                {[...Array(6)].map((_, i) => (
                  <FloatingIcon
                    key={i}
                    icon={[Mail, CheckCircle, Sparkles, Send, Star, Heart][i]}
                    delay={i * 0.2}
                  />
                ))}
              </div>
            )}

            {/* Success Icon */}
            <motion.div
              className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: "spring", damping: 10 }}
            >
              <CheckCircle className="w-8 h-8 text-green-600" />
            </motion.div>

            {/* Main Message */}
            <AnimatePresence mode="wait">
              {currentStep >= 0 && (
                <motion.div
                  key="message"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: 0.3 }}
                >
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    {message}
                  </h3>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Details */}
            <AnimatePresence mode="wait">
              {currentStep >= 1 && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: 0.5 }}
                  className="space-y-2"
                >
                  <p className="text-gray-600">
                    Your professional quote has been sent to
                  </p>
                  <p className="text-blue-600 font-semibold">
                    {recipientEmail}
                  </p>
                  {emailCount > 1 && (
                    <p className="text-sm text-gray-500">
                      ({emailCount} emails sent today)
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Success Message */}
            <AnimatePresence mode="wait">
              {currentStep >= 2 && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ delay: 0.7 }}
                  className="mt-4"
                >
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-700 font-medium">
                      Keep up the great work! 🌟
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default EmailCelebrationAnimation;