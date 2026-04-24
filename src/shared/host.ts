const SUPPORTED_HOST = 'x.com';

export function isSupportedXHost(url: string): boolean {
  try {
    return new URL(url).hostname === SUPPORTED_HOST;
  } catch {
    return false;
  }
}
