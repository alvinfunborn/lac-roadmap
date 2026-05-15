// Silence noisy console.warn during tests; tests assert behavior, not log
// shape. setupFiles runs once per file before Jest globals load, so we use
// the spyOn at module-load time rather than wrapping in beforeAll.
jest.spyOn(console, 'warn').mockImplementation(() => {});
