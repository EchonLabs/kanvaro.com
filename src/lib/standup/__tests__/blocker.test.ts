import { validateBlockerFields, freedCapacityMessage, isOverdue } from '../blocker'

it('rejects a description under 10 characters', () => {
  expect(validateBlockerFields({ description: 'stuck' }).valid).toBe(false)
})

it('accepts a real description', () => {
  expect(validateBlockerFields({ description: 'Vendor sandbox is down.' }).valid).toBe(true)
})

it('formats the freed-capacity line', () => {
  expect(freedCapacityMessage(180 as any, 'BLK-14')).toBe('3.0h freed by blocker BLK-14')
})

it('flags a past target date as overdue', () => {
  expect(isOverdue('2026-08-01', '2026-08-05')).toBe(true)
})

it('does not flag a future target date', () => {
  expect(isOverdue('2026-08-10', '2026-08-05')).toBe(false)
})

it('does not flag a blocker with no target date', () => {
  expect(isOverdue(undefined, '2026-08-05')).toBe(false)
})
