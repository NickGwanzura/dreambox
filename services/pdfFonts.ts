import type { jsPDF } from 'jspdf';

type GeistStyle = 'normal' | 'bold' | 'italic' | 'semibold';

let geistFontPromise: Promise<Record<GeistStyle, string>> | null = null;

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function loadGeistFonts(): Promise<Record<GeistStyle, string>> {
  const styles: Array<[GeistStyle, string]> = [
    ['normal', 'Geist-Regular.ttf'],
    ['bold', 'Geist-Bold.ttf'],
    ['italic', 'Geist-Italic.ttf'],
    ['semibold', 'Geist-SemiBold.ttf'],
  ];
  const entries = await Promise.all(styles.map(async ([style, file]) => {
    const response = await fetch(`/fonts/${file}`);
    if (!response.ok) throw new Error(`Unable to load Geist Sans font: ${response.status}`);
    return [style, toBase64(await response.arrayBuffer())] as const;
  }));
  return Object.fromEntries(entries) as Record<GeistStyle, string>;
}

/** Register the bundled Geist Sans faces and make Geist the active PDF font. */
export async function useGeistSans(doc: jsPDF): Promise<void> {
  geistFontPromise ||= loadGeistFonts();
  try {
    const fonts = await geistFontPromise;
    for (const [style, data] of Object.entries(fonts) as Array<[GeistStyle, string]>) {
      doc.addFileToVFS(`Geist-${style}.ttf`, data);
      doc.addFont(`Geist-${style}.ttf`, 'Geist Sans', style === 'semibold' ? 'bold' : style);
    }
    doc.setFont('Geist Sans', 'normal');
  } catch {
    // Keep exports functional if a static font asset is temporarily unavailable.
    doc.setFont('helvetica', 'normal');
  }
}
