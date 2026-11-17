'use client';

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { Unit } from '../lib/types';
import { formatNumber, fromMm, toMm } from '../lib/units';

export function Section({
  step,
  title,
  subtitle,
  id,
  children,
  right,
}: {
  step: number;
  title: string;
  subtitle?: string;
  id?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section id={id} className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
            {step}
          </span>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          </div>
        </div>
        {right}
      </header>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
};

export function Button({ variant = 'secondary', size = 'md', className = '', ...props }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50';
  const sizes = { sm: 'px-2.5 py-1 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-6 py-3 text-base font-semibold tracking-wide' };
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50',
    ghost: 'text-gray-600 hover:bg-gray-100',
    danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
  };
  return <button type="button" {...props} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50';

const fmt = (mm: number, unit: Unit) => formatNumber(fromMm(mm, unit), unit === 'mm' ? 3 : 4);

/** Number input that edits a length stored in millimetres but shown in the user's unit. */
export function MeasureInput({
  label,
  valueMm,
  unit,
  onChange,
  min = 0,
  positive = false,
  hint,
}: {
  label: string;
  valueMm: number;
  unit: Unit;
  onChange: (mm: number) => void;
  min?: number;
  positive?: boolean;
  hint?: string;
}) {
  const [text, setText] = useState(fmt(valueMm, unit));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(fmt(valueMm, unit));
  }, [valueMm, unit, focused]);

  const parsed = parseFloat(text.replace(',', '.'));
  const invalid = !Number.isFinite(parsed) || parsed < min || (positive && parsed <= 0);

  return (
    <Field label={`${label} (${unit})`} hint={hint}>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={text}
        className={`${inputClass} ${invalid ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setText(fmt(valueMm, unit));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseFloat(e.target.value.replace(',', '.'));
          if (Number.isFinite(n) && n >= min && (!positive || n > 0)) onChange(toMm(n, unit));
        }}
      />
    </Field>
  );
}

/** Whole-number input (quantities). */
export function IntInput({
  value,
  onChange,
  min = 0,
  max = 1_000_000,
  className = '',
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  className?: string;
  label: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={text}
      className={`${inputClass} ${className}`}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(String(value));
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9]/g, '');
        setText(raw);
        if (raw !== '') onChange(Math.min(max, Math.max(min, parseInt(raw, 10))));
      }}
    />
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

export function Notice({
  tone,
  title,
  children,
}: {
  tone: 'error' | 'warning' | 'info' | 'success';
  title?: string;
  children?: ReactNode;
}) {
  const tones = {
    error: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    success: 'border-green-200 bg-green-50 text-green-900',
  };
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>
      {title && <div className="font-semibold">{title}</div>}
      {children}
    </div>
  );
}
