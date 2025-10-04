import { assert } from 'ts-essentials';
import * as CALLDATA_GAS_COST from '../../calldata-gas-cost';
import { Network, SwapSide } from '../../constants';
import { IDexHelper } from '../../dex-helper/idex-helper';
import { IDex } from '../../dex/idex';
import {
  AdapterExchangeParam,
  Address,
  DexExchangeParam,
  Logger,
  NumberAsString,
  PoolLiquidity,
  PoolPrices,
  SimpleExchangeParam,
  Token,
} from '../../types';
import { SimpleExchange } from '../simple-exchange';
import { RateFetcher } from './rate-fetcher';
import {
  RenegadeLevelsResponse,
  RenegadePairData,
  RenegadeRateFetcherConfig,
} from './types';

// Placeholder types - these will need to be properly defined
export interface RenegadeData {
  // Define the data structure for Renegade pools/swaps
}

export class Renegade extends SimpleExchange implements IDex<RenegadeData> {
  readonly hasConstantPriceLargeAmounts = false;
  readonly needWrapNative = true;
  readonly isFeeOnTransferSupported = false;

  public static dexKeysWithNetwork: { key: string; networks: Network[] }[] = [
    { key: 'Renegade', networks: [Network.ARBITRUM, Network.BASE] },
  ];

  private rateFetcher: RateFetcher;

  logger: Logger;

  constructor(
    readonly network: Network,
    readonly dexKey: string,
    readonly dexHelper: IDexHelper,
  ) {
    super(dexHelper, dexKey);
    this.logger = dexHelper.getLogger(dexKey);

    // Get API credentials from config
    const apiKey = this.dexHelper.config.data.renegadeAuthApiKey;
    const apiSecret = this.dexHelper.config.data.renegadeAuthApiSecret;

    assert(
      apiKey !== undefined,
      'Renegade API key is not specified with env variable API_KEY_RENEGADE_AUTH_API_KEY',
    );

    assert(
      apiSecret !== undefined,
      'Renegade API secret is not specified with env variable API_KEY_RENEGADE_AUTH_API_SECRET',
    );

    // Initialize rate fetcher with credentials
    const rateFetcherConfig: RenegadeRateFetcherConfig = {
      apiKey,
      apiSecret,
    };

    this.rateFetcher = new RateFetcher(
      this.dexHelper,
      this.dexKey,
      this.network,
      this.logger,
      rateFetcherConfig,
    );
  }

  async initializePricing(blockNumber: number): Promise<void> {
    // TODO: Implement pricing initialization
    this.logger.info('Initializing Renegade pricing...');
  }

  async updatePoolState(): Promise<void> {
    // TODO: Implement pool state update
    this.logger.info('Updating Renegade pool state...');
  }

  /**
   * Returns list of pool identifiers that can be used for a given swap.
   *
   * @param srcToken - Source token for the swap
   * @param destToken - Destination token for the swap
   * @param side - Whether this is a SELL (src->dest) or BUY (dest->src) operation
   * @param blockNumber - Current block number (used for state consistency)
   * @returns Promise resolving to array of pool identifier strings. Empty array means no tradeable pairs.
   */
  async getPoolIdentifiers(
    srcToken: Token,
    destToken: Token,
    side: SwapSide,
    blockNumber: number,
  ): Promise<string[]> {
    // Early return if tokens are the same
    if (srcToken.address.toLowerCase() === destToken.address.toLowerCase()) {
      return [];
    }

    try {
      // Get levels from API
      const levels = await this.rateFetcher.fetchLevels();
      if (!levels) {
        return [];
      }

      // Validate Renegade pair requirements
      if (!this.isValidRenegadePair(srcToken, destToken)) {
        return [];
      }

      // Check if pair exists in levels
      const pairData = this.findPairInLevels(levels, srcToken, destToken);
      if (!pairData) {
        return [];
      }

      // Return ParaSwap-compatible pool identifier (alphabetically sorted)
      return [this.getPoolIdentifier(srcToken.address, destToken.address)];
    } catch (error) {
      this.dexHelper
        .getLogger(this.dexKey)
        .error(`Error checking Renegade pool identifiers:`, error);
      return [];
    }
  }

  async getPricesVolume(
    srcToken: Token,
    destToken: Token,
    amounts: bigint[],
    side: SwapSide,
    blockNumber: number,
    limitPools?: string[],
  ): Promise<PoolPrices<RenegadeData>[] | null> {
    // TODO: Implement price calculation
    this.logger.info(
      `Getting prices for ${srcToken.address} -> ${destToken.address}`,
    );
    return null;
  }

