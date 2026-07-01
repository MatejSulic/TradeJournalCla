import { useTheme } from '../contexts/ThemeContext';

export function useThemeColors() {
  const { isDark } = useTheme();
  return isDark
    ? {
        tooltipBg: '#111111',
        tooltipBorder: '#2a2a2a',
        grid: '#1f1f1f',
        tick: '#4b5563',
        colorMain: '#c6f135',
        colorNeg: '#7c3aed',
        breakeven: '#3f3f3f',
        labelColor: '#6b7280',
        cursorStroke: '#2a2a2a',
      }
    : {
        tooltipBg: '#ffffff',
        tooltipBorder: '#e2e8f0',
        grid: '#e2e8f0',
        tick: '#94a3b8',
        colorMain: '#65a30d',
        colorNeg: '#7c3aed',
        breakeven: '#94a3b8',
        labelColor: '#94a3b8',
        cursorStroke: '#e2e8f0',
      };
}
