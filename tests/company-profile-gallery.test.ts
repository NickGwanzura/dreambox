import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Mock the R2 upload helper so we can control success/failure without hitting
// real object storage. uploadEmbeddedImages (in api/company-profile.ts) uses it
// to re-host any inline base64 that slipped into a saved gallery.
const DATA_URL_RE = /^data:(.+?);base64,(.+)$/;
const mockUploadBase64Image = vi.fn();

vi.mock('../lib/uploadBase64', () => ({
  isBase64DataUrl: (value: string) => typeof value === 'string' && DATA_URL_RE.test(value),
  uploadBase64Image: (...args: any[]) => mockUploadBase64Image(...args),
  dataUrlToBuffer: () => { throw new Error('not used in this test'); },
}));

type UploadEmbeddedImages = (json: string | undefined, existingJson: string | undefined) => Promise<string | undefined>;
let uploadEmbeddedImages: UploadEmbeddedImages;

beforeAll(async () => {
  // Must be set before the dynamic import below, since lib/auth throws at
  // module load when JWT_SECRET is absent.
  process.env.JWT_SECRET = 'test-secret-for-company-profile-gallery';
  const mod = await import('../api/company-profile');
  uploadEmbeddedImages = mod.uploadEmbeddedImages as UploadEmbeddedImages;
});

const R2_URL = 'https://cdn.example.com/gallery/img-1.png';

function galleryJson(entries: unknown[]): string {
  return JSON.stringify(entries);
}

describe('uploadEmbeddedImages — resilience', () => {
  beforeEach(() => {
    mockUploadBase64Image.mockReset();
  });

  it('leaves gallery entries that are already remote URLs untouched', async () => {
    const json = galleryJson([{ src: R2_URL }, { src: 'https://cdn.example.com/gallery/img-2.jpg' }]);
    const result = await uploadEmbeddedImages(json, json);
    // No base64 present, so no upload call is made and no upload happens.
    expect(mockUploadBase64Image).not.toHaveBeenCalled();
    expect(result).toBe(json);
  });

  it('does NOT throw when a base64 entry fails to re-upload (500 regression)', async () => {
    // Simulate a stale/oversized image that is no longer accepted by the server
    // (dataUrlToBuffer would throw) — the whole save must not fail.
    mockUploadBase64Image.mockRejectedValue(new Error('File too large: 7.0 MB. Maximum allowed is 5 MB.'));
    const incoming = galleryJson([{ src: 'data:image/png;base64,AAAA' }]);
    const existing = galleryJson([{ src: R2_URL }]);

    const result = await uploadEmbeddedImages(incoming, existing);

    // Resolves instead of rejecting → the save completes without a 500.
    const parsed = JSON.parse(result as string);
    // Falls back to the previously-persisted URL for that index.
    expect(parsed[0].src).toBe(R2_URL);
  });

  it('keeps the raw entry when there is no previously-persisted URL to fall back to', async () => {
    mockUploadBase64Image.mockRejectedValue(new Error('R2 storage is not configured.'));
    const incoming = galleryJson([{ src: 'data:image/png;base64,AAAA' }]);

    const result = await uploadEmbeddedImages(incoming, undefined);

    const parsed = JSON.parse(result as string);
    expect(parsed[0].src).toBe('data:image/png;base64,AAAA');
  });

  it('still re-uploads and replaces a base64 entry when the upload succeeds', async () => {
    mockUploadBase64Image.mockResolvedValue(R2_URL);
    const incoming = galleryJson([{ src: 'data:image/png;base64,AAAA' }]);

    const result = await uploadEmbeddedImages(incoming, undefined);

    expect(mockUploadBase64Image).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result as string)[0].src).toBe(R2_URL);
  });
});
