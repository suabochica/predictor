import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, id, className = '', ...props }: InputProps) {
  const inputId = id || props.name;
  const errorId = inputId ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="font-label text-label-caps text-primary uppercase tracking-wide">
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-sm border border-border bg-surface px-3.5 py-2.5 text-body-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-tertiary focus:border-transparent ${className}`}
        {...props}
      />
      {error && (
        <span id={errorId} role="alert" className="text-label-caps text-error">
          {error}
        </span>
      )}
    </div>
  );
}
