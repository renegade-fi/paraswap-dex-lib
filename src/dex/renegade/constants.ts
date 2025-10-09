/**
 * Constants for Renegade DEX integration
 */

import { Network } from '../../constants';

// Base API URL template - subdomain varies by network
export const RENEGADE_API_URL_TEMPLATE =
  'https://{network}.auth-server.renegade.fi';
export const RENEGADE_LEVELS_ENDPOINT = '/rfqt/v3/levels';
export const RENEGADE_MATCH_ENDPOINT =
  '/v0/matching-engine/request-external-match';

// Network to Renegade subdomain mapping
export const RENEGADE_NETWORK_MAPPING: { [key in Network]?: string } = {
  [Network.ARBITRUM]: 'arbitrum-one',
  [Network.BASE]: 'base-mainnet',
  // TODO: Add testnet mappings when needed
  // [Network.ARBITRUM_SEPOLIA]: 'arbitrum-sepolia',
  // [Network.BASE_SEPOLIA]: 'base-sepolia',
};

/**
 * Build Renegade API URL for a specific network.
 *
 * @param network - ParaSwap network identifier
 * @returns Complete API URL for the network
 * @throws Error if network is not supported by Renegade
 */
export function buildRenegadeApiUrl(network: Network): string {
  const renegadeNetwork = RENEGADE_NETWORK_MAPPING[network];
  if (!renegadeNetwork) {
    throw new Error(`Network ${network} is not supported by Renegade`);
  }

  return RENEGADE_API_URL_TEMPLATE.replace('{network}', renegadeNetwork);
}

// Caching constants
export const RENEGADE_LEVELS_CACHE_TTL = 30; // seconds
export const RENEGADE_LEVELS_POLLING_INTERVAL = 15000; // milliseconds
export const RENEGADE_LEVELS_CACHE_KEY = 'renegade_levels';

export const RENEGADE_TOKEN_METADATA_CACHE_TTL = 3600; // 1 hour in seconds
export const RENEGADE_TOKEN_METADATA_CACHE_KEY = 'renegade_token_metadata';

// API timeout settings
export const RENEGADE_API_TIMEOUT_MS = 10000; // 10 seconds

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
