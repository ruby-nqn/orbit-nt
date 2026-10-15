import { useEffect, useId, useState } from 'react';
import type { HeaderSettings } from '../core/types';
import {
  defaultHeaderSettings,
  quoteBlock,
  validateHeaderSettings,
  validateQuote,
  validateQuoteList,
} from '../core/quotes';

function QuoteField({
  label,
  value,
  multiline = false,
  onSave,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const id = useId();
  useEffect(() => {
    setDraft(value);
    setError('');
  }, [value]);
  const save = () => {
    try {
      onSave(draft);
      setError('');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not save this text.',
      );
    }
  };
  const props = {
    id,
    className: 'text-input',
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: save,
    'aria-invalid': !!error,
    'aria-describedby': `${id}-hint${error ? ` ${id}-error` : ''}`,
  };
  return (
    <div className="header-quote-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? (
        <textarea {...props} rows={7} maxLength={12100} spellCheck />
      ) : (
        <input {...props} maxLength={120} />
      )}
      <small id={`${id}-hint`} className="muted">
        {multiline ? 'One quote per line, up to 100 quotes. ' : ''}Up to 120
        characters per quote. Saves when you leave this field.
      </small>
      {error && (
        <p id={`${id}-error`} className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function HeaderSettingsPanel({
  settings,
  onChange,
  now,
}: {
  settings: HeaderSettings;
  onChange: (patch: Partial<HeaderSettings>) => void;
  now: number;
}) {
  const [start, setStart] = useState(settings.workStart);
  const [end, setEnd] = useState(settings.workEnd);
  const [error, setError] = useState('');
  const [reset, setReset] = useState(0);
  useEffect(() => {
    setStart(settings.workStart);
    setEnd(settings.workEnd);
    setError('');
  }, [settings.workStart, settings.workEnd]);
  const saveTimes = () => {
    try {
      validateHeaderSettings({ ...settings, workStart: start, workEnd: end });
      onChange({ workStart: start, workEnd: end });
      setError('');
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not save these hours.',
      );
    }
  };
  const current = quoteBlock(settings, now);
  return (
    <>
      <section className="settings-section">
        <h3>A few words to start</h3>
        <label className="setting-row">
          <span>
            Change the quote on each new tab
            <small>Choose a fresh quote when you open or reload Orbit.</small>
          </span>
          <input
            className="switch"
            type="checkbox"
            checked={settings.rotate}
            onChange={(e) => onChange({ rotate: e.target.checked })}
          />
        </label>
        {!settings.rotate && (
          <QuoteField
            key={`fixed-${reset}`}
            label="Fixed quote"
            value={settings.fixedQuote}
            onSave={(value) => onChange({ fixedQuote: validateQuote(value) })}
          />
        )}
        {settings.rotate && (
          <label className="setting-row">
            <span>
              Choose quotes by time of day
              <small>
                {settings.scheduled
                  ? 'Work and Leisure each have their own quotes.'
                  : 'Both quote lists are mixed throughout the day.'}
              </small>
            </span>
            <input
              className="switch"
              type="checkbox"
              checked={settings.scheduled}
              onChange={(e) => onChange({ scheduled: e.target.checked })}
            />
          </label>
        )}
      </section>
      {settings.rotate && (
        <>
          <section className="settings-section">
            <h3>
              Work hours{' '}
              {settings.scheduled && current === 'work' && (
                <span className="header-period-badge">Now</span>
              )}
            </h3>
            <fieldset
              className="header-time-fields"
              disabled={!settings.scheduled}
            >
              <div className="folder-time-range">
                <label>
                  From
                  <input
                    aria-label="Work hours start"
                    className="text-input"
                    type="time"
                    required
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    onBlur={saveTimes}
                    aria-invalid={!!error}
                  />
                </label>
                <span>to</span>
                <label>
                  Until
                  <input
                    aria-label="Work hours end"
                    className="text-input"
                    type="time"
                    required
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    onBlur={saveTimes}
                    aria-invalid={!!error}
                  />
                </label>
              </div>
            </fieldset>
            <p className="muted header-hours-hint">
              Every day, in your device’s local timezone. Hours save when you
              leave a field.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <QuoteField
              key={`work-${reset}`}
              label="Work quotes"
              multiline
              value={settings.workQuotes.join('\n')}
              onSave={(value) =>
                onChange({
                  workQuotes: validateQuoteList(
                    value
                      .split(/\r?\n/)
                      .map((line) => line.trim())
                      .filter(Boolean),
                  ),
                })
              }
            />
          </section>
          <section className="settings-section">
            <h3>
              Leisure hours{' '}
              {settings.scheduled && current === 'leisure' && (
                <span className="header-period-badge">Now</span>
              )}
            </h3>
            <p className="muted">
              {settings.scheduled
                ? `${settings.workEnd}–${settings.workStart}, automatically covering all time outside Work hours.`
                : 'These quotes are mixed with Work quotes while time blocks are off.'}
            </p>
            <QuoteField
              key={`leisure-${reset}`}
              label="Leisure quotes"
              multiline
              value={settings.leisureQuotes.join('\n')}
              onSave={(value) =>
                onChange({
                  leisureQuotes: validateQuoteList(
                    value
                      .split(/\r?\n/)
                      .map((line) => line.trim())
                      .filter(Boolean),
                  ),
                })
              }
            />
          </section>
        </>
      )}
      <section className="settings-section">
        <button
          className="text-button"
          onClick={() => {
            const defaults = defaultHeaderSettings();
            onChange(defaults);
            setStart(defaults.workStart);
            setEnd(defaults.workEnd);
            setError('');
            setReset((value) => value + 1);
          }}
        >
          Restore default header settings
        </button>
      </section>
    </>
  );
}
