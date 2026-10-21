/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { RaiseBlockerModal } from '../run/RaiseBlockerModal'

describe('RaiseBlockerModal', () => {
  it('disables submit until description reaches 10 characters and a type/severity are chosen', () => {
    const onSubmit = jest.fn()
    render(<RaiseBlockerModal onSubmit={onSubmit} onCancel={jest.fn()} tasks={[]} />)

    const submit = screen.getByRole('button', { name: /raise a blocker/i })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Waiting on the vendor sandbox' }
    })
    expect(submit).not.toBeDisabled()

    fireEvent.click(submit)
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Waiting on the vendor sandbox' })
    )
  })
})
