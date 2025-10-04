import { IDexHelper } from '../../dex-helper';
import { Logger } from '../../types';
import { Network } from '../../constants';
import { RenegadeLevelsResponse, RenegadeRateFetcherConfig } from './types';
import {
  buildRenegadeApiUrl,
  RENEGADE_LEVELS_ENDPOINT,
  RENEGADE_API_TIMEOUT_MS,
} from './constants';
import { generateRenegadeAuthHeaders } from './auth-helper';

/**
 * Simplified RateFetcher for Renegade DEX integration.
 *
 * This implementation bypasses caching for faster development and uses direct API calls.
 * TODO: Add caching and polling functionality later.
 */
export class RateFetcher {
  constructor(
    private dexHelper: IDexHelper,
    private dexKey: string,
    private network: Network,
    private logger: Logger,
    private config: RenegadeRateFetcherConfig,
  ) {}

  /**
   * Fetch price levels directly from Renegade API.
   *
   * Makes a direct API call to /rfqt/v3/levels endpoint with HMAC-SHA256 authentication.
   * TODO: Add caching layer to avoid repeated API calls.
   *
   * @returns Promise resolving to price levels data or null if fetch fails
   */
  async fetchLevels(): Promise<RenegadeLevelsResponse | null> {
    try {
      this.logger.debug(
        `${this.dexKey}: Fetching price levels from Renegade API`,
      );

      // Build network-specific API URL
      const baseUrl = buildRenegadeApiUrl(this.network);
      const url = `${baseUrl}${RENEGADE_LEVELS_ENDPOINT}`;

      this.logger.debug(`${this.dexKey}: Using API URL: ${url}`);

      // Generate authenticated headers using HMAC-SHA256
      const baseHeaders = {
        'Content-Type': 'application/json',
      };

      const authenticatedHeaders = generateRenegadeAuthHeaders(
        RENEGADE_LEVELS_ENDPOINT,
        '', // Empty string for GET request body
        baseHeaders,
        this.config.apiKey,
        this.config.apiSecret,
      );

      this.logger.debug(
        `${this.dexKey}: Generated authenticated headers for API request`,
      );

      const response = await this.dexHelper.httpRequest.get(
        url,
        RENEGADE_API_TIMEOUT_MS,
        authenticatedHeaders,
      );

      if (!response) {
        this.logger.warn(
          `${this.dexKey}: No response received from Renegade API`,
        );
        return null;
      }

      // Validate response structure
      if (typeof response !== 'object' || response === null) {
        this.logger.error(
          `${this.dexKey}: Invalid response format from Renegade API`,
          response,
        );
        return null;
      }

      const levels = response as RenegadeLevelsResponse;

      // Basic validation - check if we have at least one pair
      const pairCount = Object.keys(levels).length;
      this.logger.debug(
        `${this.dexKey}: Successfully fetched ${pairCount} price level pairs`,
      );

      return levels;
    } catch (error) {
      this.logger.error(
        `${this.dexKey}: Failed to fetch price levels from Renegade API:`,
        error,
      );
      return null;
    }
  }

  // TODO: Add polling functionality later
  // start(): void {
  //   // Start periodic polling of price levels
  // }

  // stop(): void {
  //   // Stop polling and cleanup resources
  // }

  // TODO: Add caching functionality later
  // async getCachedLevels(): Promise<RenegadeLevelsResponse | null> {
  //   // Get levels from cache, fallback to API if not available
  // }

  // private async cacheLevels(levels: RenegadeLevelsResponse): Promise<void> {
  //   // Store levels in cache
  // }
}
