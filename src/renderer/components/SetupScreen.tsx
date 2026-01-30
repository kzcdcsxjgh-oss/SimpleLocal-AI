import React from 'react';

interface SetupScreenProps {
  progress: number;
  error?: string;
}

const SetupScreen: React.FC<SetupScreenProps> = ({ progress, error }) => {
  // Friendly messages for different stages
  const getMessage = (progress: number): string => {
    if (progress < 10) return 'Starting up...';
    if (progress < 50) return 'Loading language understanding...';
    if (progress < 95) return 'Loading conversation ability...';
    return 'Almost ready...';
  };

  return (
    <div className="setup-screen">
      <div className="setup-screen__content">
        {/* Friendly icon */}
        <div className="setup-screen__icon">
          {error ? '😕' : '🤖'}
        </div>

        {/* Title */}
        <h1 className="setup-screen__title">
          {error ? 'Oops!' : 'Setting Up Your Assistant'}
        </h1>

        {/* Message */}
        <p className="setup-screen__message">
          {error
            ? 'Something went wrong while setting up.'
            : "This is a one-time setup. We're preparing the AI so it can run privately on your computer."
          }
        </p>

        {/* Progress bar or error */}
        {error ? (
          <div className="setup-screen__error">
            <p>{error}</p>
            <p className="setup-screen__hint">
              Please check your internet connection and restart the app.
            </p>
          </div>
        ) : (
          <>
            <div className="setup-screen__progress">
              <div
                className="setup-screen__progress-bar"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="setup-screen__status">
              {getMessage(progress)}
            </p>
          </>
        )}

        {/* Privacy note */}
        <div className="setup-screen__privacy">
          <span className="setup-screen__privacy-icon">🔒</span>
          <span>After setup, everything runs offline on your computer.</span>
        </div>
      </div>
    </div>
  );
};

export default SetupScreen;
