import { useState, useEffect, useCallback } from 'react';
import { getProfile } from '../api';

// Full class strings required so Tailwind includes them in the build
export const TIER_STYLES = {
  bronze: {
    label:  'Bronze',
    text:   'text-amber-500',
    bar:    'bg-amber-500',
    bg:     'bg-amber-500/10',
    border: 'border-amber-500/30',
  },
  silver: {
    label:  'Silver',
    text:   'text-slate-300',
    bar:    'bg-slate-300',
    bg:     'bg-slate-300/10',
    border: 'border-slate-300/30',
  },
  gold: {
    label:  'Gold',
    text:   'text-yellow-400',
    bar:    'bg-yellow-400',
    bg:     'bg-yellow-400/10',
    border: 'border-yellow-400/30',
  },
  diamond: {
    label:  'Diamond',
    text:   'text-cyan-300',
    bar:    'bg-cyan-300',
    bg:     'bg-cyan-300/10',
    border: 'border-cyan-300/30',
  },
};

export function useGamification() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    return getProfile().then(setProfile).catch(console.error);
  }, []);

  useEffect(() => {
    getProfile()
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return { profile, loading, refetch };
}
