import React from 'react';
import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react';

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  onClose?: () => void;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  type,
  title,
  message,
  onClose,
  className = '',
}) => {
  const icons = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertCircle,
    info: Info,
  };
  const Icon = icons[type];

  return (
    <div
      role="alert"
      className={`ui-alert ui-alert--${type} animate-slide-up ${className}`}
    >
      <div className="ui-alert__content">
        <Icon className="ui-alert__icon" />
        <div className="ui-alert__copy">
          {title && <h3 className="ui-alert__title">{title}</h3>}
          <p className={`ui-alert__message ${title ? 'has-title' : ''}`}>
            {message}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ui-alert__close"
            aria-label="Dismiss status"
          >
            <X className="ui-alert__close-icon" />
          </button>
        )}
      </div>
    </div>
  );
};

interface IconProps {
  className?: string;
}

function X({ className }: IconProps) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  hover = false,
}) => {
  return (
    <div
      className={`ui-card ${
        hover
          ? 'ui-card--interactive'
          : ''
        } ${className}`}
    >
      {children}
    </div>
  );
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className = '',
  children,
  ...props
}) => {
  const baseStyles = 'ui-button disabled:opacity-50 disabled:cursor-not-allowed';

  const variantStyles = {
    primary: 'ui-button--primary',
    secondary: 'ui-button--secondary',
    danger: 'ui-button--danger',
    success: 'ui-button--success',
  };

  const sizeStyles = {
    sm: 'ui-button--sm',
    md: 'ui-button--md',
    lg: 'ui-button--lg',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center space-x-2">
          <svg
            className="animate-spin h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Loading...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className = '',
  ...props
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="ui-field-label" htmlFor={props.id}>
          {label}
        </label>
      )}
      <input
        className={`ui-input ${error ? 'ui-input--error' : ''} ${className}`}
        {...props}
      />
      {error && <p className="ui-field-error">{error}</p>}
    </div>
  );
};

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  options,
  className = '',
  ...props
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="ui-field-label" htmlFor={props.id}>
          {label}
        </label>
      )}
      <select
        className={`ui-select ${error ? 'ui-input--error' : ''} ${className}`}
        {...props}
      >
        <option value="">Select an option</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="ui-field-error">{error}</p>}
    </div>
  );
};

interface ModalProps {
  isOpen: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  title,
  children,
  onClose,
  footer,
  size = 'md',
  className = '',
}) => {
  if (!isOpen) return null;

  const sizeClasses = {
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div className="ui-modal-backdrop animate-fade-in">
      <div
        className={`ui-modal ${sizeClasses[size]} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ui-modal-title"
      >
        <div className="ui-modal__header">
          <h2 id="ui-modal-title" className="ui-modal__title">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="ui-modal__close"
            aria-label="Close dialog"
          >
            <X className="ui-modal__close-icon" />
          </button>
        </div>
        <div className="ui-modal__body">{children}</div>
        {footer && (
          <div className="ui-modal__footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', className = '' }) => {

  return (
    <span className={`ui-badge ui-badge--${variant} ${className}`}>
      {children}
    </span>
  );
};

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Loader: React.FC<LoaderProps> = ({ size = 'md', className = '' }) => {
  const sizeClass = {
    sm: 'w-6 h-6',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  return (
    <div className={`ui-loader ${className}`} role="status" aria-label="Loading">
      <svg
        className={`${sizeClass[size]} ui-loader__icon animate-spin`}
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
};
