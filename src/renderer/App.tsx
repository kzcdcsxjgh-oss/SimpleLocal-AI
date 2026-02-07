import React, { useState, useEffect } from 'react';
import PrivacyFilterScreen from './components/PrivacyFilterScreen';

const App: React.FC = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // App is ready once the component mounts - no AI dependency needed
    setReady(true);

    const unsubscribe = window.electronAPI.onAppReady(() => {
      setReady(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  if (!ready) {
    return (
      <div className="app-loading">
        <div className="processing__spinner"></div>
        <p>Laden...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div>
          <h1 className="header__title">MakeItPrivate</h1>
          <p className="header__subtitle">Privacy Filter - Gevoelige informatie verwijderen</p>
        </div>
        <div className="header__actions">
          <div className="status status--online">
            <span className="status__dot"></span>
            Lokaal actief
          </div>
        </div>
      </header>

      {/* Main content: Privacy Filter */}
      <PrivacyFilterScreen />
    </div>
  );
};

export default App;
