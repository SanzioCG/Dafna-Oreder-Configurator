import { useEffect, useRef, useState } from 'react';

/**
 * D-13: idle reset. After `timeoutS` without a touch, key or wheel the session ends; the last
 * `warnS` seconds show a countdown ("Hali shu yerdamisiz?") that any touch cancels. A customer
 * who walks away never leaves a half-filled configuration or contact data for the next person.
 */
export const CUSTOMER_IDLE_S = 120;
export const STAFF_IDLE_S = 300;
export const IDLE_WARN_S = 20;

const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export function useIdle({
  enabled,
  timeoutS,
  warnS = IDLE_WARN_S,
  onIdle,
}: {
  enabled: boolean;
  timeoutS: number;
  /** 0 = no warning, end silently */
  warnS?: number;
  onIdle: () => void;
}): { secondsLeft: number | null; stay: () => void } {
  const last = useRef(Date.now());
  const idleRef = useRef(onIdle);
  idleRef.current = onIdle;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSecondsLeft(null);
      return;
    }
    last.current = Date.now();
    const touch = () => {
      last.current = Date.now();
    };
    for (const e of ACTIVITY) document.addEventListener(e, touch, { passive: true, capture: true });
    const timer = window.setInterval(() => {
      const left = timeoutS - Math.floor((Date.now() - last.current) / 1000);
      if (left <= 0) {
        window.clearInterval(timer);
        setSecondsLeft(null);
        idleRef.current();
      } else setSecondsLeft(warnS > 0 && left <= warnS ? left : null);
    }, 250);
    return () => {
      window.clearInterval(timer);
      for (const e of ACTIVITY) document.removeEventListener(e, touch, { capture: true });
    };
  }, [enabled, timeoutS, warnS]);

  return {
    secondsLeft,
    stay: () => {
      last.current = Date.now();
      setSecondsLeft(null);
    },
  };
}
