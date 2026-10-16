import { useEffect, useRef, useState } from 'react';

const SCRIPT_ID = 'cloudflare-turnstile-script';
let turnstileLoadPromise;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (turnstileLoadPromise) return turnstileLoadPromise;

  turnstileLoadPromise = new Promise((resolve, reject) => {
    let timeout;
    const finish = (error) => {
      window.clearTimeout(timeout);
      if (error) {
        turnstileLoadPromise = undefined;
        document.getElementById(SCRIPT_ID)?.remove();
        reject(error);
      } else if (window.turnstile) {
        resolve();
      } else {
        finish(new Error('Cloudflare Turnstile loaded without its API.'));
      }
    };

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      if (existing.dataset.loaded === 'true' && window.turnstile) { finish(); return; }
      existing.addEventListener('load', () => finish(), { once: true });
      existing.addEventListener('error', () => finish(new Error('Cloudflare Turnstile could not load.')), { once: true });
      timeout = window.setTimeout(() => finish(new Error('Cloudflare Turnstile load timed out.')), 12000);
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => { script.dataset.loaded = 'true'; finish(); };
    script.onerror = () => finish(new Error('Cloudflare Turnstile could not load.'));
    timeout = window.setTimeout(() => finish(new Error('Cloudflare Turnstile load timed out.')), 12000);
    document.head.appendChild(script);
  });

  return turnstileLoadPromise;
}

export default function TurnstileCaptcha({ onToken, resetKey, enabled = true }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [widgetError, setWidgetError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!enabled || !siteKey || !containerRef.current) return undefined;
    let active = true;
    setWidgetError('');
    loadTurnstile().then(() => {
      if (!active || !containerRef.current) return;
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'light',
          size: containerRef.current.clientWidth < 300 ? 'compact' : 'flexible',
          callback: (token) => { onToken(token); setWidgetError(''); },
          'expired-callback': () => { onToken(''); setWidgetError('The security check expired. Please complete it again.'); },
          'timeout-callback': () => { onToken(''); setWidgetError('The security check timed out. Please try again.'); },
          'error-callback': (code) => {
            onToken('');
            setWidgetError(`The security check could not start${code ? ` (${code})` : ''}. Check your connection or retry.`);
          },
          'unsupported-callback': () => {
            onToken('');
            setWidgetError('This browser cannot run the security check. Try an updated browser or disable content-blocking extensions for this site.');
          },
        });
      } catch {
        setWidgetError('The security check could not be displayed. Please retry.');
      }
    }).catch(() => {
      if (active) {
        onToken('');
      setWidgetError('Could not load Cloudflare security check. Check your connection and retry.');
      }
    });
    return () => {
      active = false;
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [enabled, siteKey, retryKey, onToken]);

  useEffect(() => {
    if (!enabled || !resetKey || widgetIdRef.current === null || !window.turnstile) return;
    window.turnstile.reset(widgetIdRef.current);
    onToken('');
    setWidgetError('');
  }, [enabled, resetKey, onToken]);

  if (!enabled) return null;
  if (!siteKey) return <p className="captcha-config-error">CAPTCHA is not configured. Add the Turnstile site key to the client environment.</p>;
  return <div className="captcha-box"><div ref={containerRef} />{widgetError ? <p className="captcha-error" role="alert">{widgetError} <button type="button" onClick={() => { onToken(''); setRetryKey((key) => key + 1); }}>Retry security check</button></p> : <small>Protected by Cloudflare Turnstile</small>}</div>;
}
