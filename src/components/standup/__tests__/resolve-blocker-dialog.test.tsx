/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { ResolveBlockerDialog } from '../run/ResolveBlockerDialog'

describe('ResolveBlockerDialog', () => {
  it('disables confirm until the resolution note reaches 10 characters', () => {
    const onConfirm = jest.fn()
    render(<ResolveBlockerDialog blockerId="blk-1" onConfirm={onConfirm} onCancel={jest.fn()} />)

    const confirm = screen.getByRole('button', { name: /resolve/i })
    expect(confirm).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/resolution note/i), {
      target: { value: 'Vendor sandbox came back up.' }
    })
    expect(confirm).not.toBeDisabled()

    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledWith({
      blockerId: 'blk-1',
      status: 'resolved',
      resolutionNote: 'Vendor sandbox came back up.'
    })
  })
})
