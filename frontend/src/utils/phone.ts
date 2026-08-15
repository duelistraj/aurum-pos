export const INDIAN_PHONE_ERROR = 'Enter a 10-digit Indian phone number.';

export const isValidIndianPhone = (value: string): boolean => /^[0-9]{10}$/.test(value);

export const acceptIndianPhoneInput = (current: string, next: string): string => (
  /^[0-9]{0,10}$/.test(next) ? next : current
);
