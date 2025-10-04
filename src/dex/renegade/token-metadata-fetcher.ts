import { IDexHelper } from '../../dex-helper';
import { Logger } from '../../types';
import { Network } from '../../constants';
import {
  RenegadeTokenMetadata,
  RenegadeTokenInfo,
  RenegadeTokenRemap,
} from './types';
import {
  RENEGADE_TOKEN_MAPPINGS_BASE_URL,
  RENEGADE_TOKEN_MAPPINGS_TIMEOUT_MS,
} from './constants';

/**
 * Fetches token metadata from Renegade's GitHub repository.
 *
 * No caching - makes direct API calls each time.
 */
export class TokenMetadataFetcher {
  constructor(
    private dexHelper: IDexHelper,
    private dexKey: string,
    private network: Network,
    private logger: Logger,
  ) {}

  /**
   * Fetch token metadata for the current network.
   *
   * @returns Promise resolving to address → metadata mapping or null if fetch fails
   */
  async fetchTokenMetadata(): Promise<Record<
    string,
    RenegadeTokenMetadata
  > | null> {
    try {
      this.logger.debug(`${this.dexKey}: Fetching token metadata from GitHub`);

      const chainName = this.getChainName();
      const url = `${RENEGADE_TOKEN_MAPPINGS_BASE_URL}${chainName}.json`;

      this.logger.debug(`${this.dexKey}: Using token mappings URL: ${url}`);

      const response = await this.dexHelper.httpRequest.get<RenegadeTokenRemap>(
        url,
        RENEGADE_TOKEN_MAPPINGS_TIMEOUT_MS,
      );

      if (!response || !response.tokens) {
        this.logger.warn(
          `${this.dexKey}: No token metadata received from GitHub`,
        );
        return null;
      }

      // Convert full token info to minimal metadata (YAGNI)
      const tokensMap: Record<string, RenegadeTokenMetadata> = {};

      for (const tokenInfo of response.tokens) {
        const address = tokenInfo.address.toLowerCase();
        tokensMap[address] = {
          address: tokenInfo.address,
          decimals: tokenInfo.decimals,
          ticker: tokenInfo.ticker,
        };
      }

      const tokenCount = Object.keys(tokensMap).length;
      this.logger.debug(
        `${this.dexKey}: Successfully fetched ${tokenCount} token metadata entries`,
      );

      return tokensMap;
    } catch (error) {
      this.logger.error(
        `${this.dexKey}: Failed to fetch token metadata from GitHub:`,
        error,
      );
      return null;
    }
  }

  /**
   * Get the chain name used in Renegade's token mappings.
   *
   * @returns Chain name for the token mappings API
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
}
