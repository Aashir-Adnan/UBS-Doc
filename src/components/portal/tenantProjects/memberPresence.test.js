import { describe, it, expect } from 'vitest';
import { memberDisplayName, membersToPresence, toggleSingle } from './memberPresence';

describe('memberDisplayName', () => {
  it('prefers the full name', () => {
    expect(memberDisplayName({ first_name: 'Ada', last_name: 'Lovelace', email: 'a@b.c' }))
      .toBe('Ada Lovelace');
  });

  it('falls back through username then email then the urdd id', () => {
    expect(memberDisplayName({ username: 'ada', email: 'a@b.c' })).toBe('ada');
    expect(memberDisplayName({ email: 'a@b.c' })).toBe('a@b.c');
    expect(memberDisplayName({ urdd_id: 7 })).toBe('URDD #7');
  });

  it('handles a first name with no last name', () => {
    expect(memberDisplayName({ first_name: 'Ada', email: 'a@b.c' })).toBe('Ada');
  });
});

describe('membersToPresence', () => {
  it('stringifies ids so String() comparisons at the call sites hold', () => {
    const [row] = membersToPresence([{ urdd_id: 12, email: 'a@b.c', tenant_id: 3 }]);
    expect(row.id).toBe('12');
  });

  it('keeps the urdd and tenant context the old <option> label carried', () => {
    const [row] = membersToPresence([{ urdd_id: 12, email: 'a@b.c', tenant_id: 3 }]);
    expect(row.subtitle).toBe('a@b.c · URDD #12 · tenant #3');
  });

  it('omits the tenant when the row has none', () => {
    const [row] = membersToPresence([{ urdd_id: 12, email: 'a@b.c' }]);
    expect(row.subtitle).toBe('a@b.c · URDD #12');
  });

  it('tolerates a null/undefined member list', () => {
    expect(membersToPresence(null)).toEqual([]);
    expect(membersToPresence(undefined)).toEqual([]);
  });
});

describe('toggleSingle', () => {
  it('selects when nothing is selected', () => {
    expect(toggleSingle('', '12')).toBe('12');
  });

  it('clears when the same member is clicked again — the old empty option', () => {
    expect(toggleSingle('12', '12')).toBe('');
    expect(toggleSingle('12', 12)).toBe('');
  });

  it('switches directly between members', () => {
    expect(toggleSingle('12', '13')).toBe('13');
  });
});
