import type { ReactNode } from 'react';

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {action}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
  };
  return (
    <button
      {...props}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${styles[variant]} ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none ${props.className ?? ''}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none ${props.className ?? ''}`}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

const BADGE_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  SENT: 'bg-green-100 text-green-700',
  PENDING: 'bg-amber-100 text-amber-700',
  ERROR: 'bg-red-100 text-red-700',
  FAILED: 'bg-red-100 text-red-700',
  SKIPPED: 'bg-slate-100 text-slate-600',
  AMOCRM: 'bg-sky-100 text-sky-700',
  BITRIX24: 'bg-blue-100 text-blue-700',
  META: 'bg-indigo-100 text-indigo-700',
  TIKTOK: 'bg-slate-900 text-white',
  GOOGLE_ADS: 'bg-amber-100 text-amber-700',
  YANDEX: 'bg-red-100 text-red-700',
};

const BADGE_LABELS: Record<string, string> = {
  ACTIVE: 'Активно',
  SENT: 'Отправлено',
  PENDING: 'Ожидает',
  ERROR: 'Ошибка',
  FAILED: 'Ошибка',
  SKIPPED: 'Пропущено',
  AMOCRM: 'amoCRM',
  BITRIX24: 'Битрикс24',
  META: 'Meta',
  TIKTOK: 'TikTok',
  GOOGLE_ADS: 'Google Ads',
  YANDEX: 'Яндекс',
};

export function Badge({ value }: { value: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_STYLES[value] ?? 'bg-slate-100 text-slate-600'}`}
    >
      {BADGE_LABELS[value] ?? value}
    </span>
  );
}

export function CopyField({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="block flex-1 truncate rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">
        {value}
      </code>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(value)}
        className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-800"
      >
        Копировать
      </button>
    </div>
  );
}
