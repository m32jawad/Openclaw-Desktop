import React, { useState, useEffect } from 'react';
import TitleBar from './components/TitleBar';
import InstallScreen from './components/InstallScreen';
import Onboarding from './components/Onboarding';
import MainApp from './components/MainApp';

function App() {
  const [appState, setAppState] = useState('loading'); // loading, install, onboarding, main

  useEffect(() => {
    const checkApplicationState = async () => {
      try {
        const isReady = await window.electronAPI.isSystemReady();
        
        if (isReady.ready) {
          const onboardingDone = await window.electronAPI.getOnboardingStatus();
          if (onboardingDone) {
            setAppState('main');
          } else {
            setAppState('onboarding');
          }
        } else {
          setAppState('install');
        }
      } catch (error) {
        console.error('Error checking app state:', error);
        setAppState('install');
      }
    };

    checkApplicationState();
  }, []);

  const handleInstallComplete = async () => {
    const onboardingDone = await window.electronAPI.getOnboardingStatus();
    if (onboardingDone) {
      setAppState('main');
    } else {
      setAppState('onboarding');
    }
  };

  const handleOnboardingComplete = async () => {
    await window.electronAPI.setOnboardingComplete();
    setAppState('main');
  };

  const renderContent = () => {
    switch (appState) {
      case 'loading':
        return (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <div className="spinner" style={{ width: 48, height: 48 }}></div>
            <p style={{ marginTop: 20, color: 'var(--text-secondary)' }}>Loading...</p>
          </div>
        );
      
      case 'install':
        return (
          <div className="install-screen">
            <InstallScreen onComplete={handleInstallComplete} />
          </div>
        );
      
      case 'onboarding':
        return <Onboarding onComplete={handleOnboardingComplete} />;
      
      case 'main':
        return <MainApp />;
      
      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      <TitleBar />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {renderContent()}
      </div>
    </div>
  );
}

export default App;
