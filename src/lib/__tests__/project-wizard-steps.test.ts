import { shouldTickWizardStep } from '@/lib/project-wizard-steps'

describe('wizard stepper tick', () => {
  it('does not tick Timeline when the user jumped past it with no start date', () => {
    expect(shouldTickWizardStep(4, 2, { name: 'Alpha', startDate: '' })).toBe(false)
  })

  it('ticks Timeline once the start date is set and the step is passed', () => {
    expect(shouldTickWizardStep(4, 2, { name: 'Alpha', startDate: '2026-10-05' })).toBe(true)
  })

  it('does not tick the current or a future step even when valid', () => {
    expect(shouldTickWizardStep(2, 2, { name: 'Alpha', startDate: '2026-10-05' })).toBe(false)
  })

  it('does not tick Basic Info without a name', () => {
    expect(shouldTickWizardStep(3, 1, { name: '  ', startDate: '2026-10-05' })).toBe(false)
  })
})
