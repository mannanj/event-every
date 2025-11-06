'use client';

import { useState, useRef, useEffect } from 'react';

interface EditableFieldProps {
  label: string;
  value: string;
  type?: 'text' | 'date' | 'time' | 'datetime-local' | 'textarea';
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  readOnly?: boolean;
  required?: boolean;
  error?: string;
}

export default function EditableField({
  label,
  value,
  type = 'text',
  onChange,
  placeholder,
  multiline = false,
  readOnly = false,
  required = false,
  error,
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement || inputRef.current instanceof HTMLTextAreaElement) {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  const handleClick = () => {
    if (!readOnly) {
      setIsEditing(true);
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (localValue !== value) {
      onChange(localValue);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(newValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      setIsEditing(false);
      if (localValue !== value) {
        onChange(localValue);
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setLocalValue(value);
      setIsEditing(false);
    }
  };

  const formatDisplayValue = (val: string) => {
    if (!val) return placeholder || 'Click to edit';

    if (type === 'date') {
      try {
        const date = new Date(val);
        if (!isNaN(date.getTime())) {
          return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }).format(date);
        }
      } catch {
        return val;
      }
    }

    if (type === 'time') {
      try {
        const [hours, minutes] = val.split(':');
        const hour = parseInt(hours, 10);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${ampm}`;
      } catch {
        return val;
      }
    }

    if (type === 'datetime-local') {
      try {
        const date = new Date(val);
        if (!isNaN(date.getTime())) {
          return new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          }).format(date);
        }
      } catch {
        return val;
      }
    }

    return val;
  };

  if (isEditing) {
    const inputClassName = `w-full px-3 py-2 border-2 ${
      error ? 'border-red-600' : 'border-black'
    } focus:outline-none focus:ring-2 focus:ring-black text-black bg-white transition-all duration-200`;

    return (
      <div className="mb-2 animate-in fade-in duration-200">
        <label className="block text-xs font-semibold text-black mb-1 transition-all duration-200">
          {label}
          {required && <span className="text-red-600 ml-1">*</span>}
        </label>
        {multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={localValue}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={inputClassName}
            rows={3}
            aria-label={label}
            aria-invalid={!!error}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type}
            value={localValue}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={inputClassName}
            aria-label={label}
            aria-invalid={!!error}
          />
        )}
        {error && (
          <p className="mt-1 text-xs text-red-600 transition-all duration-200" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={`mb-2 ${
        readOnly ? '' : 'cursor-text hover:bg-gray-50'
      } transition-all duration-200 ease-in-out px-3 py-2 rounded`}
      role="button"
      tabIndex={readOnly ? -1 : 0}
      onKeyDown={(e) => {
        if (!readOnly && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={`${label}: ${formatDisplayValue(localValue)}. Click to edit.`}
    >
      <div className="text-xs font-semibold text-black mb-1 transition-all duration-200">
        {label}
        {required && <span className="text-red-600 ml-1">*</span>}
      </div>
      <div className={`text-sm transition-all duration-200 ${!localValue ? 'text-gray-400 italic' : 'text-gray-700'}`}>
        {formatDisplayValue(localValue)}
      </div>
      {error && (
        <p className="mt-1 text-xs text-red-600 transition-all duration-200" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
