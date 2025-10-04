import { assert } from 'ts-essentials';
import BigNumber from 'bignumber.js';
import * as CALLDATA_GAS_COST from '../../calldata-gas-cost';
import { Network, SwapSide } from '../../constants';
import { IDexHelper } from '../../dex-helper/idex-helper';
import { IDex } from '../../dex/idex';
import {
  AdapterExchangeParam,
  Address,
  DexExchangeParam,
  ExchangePrices,
  Logger,
  NumberAsString,
  PoolLiquidity,
  PoolPrices,
  SimpleExchangeParam,
  Token,
  TransferFeeParams,
} from '../../types';
import { SimpleExchange } from '../simple-exchange';
import { RateFetcher } from './rate-fetcher';
import {
  RenegadeLevelsResponse,
  RenegadePairData,
  RenegadePriceLevel,
  RenegadeRateFetcherConfig,
} from './types';
import { RenegadeConfig } from './config';
import { RENEGADE_GAS_COST } from './constants';

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

  /**
   * Returns pool prices for given amounts.
   *
   * @param srcToken - Source token for the swap
   * @param destToken - Destination token for the swap
   * @param amounts - Array of input amounts (in smallest token units)
   * @param side - Whether this is a SELL (src->dest) or BUY (dest->src) operation
   * @param blockNumber - Current block number (used for state consistency)
   * @param limitPools - Optional array of pool identifiers to limit pricing to
   * @param transferFees - Optional transfer fee parameters
   * @param isFirstSwap - Whether this is the first swap in a multi-hop route
   * @returns Promise resolving to ExchangePrices array or null if no pricing available
   */
  async getPricesVolume(
    srcToken: Token,
    destToken: Token,
    amounts: bigint[],
    side: SwapSide,
    blockNumber: number,
    limitPools?: string[],
    transferFees?: TransferFeeParams,
    isFirstSwap?: boolean,
  ): Promise<ExchangePrices<RenegadeData> | null> {
    const levels = await this.rateFetcher.fetchLevels();
    if (!levels) {
      return null;
    }

    const srcIsUSDC = this.isTokenUSDC(srcToken);
    const baseToken = srcIsUSDC ? destToken : srcToken;
    const quoteToken = srcIsUSDC ? srcToken : destToken;
    const pairId = this.getRenegadePairIdentifier(
      baseToken.address,
      quoteToken.address,
    );
    const pair = levels[pairId];
    if (!pair) {
      return null;
    }

    // Renegade exposes a single midpoint level per pair; selling base hits bids, buying base hits asks.
    const book = srcIsUSDC ? pair.asks : pair.bids;
    if (!book.length) {
      return null;
    }

    const [priceStr] = book[0];

    // Renegade quotes every pair as base (non-USDC) over quote (USDC): price is USDC per base token, size is reported in base units.
    const price = new BigNumber(priceStr);

    const baseUnit = new BigNumber(10).pow(baseToken.decimals);
    const quoteUnit = new BigNumber(10).pow(quoteToken.decimals);

    const computeBaseDecimalFromAtomic = (value: bigint) =>
      new BigNumber(value.toString()).dividedBy(baseUnit);
    const computeQuoteDecimalFromAtomic = (value: bigint) =>
      new BigNumber(value.toString()).dividedBy(quoteUnit);

    const prices = amounts.map(amount => {
      // v0 implementation: assume the midpoint level has enough size and ignore partial fill calculations.
      if (!srcIsUSDC) {
        if (side === SwapSide.SELL) {
          const baseDecimal = computeBaseDecimalFromAtomic(amount);
          const quoteDecimal = baseDecimal.multipliedBy(price);
          const quoteAtomic = quoteDecimal
            .multipliedBy(quoteUnit)
            .decimalPlaces(0, BigNumber.ROUND_FLOOR);
          return BigInt(quoteAtomic.toFixed(0));
        }

        const quoteDecimal = computeQuoteDecimalFromAtomic(amount);
        const baseDecimal = quoteDecimal.dividedBy(price);
        const baseAtomic = baseDecimal
          .multipliedBy(baseUnit)
          .decimalPlaces(0, BigNumber.ROUND_CEIL);
        return BigInt(baseAtomic.toFixed(0));
      }

      if (side === SwapSide.SELL) {
        const quoteDecimal = computeQuoteDecimalFromAtomic(amount);
        const baseDecimal = quoteDecimal.dividedBy(price);
        const baseAtomic = baseDecimal
          .multipliedBy(baseUnit)
          .decimalPlaces(0, BigNumber.ROUND_FLOOR);
        return BigInt(baseAtomic.toFixed(0));
      }

      const baseDecimal = computeBaseDecimalFromAtomic(amount);
      const quoteDecimal = baseDecimal.multipliedBy(price);
      const quoteAtomic = quoteDecimal
        .multipliedBy(quoteUnit)
        .decimalPlaces(0, BigNumber.ROUND_CEIL);
      return BigInt(quoteAtomic.toFixed(0));
    });

    const unitDecimals =
      side === SwapSide.SELL ? destToken.decimals : srcToken.decimals;
    const poolIdentifier = this.getPoolIdentifier(
      srcToken.address,
      destToken.address,
    );

    return [
      {
        prices,
        unit: BigInt(unitDecimals),
        data: {},
        poolIdentifiers: [poolIdentifier],
        exchange: this.dexKey,
        gasCost: RENEGADE_GAS_COST,
      },
    ];
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
   * Checks if a token is USDC for the current network.
   *
   * Renegade-specific behavior:
   * - Only supports USDC pairs (exactly one token must be USDC)
   * - Uses network-specific USDC addresses from constants
   * - Case-insensitive address comparison
   *
   * @param token - Token to check
   * @returns true if token is USDC, false otherwise
   */
  private isTokenUSDC(token: Token): boolean {
    const usdcAddress = this.getUSDCAddress(this.network);
    if (!usdcAddress) {
      this.dexHelper
        .getLogger(this.dexKey)
        .warn(
          `${this.dexKey}: USDC address not configured for network ${this.network}`,
        );
      return false;
    }

    return token.address.toLowerCase() === usdcAddress.toLowerCase();
  }

  /**
   * Validates that exactly one token is USDC (Renegade requirement).
   *
   * Renegade-specific behavior:
   * - All pairs must have exactly one USDC token
   * - Neither token can be USDC (invalid pair)
   * - Both tokens cannot be USDC (invalid pair)
   * - Uses XOR logic: exactly one must be true
   *
   * @param srcToken - Source token
   * @param destToken - Destination token
   * @returns true if exactly one token is USDC, false otherwise
   */
  private validateExactlyOneUSDC(srcToken: Token, destToken: Token): boolean {
    const isSrcTokenUSDC = this.isTokenUSDC(srcToken);
    const isDestTokenUSDC = this.isTokenUSDC(destToken);

    // XOR: exactly one must be USDC
    const exactlyOneUSDC = isSrcTokenUSDC !== isDestTokenUSDC;

    if (!exactlyOneUSDC) {
      this.dexHelper
        .getLogger(this.dexKey)
        .debug(
          `${this.dexKey}: Invalid USDC pair - srcToken: ${
            srcToken.symbol || srcToken.address
          } (USDC: ${isSrcTokenUSDC}), destToken: ${
            destToken.symbol || destToken.address
          } (USDC: ${isDestTokenUSDC})`,
        );
    }

    return exactlyOneUSDC;
  }

  /**
   * Validates if a token pair is valid for Renegade trading.
   *
   * Renegade-specific requirements:
   * - Exactly one token must be USDC
   * - Tokens cannot be the same
   * - Both tokens must exist in the network
   * - USDC address must be configured for the network
   *
   * @param srcToken - Source token
   * @param destToken - Destination token
   * @returns true if pair is valid for Renegade, false otherwise
   */
  private isValidRenegadePair(srcToken: Token, destToken: Token): boolean {
    // Check if tokens are the same
    if (srcToken.address.toLowerCase() === destToken.address.toLowerCase()) {
      this.dexHelper
        .getLogger(this.dexKey)
        .debug(`${this.dexKey}: Same token addresses - ${srcToken.address}`);
      return false;
    }

    // Check if exactly one token is USDC
    if (!this.validateExactlyOneUSDC(srcToken, destToken)) {
      return false;
    }

    this.dexHelper
      .getLogger(this.dexKey)
      .debug(
        `${this.dexKey}: Valid Renegade pair - ${
          srcToken.symbol || srcToken.address
        }/${destToken.symbol || destToken.address}`,
      );

    return true;
  }

  // ========================================
  // |        DATA PROCESSING HELPERS        |
  // ========================================

  /**
   * Finds pair data in Renegade levels response (bidirectional lookup).
   *
   * Renegade-specific behavior:
   * - Checks both directions (src/dest and dest/src)
   * - API might return pair in either direction
   * - Returns first match found
   * - Validates pair data structure (bids/asks arrays)
   *
   * @param levels - Levels response from Renegade API
   * @param srcToken - Source token
   * @param destToken - Destination token
   * @returns Pair data if found, null otherwise
   */
  private findPairInLevels(
    levels: RenegadeLevelsResponse,
    srcToken: Token,
    destToken: Token,
  ): RenegadePairData | null {
    // Try both directions for the pair
    const pairId1 = this.getRenegadePairIdentifier(
      srcToken.address,
      destToken.address,
    );
    const pairId2 = this.getRenegadePairIdentifier(
      destToken.address,
      srcToken.address,
    );

    const pairData = levels[pairId1] || levels[pairId2];
    if (!pairData) {
      this.dexHelper
        .getLogger(this.dexKey)
        .debug(
          `${this.dexKey}: No pair data found for ${
            srcToken.symbol || srcToken.address
          }/${destToken.symbol || destToken.address}`,
        );
      return null;
    }

    // Validate pair data structure
    if (
      !pairData.bids ||
      !pairData.asks ||
      !Array.isArray(pairData.bids) ||
      !Array.isArray(pairData.asks)
    ) {
      this.dexHelper
        .getLogger(this.dexKey)
        .warn(
          `${this.dexKey}: Invalid pair data structure for ${
            pairId1 || pairId2
          }`,
        );
      return null;
    }

    this.dexHelper
      .getLogger(this.dexKey)
      .debug(`${this.dexKey}: Found pair data for ${pairId1 || pairId2}`);

    return pairData;
  }
  // ========================================
  // |       CONFLICT RESOLUTION HELPERS     |
  // ========================================

  /**
   * Gets the USDC address for the current network.
   *
   * @param network - Network to get USDC address for
   * @returns USDC address
   */
  getUSDCAddress(network: Network): string {
    return RenegadeConfig['Renegade'][network].usdcAddress;
  }

  /**
   * Generate Renegade pair identifier for API lookup.
   *
   * Renegade uses pair identifiers in format: `${tokenA}/${tokenB}`
   * This method creates the identifier for API calls.
   *
   * @param tokenA - First token address
   * @param tokenB - Second token address
   * @returns Renegade pair identifier
   */
  private getRenegadePairIdentifier(tokenA: Address, tokenB: Address): string {
    return `${tokenA.toLowerCase()}/${tokenB.toLowerCase()}`;
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
