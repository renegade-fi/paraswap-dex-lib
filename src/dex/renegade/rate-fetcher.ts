import { IDexHelper } from '../../dex-helper';
import { Logger } from '../../types';
import { Network } from '../../constants';
import {
  RenegadePairData,
  RenegadeRateFetcherConfig,
  RenegadeTokenMetadata,
  RenegadeTokenRemap,
} from './types';
import {
  buildRenegadeApiUrl,
  RENEGADE_LEVELS_ENDPOINT,
  RENEGADE_LEVELS_POLLING_INTERVAL,
  RENEGADE_TOKEN_MAPPINGS_BASE_URL,
  RENEGADE_TOKEN_MAPPINGS_TIMEOUT_MS,
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
  private tokenMetadataFetcher!: Fetcher<RenegadeTokenRemap>; // Initialized in constructor

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

    // Initialize token metadata fetcher (one-time fetch, no polling)
    this.initializeTokenMetadataFetcher();
  }

  /**
   * Initialize token metadata fetcher for one-time fetch.
   * Token metadata is static and doesn't need polling.
   */
  private initializeTokenMetadataFetcher(): void {
    const chainName = this.getChainName();
    const url = `${RENEGADE_TOKEN_MAPPINGS_BASE_URL}${chainName}.json`;

    // Create caster function for token metadata
    const caster = (data: unknown): RenegadeTokenRemap => {
      if (typeof data !== 'object' || data === null) {
        throw new Error('Invalid token metadata response format');
      }
      return data as RenegadeTokenRemap;
    };

    // Create request info for token metadata fetcher
    const tokenRequestInfo: RequestInfo<RenegadeTokenRemap> = {
      requestOptions: {
        url,
        method: 'GET',
      },
      caster,
    };

    // Initialize token metadata fetcher with very long polling interval (effectively one-time)
    // We'll trigger it manually and stop polling after first fetch
    this.tokenMetadataFetcher = new Fetcher<RenegadeTokenRemap>(
      this.dexHelper.httpRequest,
      {
        info: tokenRequestInfo,
        handler: this.handleTokenMetadataResponse.bind(this),
      },
      24 * 60 * 60 * 1000, // 24 hours - effectively no polling
      this.logger,
    );
  }

  /**
   * Get chain name for token mappings URL.
   */
  private getChainName(): string {
    switch (this.network) {
      case Network.ARBITRUM:
        return 'arbitrum-one';
      case Network.BASE:
        return 'base-mainnet';
      default:
        throw new Error(
          `Network ${this.network} is not supported for token metadata`,
        );
    }
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
   * Handle successful token metadata response from the Fetcher.
   *
   * @param tokenRemap - The token metadata response
   */
  private handleTokenMetadataResponse(tokenRemap: RenegadeTokenRemap): void {
    // Convert full token info to minimal metadata (YAGNI)
    const tokensMap: Record<string, RenegadeTokenMetadata> = {};

    for (const tokenInfo of tokenRemap.tokens) {
      const address = tokenInfo.address.toLowerCase();
      tokensMap[address] = {
        address: tokenInfo.address,
        decimals: tokenInfo.decimals,
        ticker: tokenInfo.ticker,
      };
    }

    const tokenCount = Object.keys(tokensMap).length;

    // Write to persistent cache
    this.dexHelper.cache.setex(
      this.dexKey,
      this.network,
      this.config.tokenMetadataCacheKey,
      this.config.tokenMetadataCacheTTL,
      JSON.stringify(tokensMap),
    );

    this.logger.debug(
      `${this.dexKey}: Successfully cached ${tokenCount} token metadata entries`,
    );
  }

  /**
   * Fetch token metadata once (no polling).
   * Token metadata is static and only needs to be fetched once.
   *
   * @returns Promise resolving to true if successful, false otherwise
   */
  async fetchTokenMetadataOnce(): Promise<boolean> {
    try {
      this.logger.debug(`${this.dexKey}: Fetching token metadata once`);

      // Trigger one-time fetch
      await this.tokenMetadataFetcher.fetch(true);

      // Stop polling after first fetch since token metadata is static
      this.tokenMetadataFetcher.stopPolling();

      return true;
    } catch (error) {
      this.logger.error(
        `${this.dexKey}: Failed to fetch token metadata:`,
        error,
      );
      return false;
    }
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
    // Token metadata fetcher doesn't need to be stopped as it's one-time only
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