  async getTopPoolsForToken(
    tokenAddress: Address,
    limit: number,
  ): Promise<PoolLiquidity[]> {
    // TODO: Implement top pools retrieval
    this.logger.info(`Getting top pools for token ${tokenAddress}`);
    return [];
  }

  getAdapterParam(
    srcToken: string,
    destToken: string,
    srcAmount: string,
    destAmount: string,
    data: RenegadeData,
    side: SwapSide,
  ): AdapterExchangeParam {
    // TODO: Implement adapter parameters
    throw new Error('Not implemented');
  }

  async getSimpleParam(
    srcToken: string,
    destToken: string,
    srcAmount: string,
    destAmount: string,
    data: RenegadeData,
    side: SwapSide,
  ): Promise<SimpleExchangeParam> {
    // TODO: Implement simple parameters
    throw new Error('Not implemented');
  }

  getDexParam(
    srcToken: Address,
    destToken: Address,
    srcAmount: NumberAsString,
    destAmount: NumberAsString,
    recipient: Address,
    data: RenegadeData,
    side: SwapSide,
  ): DexExchangeParam {
    // TODO: Implement DEX parameters
    throw new Error('Not implemented');
  }

  getCalldataGasCost(poolPrices: PoolPrices<RenegadeData>): number | number[] {
    // TODO: Implement gas cost calculation
    return CALLDATA_GAS_COST.DEX_OVERHEAD;
  }

  getAdapters(side?: SwapSide): { name: string; index: number }[] | null {
    // TODO: Implement adapters
    return null;
  }

  async releaseResources(): Promise<void> {
    // TODO: Implement resource cleanup if needed
    this.logger.info('Releasing Renegade resources...');
  }

  // Helpers

  /**
   * Check if the token pair is valid for Renegade trading.
   * Renegade requires exactly one token to be USDC.
   *
   * @param srcToken - Source token
   * @param destToken - Destination token
   * @returns True if pair is valid for Renegade
   */
  private isValidRenegadePair(srcToken: Token, destToken: Token): boolean {
    const usdcAddresses = [
      '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // Arbitrum USDC
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // Base USDC
    ];

    const srcIsUsdc = usdcAddresses.includes(srcToken.address.toLowerCase());
    const destIsUsdc = usdcAddresses.includes(destToken.address.toLowerCase());

    // Exactly one token must be USDC
    return srcIsUsdc !== destIsUsdc;
  }

  /**
   * Find pair data in Renegade levels response.
   *
   * @param levels - Renegade levels response
   * @param srcToken - Source token
   * @param destToken - Destination token
   * @returns Pair data if found, null otherwise
   */
  private findPairInLevels(
    levels: RenegadeLevelsResponse,
    srcToken: Token,
    destToken: Token,
  ): RenegadePairData | null {
    // Renegade pair identifiers follow format: baseToken/quoteToken
    // where USDC is always the quote token
    const usdcAddresses = [
      '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // Arbitrum USDC
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // Base USDC
    ];

    const srcIsUsdc = usdcAddresses.includes(srcToken.address.toLowerCase());
    const destIsUsdc = usdcAddresses.includes(destToken.address.toLowerCase());

    if (srcIsUsdc === destIsUsdc) {
      return null; // Invalid pair - both or neither are USDC
    }

    // Determine base and quote tokens
    const baseToken = srcIsUsdc ? destToken : srcToken;
    const quoteToken = srcIsUsdc ? srcToken : destToken;

    // Create pair identifier in Renegade format
    const pairIdentifier = `${baseToken.address.toLowerCase()}/${quoteToken.address.toLowerCase()}`;

    return levels[pairIdentifier] || null;
  }

  /**
   * Generate ParaSwap-compatible pool identifier following standard format.
   *
   * Follows ParaSwap standard: alphabetical sorting of token addresses
   * Format: `${dexKey}_${sortedTokenA}_${sortedTokenB}`
   *
   * @param tokenA - First token address
   * @param tokenB - Second token address
   * @returns ParaSwap pool identifier
   */
  private getPoolIdentifier(tokenA: Address, tokenB: Address): string {
    const tokenAddresses = this._sortTokens(tokenA, tokenB).join('_');
    return `${this.dexKey}_${tokenAddresses}`;
  }

  /**
   * Sort token addresses alphabetically.
   *
   * @param srcAddress - First token address
   * @param destAddress - Second token address
   * @returns Array of sorted token addresses
   */
  private _sortTokens(srcAddress: Address, destAddress: Address) {
    return [srcAddress, destAddress].sort((a, b) => (a < b ? -1 : 1));
  }
}
