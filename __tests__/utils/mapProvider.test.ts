import { resolveMapProvider } from '../../utils/mapProvider';

test.each(['google', 'gaode', undefined])('None blocks saved override %s', preferred => {
  expect(resolveMapProvider({ mapApiProvider: 'none' }, preferred)).toBe('none');
});

test('missing settings default to offline', () => {
  expect(resolveMapProvider(undefined, 'google')).toBe('none');
});

test('enabled maps retain provider selection and trip overrides', () => {
  expect(resolveMapProvider({ mapApiProvider: 'google' })).toBe('google');
  expect(resolveMapProvider({ mapApiProvider: 'gaode' })).toBe('gaode');
  expect(resolveMapProvider({ mapApiProvider: 'google' }, 'gaode')).toBe('gaode');
  expect(resolveMapProvider({ mapApiProvider: 'gaode' }, 'google')).toBe('google');
});
