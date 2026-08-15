import { describe, expect, it } from 'vitest';
import { acceptIndianPhoneInput, isValidIndianPhone } from './phone';

describe('Indian phone validation', () => {
  it('accepts exactly ten ASCII digits', () => {
    expect(isValidIndianPhone('9876543210')).toBe(true);
    expect(isValidIndianPhone('987654321')).toBe(false);
    expect(isValidIndianPhone('+919876543210')).toBe(false);
    expect(isValidIndianPhone('98765 43210')).toBe(false);
  });

  it('prevents country codes, punctuation, and values longer than ten digits', () => {
    expect(acceptIndianPhoneInput('9876', '98765')).toBe('98765');
    expect(acceptIndianPhoneInput('9876', '+919876')).toBe('9876');
    expect(acceptIndianPhoneInput('9876', '9876 5')).toBe('9876');
    expect(acceptIndianPhoneInput('9876543210', '98765432101')).toBe('9876543210');
  });
});
