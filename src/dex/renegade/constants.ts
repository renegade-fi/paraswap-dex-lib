/**
 * Constants for Renegade DEX integration
 */

import { Network } from '../../constants';

// Base API URLs for each network
export const RENEGADE_ARBITRUM_BASE_URL =
  'https://arbitrum-one.auth-server.renegade.fi';
export const RENEGADE_BASE_BASE_URL =
  'https://base-mainnet.auth-server.renegade.fi';

export const RENEGADE_LEVELS_ENDPOINT = '/rfqt/v3/levels';
export const RENEGADE_MATCH_ENDPOINT =
  '/v0/matching-engine/request-external-match';

/**
 * Get Renegade API base URL for a specific network.
 *
 * @param network - ParaSwap network identifier
 * @returns Complete base API URL for the network
 * @throws Error if network is not supported by Renegade
 */
export function buildRenegadeApiUrl(network: Network): string {
  switch (network) {
    case Network.ARBITRUM:
      return RENEGADE_ARBITRUM_BASE_URL;
    case Network.BASE:
      return RENEGADE_BASE_BASE_URL;
    default:
      throw new Error(`Network ${network} is not supported by Renegade`);
  }
}

// Caching constants
export const RENEGADE_LEVELS_CACHE_TTL = 30; // seconds
export const RENEGADE_LEVELS_POLLING_INTERVAL = 15000; // milliseconds
export const RENEGADE_LEVELS_CACHE_KEY = 'renegade_levels';

export const RENEGADE_TOKEN_METADATA_CACHE_TTL = 3600; // 1 hour in seconds
export const RENEGADE_TOKEN_METADATA_CACHE_KEY = 'renegade_token_metadata';

// API timeout settings
export const RENEGADE_API_TIMEOUT_MS = 10000; // 10 seconds
export const RENEGADE_INIT_TIMEOUT_MS = 5000; // 5 seconds - wait for fetchers to populate cache

// Authentication constants
export const RENEGADE_HEADER_PREFIX = 'x-renegade';
export const RENEGADE_API_KEY_HEADER = 'x-renegade-api-key';
export const RENEGADE_AUTH_HEADER = 'x-renegade-auth';
export const RENEGADE_AUTH_EXPIRATION_HEADER = 'x-renegade-auth-expiration';
export const REQUEST_SIGNATURE_DURATION_MS = 10 * 1000; // 10 seconds

// Gas cost estimation
export const RENEGADE_GAS_COST = 3_000_000; // Estimated gas cost for Renegade swaps

// Token metadata API constants
export const RENEGADE_TOKEN_MAPPINGS_BASE_URL =
  'https://raw.githubusercontent.com/renegade-fi/token-mappings/main/';
