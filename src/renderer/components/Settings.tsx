import React, { useState, useEffect } from 'react';

type LLMProvider = 'ollama' | 'openai';

interface LLMSettings {
  provider?: LLMProvider;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  hasApiKey?: boolean;
}

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const Settings: React.FC<SettingsProps> = ({ isOpen, onClose }) => {
  const [provider, setProvider] = useState<LLMProvider>('ollama');
  const [baseUrl, setBaseUrl] = useState('http://localhost:11434');
  const [model, setModel] = useState('llama3.2');
  const [apiKey, setApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    try {
      const settings = await window.electronAPI.getSettings();
      setProvider(settings.llm.provider || 'ollama');
      setBaseUrl(settings.llm.baseUrl || getDefaultBaseUrl(settings.llm.provider || 'ollama'));
      setModel(settings.llm.model || getDefaultModel(settings.llm.provider || 'ollama'));
      setHasApiKey(settings.llm.hasApiKey || false);
      setApiKey('');
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  };

  const getDefaultBaseUrl = (p: LLMProvider): string => {
    return p === 'openai' ? 'https://api.openai.com/v1' : 'http://localhost:11434';
  };

  const getDefaultModel = (p: LLMProvider): string => {
    return p === 'openai' ? 'gpt-4o-mini' : 'llama3.2';
  };

  const handleProviderChange = (newProvider: LLMProvider) => {
    setProvider(newProvider);
    setBaseUrl(getDefaultBaseUrl(newProvider));
    setModel(getDefaultModel(newProvider));
    setError(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const settings: { llm: LLMSettings } = {
        llm: {
          provider,
          baseUrl,
          model,
          apiKey: apiKey || (hasApiKey ? '••••••••' : undefined),
        },
      };

      const result = await window.electronAPI.setSettings(settings);

      if (result.success) {
        if (!result.ready) {
          setError(
            provider === 'openai'
              ? 'Kon geen verbinding maken met OpenAI. Controleer je API key.'
              : 'Kon geen verbinding maken met Ollama. Is Ollama gestart?'
          );
        } else {
          onClose();
        }
      }
    } catch (err) {
      setError('Er ging iets mis bij het opslaan.');
      console.error('Error saving settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Instellingen</h2>
          <button className="settings-close" onClick={onClose} aria-label="Sluiten">
            ✕
          </button>
        </div>

        <div className="settings-content">
          <div className="settings-section">
            <label className="settings-label">LLM Provider</label>
            <div className="settings-radio-group">
              <label className="settings-radio">
                <input
                  type="radio"
                  name="provider"
                  value="ollama"
                  checked={provider === 'ollama'}
                  onChange={() => handleProviderChange('ollama')}
                />
                <span className="settings-radio-label">
                  <strong>Ollama</strong>
                  <small>Lokaal, privé, gratis</small>
                </span>
              </label>
              <label className="settings-radio">
                <input
                  type="radio"
                  name="provider"
                  value="openai"
                  checked={provider === 'openai'}
                  onChange={() => handleProviderChange('openai')}
                />
                <span className="settings-radio-label">
                  <strong>OpenAI</strong>
                  <small>Cloud, betaald per gebruik</small>
                </span>
              </label>
            </div>
          </div>

          {provider === 'openai' && (
            <div className="settings-section">
              <label className="settings-label" htmlFor="apiKey">
                API Key {hasApiKey && <span className="settings-hint">(al ingesteld)</span>}
              </label>
              <input
                id="apiKey"
                type="password"
                className="settings-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasApiKey ? '••••••••' : 'sk-...'}
              />
            </div>
          )}

          <div className="settings-section">
            <label className="settings-label" htmlFor="baseUrl">
              Base URL
            </label>
            <input
              id="baseUrl"
              type="text"
              className="settings-input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          <div className="settings-section">
            <label className="settings-label" htmlFor="model">
              Model
            </label>
            <input
              id="model"
              type="text"
              className="settings-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider === 'openai' ? 'gpt-4o-mini' : 'llama3.2'}
            />
            <small className="settings-help">
              {provider === 'openai'
                ? 'Bijv. gpt-4o, gpt-4o-mini, gpt-3.5-turbo'
                : 'Bijv. llama3.2, mistral, phi3'}
            </small>
          </div>

          {error && <div className="settings-error">{error}</div>}
        </div>

        <div className="settings-footer">
          <button className="settings-btn settings-btn--secondary" onClick={onClose}>
            Annuleren
          </button>
          <button
            className="settings-btn settings-btn--primary"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
