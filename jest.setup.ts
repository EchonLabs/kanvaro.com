// Registers the DOM matchers (toBeInTheDocument, toHaveTextContent, ...) at
// runtime for jsdom tests, and — because this file is covered by tsconfig's
// `**/*.ts` include — makes their type augmentation visible to `tsc --noEmit`
// across the whole project.
import '@testing-library/jest-dom'

// jsdom ships no ResizeObserver, and recharts' ResponsiveContainer — which
// every chart in the app renders inside — constructs one on mount. Without
// this any component containing a chart throws on render in a jsdom test,
// which looks like a component bug rather than a missing browser API.
// Observing nothing is correct here: the tests that need real chart geometry
// hand ResponsiveContainer an explicit width and height instead.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
