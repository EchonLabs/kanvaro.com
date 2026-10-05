/**
 * Whether a wizard step's required fields are satisfied. The stepper used to
 * tick any step the user had navigated past, so jumping to Review ticked
 * Timeline while its required start date was still empty.
 */
export function isWizardStepValid(
  stepId: number,
  formData: { name: string; startDate: string }
): boolean {
  switch (stepId) {
    case 1:
      return formData.name.trim() !== ''
    case 2:
      return formData.startDate !== ''
    default:
      return true
  }
}

/** The stepper shows a tick only for a step that is both passed and valid. */
export function shouldTickWizardStep(
  currentStep: number,
  stepId: number,
  formData: { name: string; startDate: string }
): boolean {
  return currentStep > stepId && isWizardStepValid(stepId, formData)
}
