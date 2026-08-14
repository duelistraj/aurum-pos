import { registerPlugin } from '@capacitor/core';

interface AurumPrintingPlugin {
  printPdf(options: { uri: string; jobName: string }): Promise<void>;
}

export const AurumPrinting = registerPlugin<AurumPrintingPlugin>('AurumPrinting');
