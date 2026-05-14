import { useState, useEffect } from 'react';

/**
 * Drop-in replacement for useState that persists to localStorage.
 * Data survives page reloads, browser restarts, and iPhone home-screen launches.
 *
 * @param {string} key        - localStorage key (must be unique per piece of state)
 * @param {*}      initial    - initial value if nothing is stored yet
 */
export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('localStorage write failed:', e);
    }
  }, [key, value]);

  return [value, setValue];
}
