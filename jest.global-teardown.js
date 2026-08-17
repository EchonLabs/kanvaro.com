/** Stops the shared in-memory MongoDB started by `jest.global-setup.js`. */
module.exports = async function globalTeardown() {
  await globalThis.__MONGO_SERVER__?.stop()
  globalThis.__MONGO_SERVER__ = undefined
}
