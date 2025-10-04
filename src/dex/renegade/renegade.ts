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
import { TokenMetadataFetcher } from './token-metadata-fetcher';
import { RenegadeLevelsResponse } from './renegade-levels-response';
import {
  RenegadeRateFetcherConfig,
  RenegadeTokenMetadata,
  RenegadePairData,
} from './types';
import { RenegadeConfig } from './config';
import {
  RENEGADE_GAS_COST,
  RENEGADE_LEVELS_CACHE_KEY,
  RENEGADE_LEVELS_CACHE_TTL,
  RENEGADE_LEVELS_POLLING_INTERVAL,
  RENEGADE_TOKEN_METADATA_CACHE_KEY,
  RENEGADE_TOKEN_METADATA_CACHE_TTL,
  RENEGADE_TOKEN_METADATA_POLLING_INTERVAL,
} from './constants';

// Placeholder types - these will need to be properly defined
export interface RenegadeData {
  // Define the data structure for Renegade pools/swaps
}

export class Renegade extends SimpleExchange implements IDex<RenegadeData> {
  readonly hasConstantPriceLargeAmounts = false;
  readonly needWrapNative = true;
  readonly isFeeOnTransferSupported = false;
  readonly isStatePollingDex = true;

  public static dexKeysWithNetwork: { key: string; networks: Network[] }[] = [
    { key: 'Renegade', networks: [Network.ARBITRUM, Network.BASE] },
  ];

  private rateFetcher: RateFetcher;
  private tokenMetadataFetcher: TokenMetadataFetcher;
  private tokensMap: Record<string, RenegadeTokenMetadata> = {};

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

    // Initialize rate fetcher with credentials and caching config
    const rateFetcherConfig: RenegadeRateFetcherConfig = {
      apiKey,
      apiSecret,
      levelsCacheKey: RENEGADE_LEVELS_CACHE_KEY,
      levelsCacheTTL: RENEGADE_LEVELS_CACHE_TTL,
    };

    this.rateFetcher = new RateFetcher(
      this.dexHelper,
      this.dexKey,
      this.network,
      this.logger,
      rateFetcherConfig,
    );

