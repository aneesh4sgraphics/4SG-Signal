import { useEffect, useState } from "react";

interface FirecrackerAnimationProps {
  isVisible: boolean;
  duration?: number;
}

const FirecrackerAnimation = ({ isVisible, duration = 3000 }: FirecrackerAnimationProps) => {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; color: string; delay: number }>>([]);

  useEffect(() => {
    if (isVisible) {
      // Generate firecracker particles
      const newParticles = [];
      const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b', '#eb4d4b', '#6c5ce7', '#a29bfe', '#fd79a8', '#e17055'];
      
      // Create multiple explosion points
      for (let explosion = 0; explosion < 5; explosion++) {
        const explosionX = Math.random() * 100; // Random position across screen
        const explosionY = 20 + Math.random() * 60; // Upper portion of screen
        
        for (let i = 0; i < 20; i++) {
          newParticles.push({
            id: explosion * 20 + i,
            x: explosionX,
            y: explosionY,
            color: colors[Math.floor(Math.random() * colors.length)],
            delay: explosion * 300 + Math.random() * 500, // Stagger explosions
          });
        }
      }
      
      setParticles(newParticles);
      
      // Clear particles after animation
      setTimeout(() => setParticles([]), duration);
    }
  }, [isVisible, duration]);

  if (!isVisible || particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute w-2 h-2 rounded-full animate-ping"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            backgroundColor: particle.color,
            animationDelay: `${particle.delay}ms`,
            animationDuration: '1.5s',
            transform: `translate(-50%, -50%) rotate(${Math.random() * 360}deg)`,
          }}
        >
          {/* Sparkle effect */}
          <div
            className="absolute inset-0 rounded-full animate-pulse"
            style={{
              backgroundColor: particle.color,
              filter: 'blur(1px)',
              animationDelay: `${particle.delay + 200}ms`,
            }}
          />
        </div>
      ))}
      
      {/* Additional sparkle effects */}
      {Array.from({ length: 30 }).map((_, i) => (
        <div
          key={`sparkle-${i}`}
          className="absolute w-1 h-1 bg-yellow-300 rounded-full animate-ping"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 2000}ms`,
            animationDuration: '0.5s',
          }}
        />
      ))}
    </div>
  );
};

export default FirecrackerAnimation;