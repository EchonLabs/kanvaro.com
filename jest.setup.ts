// Registers the DOM matchers (toBeInTheDocument, toHaveTextContent, ...) at
// runtime for jsdom tests, and — because this file is covered by tsconfig's
// `**/*.ts` include — makes their type augmentation visible to `tsc --noEmit`
// across the whole project.
import '@testing-library/jest-dom'
