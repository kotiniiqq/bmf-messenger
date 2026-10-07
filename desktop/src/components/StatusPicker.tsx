import { useState } from 'react';
import type { StatusId, User } from '@bmf/shared';
import { api } from '../api/client.js';
import { t } from '../i18n/index.js';
import { useApp } from '../store/app.js';
import { STATUSES, statusById } from '../status.js';
import { LeftPanel } from './LeftPanel.js';
import { toast } from './Toast.js';

/**
 * The prototype's `lpMode === 'status'`. Everything here is stored server-side,
 * so the status follows the account to another device rather than living in
 * this window.
 */
export function StatusPicker({
  user,
  onClose,
  onBack,
}: {
  user: User;
  onClose: () => void;
  /** Present when this was opened from settings, so there is somewhere to go back to. */
  onBack?: () => void;
}) {
  const setUser = useApp((s) => s.setUser);

  const [statusId, setStatusId] = useState<StatusId>(user.statusId);
  const [text, setText] = useState(user.statusText ?? '');
  const [auto, setAuto] = useState(user.statusAuto);
  const [busy, setBusy] = useState(false);

  const preset = statusById(statusId);

  async function save() {
    setBusy(true);
    try {
      const updated = await api.updateMe({
        statusId,
        statusText: text.trim() || null,
        statusAuto: auto,
      });
      setUser(updated);
      onClose();
      toast(t('statusPicker.saved', { status: text.trim() || t(preset.title) }));
    } catch {
      toast(t('statusPicker.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <LeftPanel
      title={t('statusPicker.title')}
      onClose={onClose}
      onBack={onBack}
      footer={{ label: t('common.save'), enabled: !busy, onClick: () => void save() }}
    >
      <div className="ct-sub" style={{ padding: '0 4px 10px' }}>
        {t('statusPicker.now')} <span style={{ fontSize: 13 }}>{preset.emoji}</span>{' '}
        <b style={{ color: 'var(--txt)' }}>{text.trim() || t(preset.title)}</b>
      </div>

      <div className="st-pick">
        {STATUSES.map((status) => (
          <button
            key={status.id}
            className={`st-opt${statusId === status.id ? ' on' : ''}`}
            onClick={() => setStatusId(status.id)}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>{status.emoji}</span>
            {t(status.title)}
          </button>
        ))}
      </div>

      <div className="sp-slbl">{t('statusPicker.custom')}</div>
      <input
        className="wz-inp"
        maxLength={40}
        value={text}
        placeholder={t('statusPicker.customPlaceholder')}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="ct-sub" style={{ padding: '5px 4px' }}>
        {t('statusPicker.customHint')}
      </div>

      <div className="sp-div" />

      <div className="sub-row">
        <div>
          <div className="sub-row-label">{t('statusPicker.auto')}</div>
          <div className="sub-row-desc">{t('statusPicker.autoHint')}</div>
        </div>
        <div className={`tog${auto ? ' on' : ''}`} onClick={() => setAuto((on) => !on)} />
      </div>
    </LeftPanel>
  );
}
