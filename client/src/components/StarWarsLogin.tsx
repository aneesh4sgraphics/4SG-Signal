import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface StarWarsLoginProps {
  onLogin: () => void;
}

export default function StarWarsLogin({ onLogin }: StarWarsLoginProps) {
  const [showCrawl, setShowCrawl] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    // Show crawl after brief delay
    const crawlTimer = setTimeout(() => {
      setShowCrawl(true);
    }, 1000);

    // Show login after crawl
    const loginTimer = setTimeout(() => {
      setShowLogin(true);
    }, 8000);

    return () => {
      clearTimeout(crawlTimer);
      clearTimeout(loginTimer);
    };
  }, []);

  return (
    <div className="star-wars-container">
      {/* Starfield Background */}
      <div className="starfield">
        {[...Array(100)].map((_, i) => (
          <div
            key={i}
            className="star"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 2}s`
            }}
          />
        ))}
      </div>

      {/* Star Wars Logo */}
      <div className="star-wars-logo">
        <h1>4S GRAPHICS</h1>
        <p>Employee Portal</p>
      </div>

      {/* Opening Crawl */}
      {showCrawl && (
        <div className="crawl-container">
          <div className="crawl">
            <div className="crawl-text">
              <h2>EPISODE IV</h2>
              <h3>A NEW QUOTE</h3>
              <p>
                It is a period of business growth. 
                Rebel designers, striking from their 
                hidden base, have won their first 
                victory against the evil Empire of 
                inefficient pricing.
              </p>
              <p>
                During the battle, rebel spies managed 
                to steal secret plans to the Empire's 
                ultimate weapon, the QUOTE CALCULATOR, 
                a powerful system with enough precision 
                to destroy an entire competitor's 
                pricing strategy.
              </p>
              <p>
                Pursued by the Empire's sinister agents, 
                Princess 4S races home aboard her 
                starship, custodian of the stolen plans 
                that can save her people and restore 
                freedom to the galaxy of graphics...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Login Button */}
      {showLogin && (
        <div className="login-section">
          <div className="login-card">
            <h2>Welcome, Young Padawan</h2>
            <p>Join the 4S Graphics Alliance</p>
            <Button 
              onClick={onLogin}
              className="login-btn"
              size="lg"
            >
              Enter the System
            </Button>
          </div>
        </div>
      )}


    </div>
  );
}