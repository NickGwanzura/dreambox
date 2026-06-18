import { describe, it, expect } from 'vitest';
import { validators, validateBillboard, validateClient, validateInvoice, validateExpense, ValidationError } from '../utils/validation';

// ============================================================
// Generic validators
// ============================================================

describe('validators.required', () => {
  it('passes for a truthy string', () => {
    expect(() => validators.required('hello', 'Name')).not.toThrow();
  });

  it('throws for empty string', () => {
    expect(() => validators.required('', 'Name')).toThrow(ValidationError);
  });

  it('throws for null', () => {
    expect(() => validators.required(null, 'Name')).toThrow(ValidationError);
  });

  it('throws for undefined', () => {
    expect(() => validators.required(undefined, 'Name')).toThrow(ValidationError);
  });
});

describe('validators.email', () => {
  it('accepts a valid email', () => {
    expect(() => validators.email('user@example.com')).not.toThrow();
  });

  it('accepts email with subdomain', () => {
    expect(() => validators.email('user@mail.co.zw')).not.toThrow();
  });

  it('rejects email without @', () => {
    expect(() => validators.email('notanemail')).toThrow(ValidationError);
  });

  it('rejects email without domain', () => {
    expect(() => validators.email('user@')).toThrow(ValidationError);
  });
});

describe('validators.number', () => {
  it('accepts a number within range', () => {
    expect(() => validators.number(50, 'Score', 0, 100)).not.toThrow();
  });

  it('throws below minimum', () => {
    expect(() => validators.number(-1, 'Width', 0, 100)).toThrow(ValidationError);
  });

  it('throws above maximum', () => {
    expect(() => validators.number(101, 'Width', 0, 100)).toThrow(ValidationError);
  });

  it('throws for NaN', () => {
    expect(() => validators.number('abc', 'Width')).toThrow(ValidationError);
  });

  it('accepts zero at minimum', () => {
    expect(() => validators.number(0, 'Width', 0)).not.toThrow();
  });
});

describe('validators.enum', () => {
  it('accepts a valid value', () => {
    expect(() => validators.enum('Active', ['Active', 'Inactive'], 'Status')).not.toThrow();
  });

  it('rejects a value not in the list', () => {
    expect(() => validators.enum('Deleted' as any, ['Active', 'Inactive'], 'Status')).toThrow(ValidationError);
  });
});

describe('validators.date', () => {
  it('accepts a valid ISO date string', () => {
    expect(() => validators.date('2025-06-01', 'Date')).not.toThrow();
  });

  it('rejects an invalid date string', () => {
    expect(() => validators.date('not-a-date', 'Date')).toThrow(ValidationError);
  });
});

// ============================================================
// Entity validators
// ============================================================

describe('validateBillboard', () => {
  const valid = { name: 'Test Board', location: 'CBD', town: 'Harare', type: 'Static' as any, width: 6, height: 3 };

  it('passes for a fully valid billboard', () => {
    expect(() => validateBillboard(valid)).not.toThrow();
  });

  it('throws when name is missing', () => {
    expect(() => validateBillboard({ ...valid, name: '' })).toThrow(ValidationError);
  });

  it('throws when type is invalid', () => {
    expect(() => validateBillboard({ ...valid, type: 'Digital' as any })).toThrow(ValidationError);
  });

  it('throws when width is negative', () => {
    expect(() => validateBillboard({ ...valid, width: -1 })).toThrow(ValidationError);
  });
});

describe('validateClient', () => {
  // PHONE_REGEX: /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/
  const valid = { companyName: 'Acme Co', contactPerson: 'John Doe', phone: '0771234567', email: 'acme@example.com' };

  it('passes for a valid client', () => {
    expect(() => validateClient(valid)).not.toThrow();
  });

  it('throws when company name is missing', () => {
    expect(() => validateClient({ ...valid, companyName: '' })).toThrow(ValidationError);
  });

  it('throws when contact person is missing', () => {
    expect(() => validateClient({ ...valid, contactPerson: '' })).toThrow(ValidationError);
  });
});

describe('validateInvoice', () => {
  const valid = {
    clientId: 'cli-001',
    date: '2025-06-01',
    items: [{ description: 'Rental', amount: 500, quantity: 1, unitPrice: 500 }],
    subtotal: 500,
    total: 565,
    vatAmount: 65,
  };

  it('passes for a valid invoice', () => {
    expect(() => validateInvoice(valid as any)).not.toThrow();
  });

  it('throws when clientId is missing', () => {
    expect(() => validateInvoice({ ...valid, clientId: '' } as any)).toThrow(ValidationError);
  });

  it('throws when items array is empty', () => {
    expect(() => validateInvoice({ ...valid, items: [] } as any)).toThrow(ValidationError);
  });

  it('throws when an item amount is negative', () => {
    const badItems = [{ description: 'Rental', amount: -1, quantity: 1, unitPrice: -1 }];
    expect(() => validateInvoice({ ...valid, items: badItems } as any)).toThrow(ValidationError);
  });
});

describe('validateExpense', () => {
  const valid = {
    description: 'Printing supplies',
    amount: 200,
    date: '2025-06-01',
    category: 'Printing' as any,
  };

  it('passes for a valid expense', () => {
    expect(() => validateExpense(valid)).not.toThrow();
  });

  it('throws when description is missing', () => {
    expect(() => validateExpense({ ...valid, description: '' })).toThrow(ValidationError);
  });

  it('throws when amount is negative', () => {
    expect(() => validateExpense({ ...valid, amount: -100 })).toThrow(ValidationError);
  });

  it('throws when category is invalid', () => {
    expect(() => validateExpense({ ...valid, category: 'Food' as any })).toThrow(ValidationError);
  });
});
