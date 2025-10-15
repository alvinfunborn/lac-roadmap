import { IMapProvider } from './IMapProvider';
import { AmapProvider } from './AmapProvider';
import { GoogleMapProvider } from './GoogleMapProvider';

export class MapProviderFactory {
  static createProvider(type: 'gaode' | 'google', apiKey: string, language: 'zh' | 'en' = 'zh'): IMapProvider {
    switch (type) {
      case 'gaode':
        return new AmapProvider(apiKey, language);
      case 'google':
        return new GoogleMapProvider(apiKey, language);
      default:
        throw new Error(`Unsupported map provider: ${type}`);
    }
  }
}


