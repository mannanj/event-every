// Tests for the harvested event-form validation (plan 014). validateEvent is the pure
// function lifted out of the dead EventEditor.tsx so the LIVE edit path finally validates.
// It operates on the editor's string form-field shape (date + time as separate strings),
// matching the pre-014 end-before-start semantics exactly.
import { describe, expect, test } from 'bun:test';
import { validateEvent, EventFormValues } from '@/utils/validation';

// A fully valid timed form; tests override the fields they exercise.
function form(overrides: Partial<EventFormValues> = {}): EventFormValues {
  return {
    title: 'Team Sync',
    startDate: '2026-03-15',
    startTime: '15:00',
    endDate: '2026-03-15',
    endTime: '16:00',
    allDay: false,
    ...overrides,
  };
}

describe('validateEvent', () => {
  test('valid timed event → no errors', () => {
    expect(validateEvent(form())).toEqual({});
  });

  test('whitespace-only title → title required', () => {
    expect(validateEvent(form({ title: '   ' })).title).toBe('Title is required');
  });

  test('missing start date → startDate required', () => {
    expect(validateEvent(form({ startDate: '' })).startDate).toBe('Start date is required');
  });

  test('missing end date → endDate required', () => {
    expect(validateEvent(form({ endDate: '' })).endDate).toBe('End date is required');
  });

  test('end before start (timed, same day, earlier end time) → endDate error', () => {
    const errors = validateEvent(form({ startTime: '16:00', endTime: '15:00' }));
    expect(errors.endDate).toBe('End date/time must be after start date/time');
  });

  test('all-day ignores time: equal dates with endTime < startTime is NOT end-before-start', () => {
    // Both clamp to 00:00 when allDay, so end is not before start → no endDate error.
    const errors = validateEvent(
      form({ allDay: true, startTime: '16:00', endTime: '09:00' })
    );
    expect(errors.endDate).toBeUndefined();
  });

  test('equal start/end instant (timed) → no endDate error (strict less-than boundary)', () => {
    const errors = validateEvent(form({ startTime: '15:00', endTime: '15:00' }));
    expect(errors.endDate).toBeUndefined();
  });

  test('multiple problems reported together (empty title + end before start)', () => {
    const errors = validateEvent(
      form({ title: '', startTime: '16:00', endTime: '15:00' })
    );
    expect(errors.title).toBe('Title is required');
    expect(errors.endDate).toBe('End date/time must be after start date/time');
  });

  test('all-day with end date before start date still errors', () => {
    const errors = validateEvent(
      form({ allDay: true, startDate: '2026-03-15', endDate: '2026-03-14' })
    );
    expect(errors.endDate).toBe('End date/time must be after start date/time');
  });
});
