/**
 * Ultra-simple, completely free 5-character direct peer connection keys.
 * No paywalls, no tokens, no purchase barriers.
 */
const CHARSET = 'abcdefghjkmnpqrstuvwxyz23456789'; // human-friendly, no ambiguous 0/O or 1/l

/**
 * Generates a clean 5-character connection key.
 */
export function generateShareCode(): string {
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += CHARSET.charAt(Math.floor(Math.random() * CHARSET.length));
  }
  return result;
}

/**
 * Identity mapping: connection key is direct, transparent, and 100% free.
 */
export function obfuscateCode(code: string): string {
  return code.trim().toLowerCase();
}

export function reverseObfuscateCode(code: string): string {
  return code.trim().toLowerCase();
}
