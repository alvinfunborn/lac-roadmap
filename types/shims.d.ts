declare module 'tomlify-j0.4';
declare const google: any;
declare global {
  interface Window {
    AMap: any;
    google: {
      maps: any;
      [key: string]: any;
    } | undefined;
  }
}
export {};

