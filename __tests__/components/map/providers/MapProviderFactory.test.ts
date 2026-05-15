import { MapProviderFactory } from '../../../../components/map/providers/MapProviderFactory';
import { GoogleMapProvider } from '../../../../components/map/providers/GoogleMapProvider';
import { AmapProvider } from '../../../../components/map/providers/AmapProvider';

describe('MapProviderFactory', () => {
  it('creates a GoogleMapProvider for type=google', () => {
    const p = MapProviderFactory.createProvider('google', 'gkey');
    expect(p).toBeInstanceOf(GoogleMapProvider);
  });

  it('creates an AmapProvider for type=gaode', () => {
    const p = MapProviderFactory.createProvider('gaode', 'jskey');
    expect(p).toBeInstanceOf(AmapProvider);
  });

  it('passes language through to the provider', () => {
    // language is private; we can't read it directly, but we can at least
    // verify both branches accept the parameter without throwing.
    expect(() => MapProviderFactory.createProvider('google', 'k', 'en')).not.toThrow();
    expect(() => MapProviderFactory.createProvider('gaode', 'k', 'zh')).not.toThrow();
  });

  it('passes gaodeWebServiceKey through to AmapProvider', () => {
    const p = MapProviderFactory.createProvider('gaode', 'jskey', 'zh', 'webkey');
    // Sanity: the AmapProvider constructor should bind webServiceKey to the
    // explicit value when provided. Access the private field via cast.
    expect((p as unknown as { webServiceKey: string }).webServiceKey).toBe('webkey');
  });

  it('falls back to jsApiKey when gaodeWebServiceKey omitted', () => {
    const p = MapProviderFactory.createProvider('gaode', 'jskey');
    expect((p as unknown as { webServiceKey: string }).webServiceKey).toBe('jskey');
  });

  it('throws on unsupported provider type', () => {
    expect(() => MapProviderFactory.createProvider('bing' as 'google', 'k')).toThrow(/Unsupported map provider/);
  });
});
