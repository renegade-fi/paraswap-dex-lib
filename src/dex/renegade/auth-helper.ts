/**
 * Authentication helper for Renegade DEX integration.
 *
 * Implements HMAC-SHA256 authentication as required by Renegade API.
 * Each request must be signed using HMAC over:
 * - request path
 * - headers (sorted x-renegade-* headers)
 * - body (if it exists)
 */

import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { Buffer } from 'buffer';
import {
  RENEGADE_HEADER_PREFIX,
  RENEGADE_API_KEY_HEADER,
  RENEGADE_AUTH_HEADER,
  RENEGADE_AUTH_EXPIRATION_HEADER,
  REQUEST_SIGNATURE_DURATION_MS,
} from './constants';

/**
 * Generate authentication headers for Renegade API requests.
 *
 * This function implements the exact authentication scheme required by Renegade:
 * - Adds API key header
 * - Generates HMAC-SHA256 signature over path + headers + body
 * - Sets expiration timestamp
 *
 * @param path - Request path (e.g. "/rfqt/v3/levels")
 * @param body - Request body string (empty string for GET requests)
 * @param existingHeaders - Any existing headers to include in signature
 * @param apiKey - Renegade API key
 * @param apiSecret - Renegade API secret (base64 encoded string)
 * @returns Complete headers object with authentication
 */
export function generateRenegadeAuthHeaders(
  path: string,
  body: string,
  existingHeaders: Record<string, string>,
  apiKey: string,
  apiSecret: string,
): Record<string, string> {
  // Clone existing headers to avoid mutation
  const signedHeaders: Record<string, string> = { ...existingHeaders };

  // Add timestamp and expiry
  const now = Date.now();
  const expiry = now + REQUEST_SIGNATURE_DURATION_MS;
  signedHeaders[RENEGADE_AUTH_EXPIRATION_HEADER] = expiry.toString();

  // Add API key
  signedHeaders[RENEGADE_API_KEY_HEADER] = apiKey;

  // Decode API secret from base64 to Uint8Array
  const apiSecretBytes = decodeBase64(apiSecret);

  // Compute the MAC signature using the headers with expiry
  const signature = computeHmacSignature(
    path,
    signedHeaders,
    body,
    apiSecretBytes,
  );
  signedHeaders[RENEGADE_AUTH_HEADER] = signature;

  // Return new headers object with both auth headers
  return signedHeaders;
}

/**
 * Compute the HMAC-SHA256 signature for a Renegade API request.
 *
 * @param path - The URL path (e.g. "/rfqt/v3/levels")
 * @param headers - Existing headers to include in signature
 * @param body - Request body string (empty string for GET requests)
 * @param apiSecret - API secret as Uint8Array
 * @returns Base64-encoded HMAC signature without padding
 */
function computeHmacSignature(
  path: string,
  headers: Record<string, string>,
  body: string,
  apiSecret: Uint8Array,
): string {
  // Filter and sort x-renegade-* headers (excluding auth header itself)
  const candidateHeaderEntries = Object.entries(headers);
  const renegadeHeaderEntries = candidateHeaderEntries
    .filter(([key]) => key.toLowerCase().startsWith(RENEGADE_HEADER_PREFIX))
    .filter(
      ([key]) => key.toLowerCase() !== RENEGADE_AUTH_HEADER.toLowerCase(),
    );

  // Canonicalize header order (lexicographic by header name, case-insensitive)
  const canonicalHeaderEntries = renegadeHeaderEntries.sort(([a], [b]) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );

  // Prepare crypto primitives
  const encoder = new TextEncoder();
  const mac = hmac.create(sha256, apiSecret);

  // Add path to signature
  mac.update(encoder.encode(path));

  // Add Renegade headers to signature
  for (const [key, value] of canonicalHeaderEntries) {
    mac.update(encoder.encode(key));
    mac.update(encoder.encode(value.toString()));
  }

  // Add stringified body to signature
  mac.update(encoder.encode(body));

  // Generate signature and return as base64 without padding
  const digest = mac.digest();
  return encodeBase64(digest);
}

/**
 * Decode a base64 string to a Uint8Array.
 *
 * @param base64 - Base64 encoded string
 * @returns Uint8Array decoded from base64
 */
function decodeBase64(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Encode a Uint8Array to a base64 string without trailing '=' padding.
 *
 * @param data - Uint8Array to encode
 * @returns Base64 string without padding
 */
function encodeBase64(data: Uint8Array): string {
  return Buffer.from(data).toString('base64').replace(/=+$/, '');
}
