import { useState, useRef, useEffect } from 'react';
import { getDaysInMonth } from 'date-fns';

const ITEM_H = 46;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CUR_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CUR_YEAR - 2017 + 2 }, (_, i) => 2018 + i);

function parseDate(value) {
  const now = new Date();
  if (!value) return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), time: '09:00' };
  const [datePart = '', timePart = '09:00'] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  return {
    year: y || now.getFullYear(),
    month: m || now.getMonth() + 1,
    day: d || now.getDate(),
    time: timePart.slice(0, 5) || '09:00',
  };
}

function WheelColumn({ items, value, onChange, fmt = v => String(v).padStart(2, '0'), width = 56 }) {
  const ref = useRef();
  const userScrolling = useRef(false);
  const timer = useRef();

  useEffect(() => {
    if (!ref.current) return;
    const idx = items.indexOf(value);
    if (idx >= 0) ref.current.scrollTop = idx * ITEM_H;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (userScrolling.current || !ref.current) return;
    const idx = items.indexOf(value);
    if (idx >= 0) ref.current.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
  }, [value, items]);

  const handleScroll = () => {
    userScrolling.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      userScrolling.current = false;
      if (!ref.current) return;
      const idx = Math.round(ref.current.scrollTop / ITEM_H);
      const item = items[Math.max(0, Math.min(idx, items.length - 1))];
      if (item !== undefined && item !== value) onChange(item);
    }, 100);
  };

  return (
    <div className="relative" style={{ width }}>
      <div className="absolute inset-x-0 top-0 h-16 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to bottom, #111111 20%, transparent 100%)' }} />
      <div className="absolute inset-x-0 bottom-0 h-16 pointer-events-none z-10"
        style={{ background: 'linear-gradient(to top, #111111 20%, transparent 100%)' }} />
      <div className="absolute inset-x-1 rounded-lg pointer-events-none"
        style={{ top: ITEM_H * 2, height: ITEM_H, background: 'rgba(255,255,255,0.06)' }} />
      <div
        ref={ref}
        onScroll={handleScroll}
        style={{
          height: ITEM_H * 5,
          overflowY: 'scroll',
          scrollSnapType: 'y mandatory',
          paddingTop: ITEM_H * 2,
          paddingBottom: ITEM_H * 2,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {items.map(item => (
          <div
            key={item}
            onClick={() => onChange(item)}
            style={{ height: ITEM_H, scrollSnapAlign: 'center', scrollSnapStop: 'always' }}
            className={`flex items-center justify-center text-sm cursor-pointer select-none transition-colors
              ${item === value ? 'text-white font-semibold' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {fmt(item)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DatePicker({ value, onChange, withTime = false, placeholder = 'Select date', className = '' }) {
  const p = parseDate(value);
  const [open, setOpen] = useState(false);
  const [year, setYear]   = useState(p.year);
  const [month, setMonth] = useState(p.month);
  const [day, setDay]     = useState(p.day);
  const [time, setTime]   = useState(p.time);
  const wrapRef = useRef();

  useEffect(() => {
    const q = parseDate(value);
    setYear(q.year); setMonth(q.month); setDay(q.day);
    if (withTime) setTime(q.time);
  }, [value, withTime]);

  useEffect(() => {
    if (!open) return;
    const handler = e => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const pad = n => String(n).padStart(2, '0');

  const emit = (y, m, d, t = time) => {
    const dateStr = `${y}-${pad(m)}-${pad(d)}`;
    onChange(withTime ? `${dateStr}T${t}` : dateStr);
  };

  const clampDay = (y, m, d) => Math.min(d, getDaysInMonth(new Date(y, m - 1)));

  const handleYear  = y => { const d = clampDay(y, month, day); setYear(y); setDay(d); emit(y, month, d); };
  const handleMonth = m => { const d = clampDay(year, m, day); setMonth(m); setDay(d); emit(year, m, d); };
  const handleDay   = d => { setDay(d); emit(year, month, d); };
  const handleTime  = t => { setTime(t); emit(year, month, day, t); };

  const days   = Array.from({ length: getDaysInMonth(new Date(year, month - 1)) }, (_, i) => i + 1);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const label = value
    ? `${MONTHS[month - 1]} ${pad(day)}, ${year}${withTime && time ? `  ${time}` : ''}`
    : null;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="input text-left w-full"
      >
        {label ?? <span className="text-slate-600">{placeholder}</span>}
      </button>

      {open && (
        <div
          className="absolute z-50 left-0 mt-1 rounded-xl border border-surface-border shadow-2xl p-3"
          style={{ background: '#111111', minWidth: 'max-content' }}
        >
          <p className="text-[10px] text-slate-600 uppercase tracking-widest text-center mb-1">
            {MONTHS[month - 1]} {pad(day)}, {year}
          </p>
          <div className="flex">
            <WheelColumn items={YEARS}  value={year}  onChange={handleYear}  fmt={v => String(v)} width={68} />
            <WheelColumn items={months} value={month} onChange={handleMonth} fmt={m => MONTHS[m - 1]} width={56} />
            <WheelColumn items={days}   value={day}   onChange={handleDay}   fmt={d => pad(d)} width={48} />
          </div>
          {withTime && (
            <div className="mt-2 pt-2 border-t border-surface-border">
              <input
                type="time"
                value={time}
                onChange={e => handleTime(e.target.value)}
                className="input w-full text-center"
                style={{ colorScheme: 'dark' }}
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn-primary w-full mt-2 justify-center text-xs py-1.5"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
