// Silence noisy console.warn/error during tests; tests assert behavior, not
// log shape. setupFiles runs once per file before Jest globals load, so we
// use spyOn at module-load time rather than wrapping in beforeAll. Tests
// that need to verify a log was emitted can re-spy locally.
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});
