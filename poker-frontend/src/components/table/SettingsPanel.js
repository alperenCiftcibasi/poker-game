import React, { useState } from 'react';

// Masa ayarları paneli (oylama önerisi). Faz 1-2'deki davranış korunur, sadece taşındı.
function SettingsPanel({ settings, settingLabels, onProposeSettingChange, onClose }) {
  const [selectedSetting, setSelectedSetting] = useState('smallBlind');
  const [proposedValue, setProposedValue] = useState('');

  const submit = () => {
    let val = Number(proposedValue);
    if (selectedSetting === 'turnTimerDuration') val = val * 1000;
    onProposeSettingChange(selectedSetting, val);
    setProposedValue('');
    onClose();
  };

  return (
    <div className="pk-settings">
      <h4>Masa Ayarları</h4>
      <div className="pk-settings-rows">
        {Object.entries(settingLabels).map(([key, label]) => (
          <div key={key} className="pk-settings-row">
            <span className="k">{label}</span>
            <span className="v">
              {key === 'turnTimerDuration' ? `${(settings[key] || 0) / 1000}s` : (settings[key] ?? '-')}
            </span>
          </div>
        ))}
      </div>
      <div className="pk-settings-form">
        <select value={selectedSetting} onChange={(e) => setSelectedSetting(e.target.value)}>
          {Object.entries(settingLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <input
          type="number"
          placeholder={selectedSetting === 'turnTimerDuration' ? 'Saniye' : 'Yeni değer'}
          value={proposedValue}
          onChange={(e) => setProposedValue(e.target.value)}
        />
        <button className="pk-btn-propose" disabled={!proposedValue} onClick={submit}>Öneri Yap</button>
      </div>
    </div>
  );
}

export default SettingsPanel;
