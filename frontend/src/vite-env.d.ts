/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DISTRIBUTION?: 'cloud' | 'self_hosted';
  readonly VITE_GOOGLE_AUTH_ENABLED?: 'true' | 'false';
}

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorInstance {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetectorInstance;
}

interface Window {
  BarcodeDetector?: BarcodeDetectorConstructor;
}
