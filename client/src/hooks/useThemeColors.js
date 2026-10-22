import { useTheme } from '../contexts/ThemeContext';

// Chart colors for the current theme — keep in sync with the CSS variables in index.css
export function useThemeColors() {
  const { isDark } = useTheme();
  return isDark
    ? {
        isDark: true,
        colorMain: '#4F7BFF',
        colorNeg: '#FF5C78',
        breakeven: '#64748B',
        accentSoft: '#1E2B4D',
        grid: '#2A3245',
        tick: '#64748B',
        labelColor: '#94A3B8',
        itemColor: '#FFFFFF',
        tooltipBg: '#1F2636',
        tooltipBorder: '#2A3245',
        tooltipShadow: '0 8px 24px rgba(0,0,0,0.35)',
        cursorStroke: '#2A3245',
      }
    : {
        isDark: false,
        colorMain: '#2563EB',
        colorNeg: '#F04461',
        breakeven: '#94A3B8',
        accentSoft: '#DBE6FE',
        grid: '#E4E8EF',
        tick: '#94A3B8',
        labelColor: '#64748B',
        itemColor: '#1E293B',
        tooltipBg: '#FFFFFF',
        tooltipBorder: '#E4E8EF',
        tooltipShadow: '0 8px 24px rgba(15,23,42,0.12)',
        cursorStroke: '#E4E8EF',
      };
}

// Shared Recharts <Tooltip> styling: card-coloured bubble, no border, soft shadow
export function tooltipProps(colors) {
  return {
    contentStyle: { background: colors.tooltipBg, border: 'none', borderRadius: 12, fontSize: 12, boxShadow: colors.tooltipShadow },
    labelStyle: { color: colors.labelColor },
    itemStyle: { color: colors.itemColor },
  };
}
