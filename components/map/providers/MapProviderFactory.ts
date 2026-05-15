import { IMapProvider } from './IMapProvider';
import { AmapProvider } from './AmapProvider';
import { GoogleMapProvider } from './GoogleMapProvider';

export class MapProviderFactory {
  /** gaodeWebServiceKey 可选：高德一个 Key 只能选一个平台，需两个 Key 时传此参数。 */
  static createProvider(type: 'gaode' | 'google', apiKey: string, language: 'zh' | 'en' = 'zh', gaodeWebServiceKey?: string): IMapProvider {
    switch (type) {
      case 'gaode':
        return new AmapProvider(apiKey, language, gaodeWebServiceKey);
      case 'google':
        return new GoogleMapProvider(apiKey, language);
      default:
        throw new Error(`Unsupported map provider: ${type}`);
    }
  }
}


