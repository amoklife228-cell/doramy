import { useState } from 'react';

const KEY = 'doramy.installHint.dismissed';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);
}

/** Подсказка «установите на экран Домой», когда сайт открыт в Safari, а не как приложение. */
export function InstallHint() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  if (dismissed || isStandalone() || !isIOS()) return null;

  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  return (
    <div className="hint">
      <div className="hint-text">
        <strong>Установите как приложение</strong>
        <span>Нажмите «Поделиться» внизу Safari и выберите «На экран “Домой”». Панель браузера исчезнет, откроется на весь экран.</span>
      </div>
      <button className="hint-close" onClick={close} aria-label="Скрыть подсказку">
        ✕
      </button>
    </div>
  );
}