    this.tokenMetadataFetcher = new TokenMetadataFetcher(
      this.dexHelper,
      this.dexKey,
      this.network,
      this.logger,
    );
  }

  async initializePricing(blockNumber: number): Promise<void> {
    this.logger.info('Initializing Renegade pricing...');
    await this.setTokensMap();

    // Start polling for price levels if not in slave mode
    if (!this.dexHelper.config.isSlave) {
      this.rateFetcher.start();
    }
  }

  async updatePoolState(): Promise<void> {
    this.logger.info('Updating Renegade pool state...');
    await this.setTokensMap();
  }

  /**
   * Set token metadata map from GitHub.
   */
  async setTokensMap(): Promise<void> {
    const metadata = await this.tokenMetadataFetcher.fetchTokenMetadata();
    if (metadata) {
      this.tokensMap = metadata;
      this.logger.info(
        `Successfully fetched ${
          Object.keys(metadata).length
        } token metadata entries`,
      );
    } else {
      this.logger.warn('Failed to fetch token metadata from GitHub');
    }
  }

  /**
   * Get cached price levels from persistent cache.
   *
   * @returns Promise resolving to RenegadeLevelsResponse or null if not available
   */
  async getCachedLevels(): Promise<RenegadeLevelsResponse | null> {
    const cachedLevels = await this.dexHelper.cache.getAndCacheLocally(
      this.dexKey,
      this.network,
      RENEGADE_LEVELS_CACHE_KEY,
      RENEGADE_LEVELS_CACHE_TTL,
    );

    if (cachedLevels) {
      const rawData = JSON.parse(cachedLevels) as {
        [pairIdentifier: string]: RenegadePairData;
      };
      const usdcAddress = RenegadeConfig['Renegade'][this.network].usdcAddress;
      return new RenegadeLevelsResponse(rawData, usdcAddress);
    }

    return null;
  }

  /**
   * Fetch and cache token metadata from GitHub.
   *
   * @returns Promise resolving to true if successful, false otherwise
   * @deprecated Use setTokensMap() instead to follow standard pattern
   */
  async fetchTokenMetadata(): Promise<boolean> {
    try {
      const metadata = await this.tokenMetadataFetcher.fetchTokenMetadata();
      if (metadata) {
        this.tokensMap = metadata;
        this.logger.info(
          `Successfully fetched ${
            Object.keys(metadata).length
          } token metadata entries`,
        );
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error('Failed to fetch token metadata:', error);
      return false;
    }
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
      // Get levels from cache (updated by polling)
      const levels = await this.getCachedLevels();
      if (!levels) {
        return [];
      }

      const pairContext = levels.resolvePair(srcToken, destToken);
      if (!pairContext) {
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
    const levels = await this.getCachedLevels();
    if (!levels) {
      return null;
    }

    // resolvePair maps ParaSwap's src/dest into Renegade's fixed base (non-USDC) / quote (USDC) ordering.
    const pairContext = levels.resolvePair(srcToken, destToken);
    if (!pairContext) {
      return null;
    }

    // Renegade surfaces a single midpoint level; supplying base hits bids, supplying USDC hits asks.
    const midpoint = levels.getMidpointLevel(pairContext);
    if (!midpoint) {
      return null;
    }

    const [priceStr] = midpoint;

    // Renegade quotes every pair as base (non-USDC) over quote (USDC): price is USDC per base token, size is reported in base units.
    const price = new BigNumber(priceStr);

    const baseToken = pairContext.baseToken;
    const quoteToken = pairContext.quoteToken;
    const srcIsBase = pairContext.srcIsBase;

    const prices = amounts.map(amount => {
      // v0 implementation: assume the midpoint level has enough size and ignore partial fill calculations.
      if (srcIsBase) {
        if (side === SwapSide.SELL) {
          const baseDecimal = convertToDecimal(amount, baseToken.decimals);
          const quoteDecimal = baseDecimal.multipliedBy(price);
          return convertFromDecimal(quoteDecimal, quoteToken.decimals);
        }

        const quoteDecimal = convertToDecimal(amount, quoteToken.decimals);
        const baseDecimal = quoteDecimal.dividedBy(price);
        return convertFromDecimal(baseDecimal, baseToken.decimals);
      }

      if (side === SwapSide.SELL) {
        const quoteDecimal = convertToDecimal(amount, quoteToken.decimals);
        const baseDecimal = quoteDecimal.dividedBy(price);
        return convertFromDecimal(baseDecimal, baseToken.decimals);
      }

      const baseDecimal = convertToDecimal(amount, baseToken.decimals);
      const quoteDecimal = baseDecimal.multipliedBy(price);
      return convertFromDecimal(quoteDecimal, quoteToken.decimals);
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
    try {
      // Get current price levels from cache
      const levels = await this.getCachedLevels();
      if (!levels) {
        this.logger.warn(`No price levels available for token ${tokenAddress}`);
        return [];
      }

      // Check if we have token metadata (should be initialized in initializePricing)
      if (Object.keys(this.tokensMap).length === 0) {
        this.logger.warn(
          `Token metadata not initialized for token ${tokenAddress}`,
        );
        return [];
      }

      // Get all pairs containing this token
      const relevantPairs = levels.getAllPairsForToken(
        tokenAddress,
        this.tokensMap,
      );
      if (relevantPairs.length === 0) {
        this.logger.debug(`No pairs found for token ${tokenAddress}`);
        return [];
      }

      // Calculate liquidity for each pair
      const connectorPools: Record<string, PoolLiquidity> = {};
      const settlementAddress =
        RenegadeConfig['Renegade'][this.network].settlementAddress;

      for (const pairContext of relevantPairs) {
        const isBase = pairContext.srcIsBase;
        const levels = isBase
          ? pairContext.pairData.bids
          : pairContext.pairData.asks;

        // Sum up USD notional sizes (size field is already USD!)
        const liquidityUSD = levels.reduce(
          (acc: number, [price, size]: [string, string]) => {
            return acc + parseFloat(size);
          },
          0,
        );

        if (liquidityUSD > 0) {
          const connectorToken = isBase
            ? pairContext.quoteToken
            : pairContext.baseToken;
          const poolId = connectorToken.address.toLowerCase();

          if (connectorPools[poolId]) {
            // Aggregate liquidity if we have multiple pairs with same connector
            connectorPools[poolId].liquidityUSD += liquidityUSD;
          } else {
            connectorPools[poolId] = {
              exchange: this.dexKey,
              address: settlementAddress,
              connectorTokens: [connectorToken],
              liquidityUSD,
            };
          }
        }
      }

      // Sort by liquidity and apply limit
      const pools = Object.values(connectorPools)
        .sort((a, b) => b.liquidityUSD - a.liquidityUSD)
        .slice(0, limit);

      this.logger.debug(
        `Found ${
          pools.length
        } pools for token ${tokenAddress} with total liquidity ${pools.reduce(
          (acc, p) => acc + p.liquidityUSD,
          0,
        )} USD`,
      );

      return pools;
    } catch (error) {
      this.logger.error(
        `Error getting top pools for token ${tokenAddress}:`,
        error,
      );
      return [];
    }
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
    this.logger.info('Releasing Renegade resources...');
    if (!this.dexHelper.config.isSlave) {
      this.rateFetcher.stop();
    }
  }

  // Helpers

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

/**
 * Converts an atomic amount (smallest token unit) to decimal representation.
 *
 * @param amount - The atomic amount as bigint
 * @param decimals - The number of decimal places for the token
 * @returns The decimal representation as BigNumber
 */
export function convertToDecimal(amount: bigint, decimals: number): BigNumber {
  const decimalAdjustment = new BigNumber(10).pow(decimals);
  return new BigNumber(amount.toString()).dividedBy(decimalAdjustment);
}

/**
 * Converts a decimal amount to atomic representation (smallest token unit).
 *
 * @param amount - The decimal amount as BigNumber
 * @param decimals - The number of decimal places for the token
 * @returns The atomic amount as bigint
 */
export function convertFromDecimal(
  amount: BigNumber,
  decimals: number,
): bigint {
  const decimalAdjustment = new BigNumber(10).pow(decimals);
  const atomicAmount = amount.multipliedBy(decimalAdjustment);
  return BigInt(
    atomicAmount.decimalPlaces(0, BigNumber.ROUND_FLOOR).toFixed(0),
  );
}
