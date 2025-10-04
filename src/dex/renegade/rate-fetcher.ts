import { IDexHelper } from '../../dex-helper';
import { Logger } from '../../types';
import { Network } from '../../constants';
import { RenegadePairData, RenegadeRateFetcherConfig } from './types';
import {
  buildRenegadeApiUrl,
  RENEGADE_LEVELS_ENDPOINT,
  RENEGADE_LEVELS_POLLING_INTERVAL,
} from './constants';
import { generateRenegadeAuthHeaders } from './auth-helper';
import { RenegadeLevelsResponse } from './renegade-levels-response';
import { RenegadeConfig } from './config';
import { Fetcher, RequestInfo } from '../../lib/fetcher/fetcher';
import { RequestConfig } from '../../dex-helper/irequest-wrapper';

/**
 * RateFetcher for Renegade DEX integration using the Fetcher class.
 *
 * This implementation uses the standard Fetcher class with HMAC-SHA256 authentication
 * and includes polling functionality for real-time price level updates.
 */
export class RateFetcher {
  private levelsFetcher: Fetcher<RenegadeLevelsResponse>;

  constructor(
    private dexHelper: IDexHelper,
    private dexKey: string,
    private network: Network,
    private logger: Logger,
    private config: RenegadeRateFetcherConfig,
  ) {
    // Build network-specific API URL
    const baseUrl = buildRenegadeApiUrl(this.network);
    const url = `${baseUrl}${RENEGADE_LEVELS_ENDPOINT}`;

    // Create authentication function for Renegade API
    const authenticate = (options: RequestConfig): RequestConfig => {
      // Ensure headers object exists
      if (!options.headers) {
        options.headers = {};
      }

      // Convert headers to string format for auth function
      const stringHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(options.headers)) {
        stringHeaders[key] = String(value);
      }

      // Generate authenticated headers using HMAC-SHA256
      const authenticatedHeaders = generateRenegadeAuthHeaders(
        RENEGADE_LEVELS_ENDPOINT,
        options.data ? JSON.stringify(options.data) : '', // Convert body to string
        stringHeaders,
        this.config.apiKey,
        this.config.apiSecret,
      );

      // Merge authenticated headers into request options
      options.headers = { ...options.headers, ...authenticatedHeaders };

      return options;
    };

    // Create caster function to validate and transform response
    const caster = (data: unknown): RenegadeLevelsResponse => {
      if (typeof data !== 'object' || data === null) {
        throw new Error('Invalid response format from Renegade API');
      }

      const response = data as { [pairIdentifier: string]: RenegadePairData };
      const usdcAddress = RenegadeConfig['Renegade'][this.network].usdcAddress;

      return new RenegadeLevelsResponse(response, usdcAddress);
    };

    // Create request info for the Fetcher
    const requestInfo: RequestInfo<RenegadeLevelsResponse> = {
      requestOptions: {
        url,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      caster,
      authenticate,
    };

    // Initialize the Fetcher
    this.levelsFetcher = new Fetcher<RenegadeLevelsResponse>(
      this.dexHelper.httpRequest,
      {
        info: requestInfo,
        handler: this.handleLevelsResponse.bind(this),
      },
      RENEGADE_LEVELS_POLLING_INTERVAL,
      this.logger,
    );
  }

  /**
   * Handle successful levels response from the Fetcher.
   *
   * @param levelsResponse - The parsed and validated levels response
   */
  private handleLevelsResponse(levelsResponse: RenegadeLevelsResponse): void {
    // Get raw data for serialization
    const rawData = levelsResponse.getRawData();
    const pairCount = Object.keys(rawData).length;

    // Write to persistent cache (like Bebop)
    this.dexHelper.cache.setex(
      this.dexKey,
      this.network,
      this.config.levelsCacheKey,
      this.config.levelsCacheTTL,
      JSON.stringify(rawData), // Serialize the raw pair data
    );

    this.logger.debug(
      `${this.dexKey}: Successfully cached ${pairCount} price level pairs`,
    );
  }

  /**
   * Start polling for price level updates.
   *
   * Begins periodic fetching of price levels from the Renegade API.
   */
  start(): void {
    this.logger.info(`${this.dexKey}: Starting Renegade price levels polling`);
    this.levelsFetcher.startPolling();
  }

  /**
   * Stop polling for price level updates.
   *
   * Stops the periodic fetching and cleans up resources.
   */
  stop(): void {
    this.logger.info(`${this.dexKey}: Stopping Renegade price levels polling`);
    this.levelsFetcher.stopPolling();
  }

  /**
   * Check if polling is currently active.
   *
   * @returns True if polling is active, false otherwise
   */
  isPolling(): boolean {
    return this.levelsFetcher.isPolling();
  }

  /**
   * Check if the last fetch operation succeeded.
   *
   * @returns True if the last fetch succeeded, false otherwise
   */
  isLastFetchSuccessful(): boolean {
    return this.levelsFetcher.lastFetchSucceeded;
  }
}
