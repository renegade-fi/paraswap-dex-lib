import {
  AdapterExchangeParam,
  Address,
  ExchangePrices,
  NumberAsString,
  PoolLiquidity,
  PoolPrices,
  SimpleExchangeParam,
  Token,
  TransferFeeParams,
} from '../../types';
import { Network, SwapSide } from '../../constants';
import { getDexKeysWithNetwork } from '../../utils';
import { IDex } from '../idex';
import { IDexHelper } from '../../dex-helper/idex-helper';
import { SimpleExchange } from '../simple-exchange';
import {
  RenegadeData,
  RenegadeLevelsResponse,
  RenegadePairData,
  RenegadePriceLevel,
} from './types';
import { RenegadeConfig } from './config';
import { RateFetcher } from './rate-fetcher';
import { USDC_ADDRESSES, RENEGADE_GAS_COST } from './constants';

export class Renegade extends SimpleExchange implements IDex<RenegadeData> {
  /** Indicates if this DEX requires active state polling for price updates. */
  readonly isStatePollingDex = true;

  /** Indicates if the DEX maintains constant prices for arbitrarily large amounts. */
  readonly hasConstantPriceLargeAmounts = false;

  /** Indicates if the DEX can handle fee-on-transfer tokens. */
  readonly isFeeOnTransferSupported = false;

  /** Indicates if the DEX requires ETH to be wrapped to WETH before trading. */
  readonly needWrapNative = false;

  /** Static configuration defining which networks this DEX integration supports. */
  public static dexKeysWithNetwork: { key: string; networks: Network[] }[] =
    getDexKeysWithNetwork(RenegadeConfig);

  private rateFetcher: RateFetcher;

  constructor(
    protected readonly network: Network,
    readonly dexKey: string,
    protected readonly dexHelper: IDexHelper,
  ) {
    super(dexHelper, dexKey);

    // Initialize rate fetcher with configuration
    const apiKey = this.dexHelper.config.data.renegadeApiKey;
    const apiSecret = this.dexHelper.config.data.renegadeApiSecret;
    if (!apiKey || !apiSecret) {
      throw new Error('Renegade auth token is not specified in configuration');
    }

    this.rateFetcher = new RateFetcher(
      this.dexHelper,
      this.dexKey,
      this.network,
      this.dexHelper.getLogger(this.dexKey),
      {
        apiKey: apiKey,
        apiSecret: apiSecret,
      },
    );
  }

  // ========================================
  // |           REQUIRED METHODS           |
  // ========================================

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
    try {
      // 1. Input validation
      if (srcToken.address.toLowerCase() === destToken.address.toLowerCase()) {
        this.dexHelper
          .getLogger(this.dexKey)
          .debug(`${this.dexKey}: Same token addresses, returning null`);
        return null;
      }

      if (amounts.length === 0) {
        this.dexHelper
          .getLogger(this.dexKey)
          .debug(`${this.dexKey}: Empty amounts array, returning null`);
        return null;
      }

      // Validate all amounts are positive
      const hasInvalidAmounts = amounts.some(amount => amount <= 0n);
      if (hasInvalidAmounts) {
        this.dexHelper
          .getLogger(this.dexKey)
          .warn(`${this.dexKey}: Found non-positive amounts, returning null`);
        return null;
      }

      // 2. Validate USDC/side parameter alignment (error on conflicts)
      this.validateUSDCAndSideAlignment(srcToken, destToken, side);

      // 3. Get pool identifiers (this handles USDC validation internally)
      const pools =
        limitPools ??
        (await this.getPoolIdentifiers(srcToken, destToken, side, blockNumber));

      if (pools.length === 0) {
        this.dexHelper
          .getLogger(this.dexKey)
          .debug(
            `${this.dexKey}: No valid pools found for pair ${
              srcToken.symbol || srcToken.address
            }/${destToken.symbol || destToken.address}`,
          );
        return null;
      }

      // 4. Fetch order book levels from Renegade API
      const levels = await this.rateFetcher.fetchLevels();
      if (!levels) {
        this.dexHelper
          .getLogger(this.dexKey)
          .warn(`${this.dexKey}: Failed to fetch levels from API`);
        return null;
      }

      // 5. Extract pair data for this token combination
      const pairData = this.findPairInLevels(levels, srcToken, destToken);
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

      // 6. Get the appropriate price level for this side
      const priceLevel = this.getPriceLevelForSide(pairData, side);
      if (!priceLevel) {
        this.dexHelper
          .getLogger(this.dexKey)
          .debug(`${this.dexKey}: No valid price level for side ${side}`);
        return null;
      }

      // 7. Calculate prices for all amounts
      const prices = this.calculatePricesFromSingleLevel(
        amounts,
        priceLevel,
        srcToken,
        destToken,
        side,
      );

      // 8. Return ExchangePrices structure
      const unit = BigInt(
        10 ** (side === SwapSide.SELL ? srcToken.decimals : destToken.decimals),
      );

      return [
        {
          prices,
          unit,
          data: {}, // Empty RenegadeData for now
          exchange: this.dexKey,
          gasCost: RENEGADE_GAS_COST,
          poolAddresses: [], // Not applicable for Renegade
          poolIdentifiers: pools,
        },
      ];
    } catch (error) {
      this.dexHelper
        .getLogger(this.dexKey)
        .error(`${this.dexKey}: Error in getPricesVolume:`, error);
      return null;
    }
  }

  /**
   * Returns the list of contract adapters (name and index) for a buy/sell.
   *
   * @param side - Whether this is a SELL or BUY operation
   * @returns Array of adapters or null if no adapters
   */
  getAdapters(_side: SwapSide): { name: string; index: number }[] | null {
    throw new Error('Method not implemented.');
  }

  /**
   * Encode params required by the exchange adapter.
   * V5: Used for multiSwap, buy & megaSwap
   * V6: Not used, can be left blank
   *
   * @param srcToken - Source token address
   * @param destToken - Destination token address
   * @param srcAmount - Source amount
   * @param destAmount - Destination amount
   * @param data - Exchange data
   * @param side - Swap side
   * @returns Adapter exchange parameters
   */
  getAdapterParam(
    _srcToken: Address,
    _destToken: Address,
    _srcAmount: string,
    _destAmount: string,
    _data: RenegadeData,
    _side: SwapSide,
  ): AdapterExchangeParam {
    throw new Error('Method not implemented.');
  }

  /**
   * Returns estimated gas cost of calldata for this DEX in multiSwap.
   *
   * @param poolPrices - Pool prices containing gas cost information
   * @returns Gas cost as number or array of numbers
   */
  getCalldataGasCost(_poolPrices: PoolPrices<RenegadeData>): number | number[] {
    throw new Error('Method not implemented.');
  }

  /**
   * Returns list of top pools based on liquidity.
   *
   * Renegade-specific behavior:
   * - Only returns pools where exactly one token is USDC (Renegade requirement)
   * - Uses cached levels from Renegade API for liquidity calculation
   * - Calculates liquidity from order book levels (bids/asks)
   * - Returns connector tokens (the "other" token in each pair)
   * - Sorts pools by USD liquidity in descending order
   *
   * @param tokenAddress - Token address to find pools for
   * @param limit - Maximum number of pools to return
   * @returns Promise resolving to array of pool liquidity objects
   */
  async getTopPoolsForToken(
    tokenAddress: Address,
    limit: number,
  ): Promise<PoolLiquidity[]> {
    try {
      this.dexHelper
        .getLogger(this.dexKey)
        .debug(
          `${this.dexKey}: Getting top pools for token ${tokenAddress}, limit: ${limit}`,
        );

      // 1. Fetch cached levels from Renegade API
      const levels = await this.rateFetcher.fetchLevels();
      if (!levels) {
        this.dexHelper
          .getLogger(this.dexKey)
          .warn(`${this.dexKey}: No levels available for pool discovery`);
        return [];
      }

      // 2. Normalize token address for comparison
      const normalizedTokenAddress = tokenAddress.toLowerCase();
      const pools: PoolLiquidity[] = [];

      // 3. Iterate through all available pairs
      for (const [pairId, pairData] of Object.entries(levels)) {
        const [baseToken, quoteToken] = pairId.split('/');

        // 4. Check if our token is in this pair
        const isBaseToken = normalizedTokenAddress === baseToken.toLowerCase();
        const isQuoteToken =
          normalizedTokenAddress === quoteToken.toLowerCase();

        if (!isBaseToken && !isQuoteToken) {
          continue; // Token not in this pair
        }

        // 5. Determine connector token (the "other" token in the pair)
        const connectorTokenAddress = isBaseToken ? quoteToken : baseToken;
        const connectorToken = this.getTokenFromAddress(connectorTokenAddress);

        // 6. Calculate liquidity USD value
        const liquidityUSD = await this.calculateLiquidityUSD(
          pairData,
          normalizedTokenAddress,
          connectorToken,
        );

        if (liquidityUSD <= 0) {
          continue; // Skip pools with no liquidity
        }

        // 7. Create pool liquidity object
        pools.push({
          exchange: this.dexKey,
          address: this.getRenegadeContractAddress(),
          connectorTokens: [connectorToken],
          liquidityUSD,
        });

        this.dexHelper
          .getLogger(this.dexKey)
          .debug(
            `${
              this.dexKey
            }: Found pool ${pairId} with liquidity $${liquidityUSD.toFixed(2)}`,
          );
      }

      // 8. Sort by liquidity USD (descending) and limit results
      const sortedPools = pools
        .sort((a, b) => b.liquidityUSD - a.liquidityUSD)
        .slice(0, limit);

      this.dexHelper
        .getLogger(this.dexKey)
        .debug(
          `${this.dexKey}: Returning ${sortedPools.length} top pools for token ${tokenAddress}`,
        );

      return sortedPools;
    } catch (error) {
      this.dexHelper
        .getLogger(this.dexKey)
        .error(
          `${this.dexKey}: Error getting top pools for token ${tokenAddress}:`,
          error,
        );
      return [];
    }
  }

  // ========================================
  // |           HELPER METHODS             |
  // ========================================

  // ========================================
  // |        POOL LIQUIDITY HELPERS         |
  // ========================================

  /**
   * Gets token information from address.
   *
   * Renegade-specific behavior:
   * - Returns basic token info for connector token identification
   * - Uses standard token decimals for common tokens
   * - TODO: Could be enhanced with token metadata from Renegade API
   *
   * @param address - Token address
   * @returns Token object with address and decimals
   */
  getTokenFromAddress(address: Address): Token {
    try {
      // For now, use standard decimals for common tokens
      // TODO: Could fetch token metadata from Renegade API or use dexHelper
      const commonTokens: { [key: string]: number } = {
        // USDC addresses by network
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 6, // Arbitrum USDC
        '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 6, // Base USDC
        // WETH addresses by network
        '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 18, // Arbitrum WETH
        '0x4200000000000000000000000000000000000006': 18, // Base WETH
      };

      const normalizedAddress = address.toLowerCase();
      const decimals = commonTokens[normalizedAddress];

      if (decimals === undefined) {
        this.dexHelper
          .getLogger(this.dexKey)
          .warn(
            `${this.dexKey}: Unknown token decimals for ${address}, using default 18`,
          );
        return {
          address: normalizedAddress,
          decimals: 18, // Default to 18 decimals
        };
      }

      return {
        address: normalizedAddress,
        decimals,
      };
    } catch (error) {
      this.dexHelper
        .getLogger(this.dexKey)
        .error(
          `${this.dexKey}: Error getting token from address ${address}:`,
          error,
        );
      // Return a default token object instead of null
      return {
        address: address.toLowerCase(),
        decimals: 18,
      };
    }
  }

  /**
   * Calculates USD liquidity value for a trading pair.
   *
   * Renegade-specific behavior:
   * - Uses order book levels to calculate maximum available liquidity
   * - Price is already in USD/base (no conversion needed)
   * - Amount is already in units of base (already decimal corrected)
   * - USD liquidity = price × amount (direct calculation)
   * - Uses the appropriate side (bids/asks) based on token position
   *
   * @param pairData - Pair data containing bids and asks
   * @param tokenAddress - Address of the token we're calculating liquidity for
   * @param connectorToken - The other token in the pair
   * @returns USD value of available liquidity
   */
  private async calculateLiquidityUSD(
    pairData: RenegadePairData,
    tokenAddress: string,
    connectorToken: Token,
  ): Promise<number> {
    try {
      // Determine which side of the order book to use
      // If token is base token, use asks (selling base for quote)
      // If token is quote token, use bids (selling quote for base)
      const levels = pairData.asks; // For now, use asks for liquidity calculation

      if (!levels || levels.length === 0) {
        return 0;
      }

      // Calculate total liquidity from order book levels
      let totalLiquidityUSD = 0;
      for (const level of levels) {
        if (!this.isValidPriceLevel(level)) {
          continue;
        }

        const [price, size] = level;
        const priceNum = parseFloat(price); // Price is already in USD/base
        const sizeNum = parseFloat(size); // Size is already in units of base (decimal corrected)

        // USD liquidity = price (USD/base) × size (base units) = USD
        const levelLiquidityUSD = priceNum * sizeNum;
        totalLiquidityUSD += levelLiquidityUSD;
      }

      if (totalLiquidityUSD <= 0) {
        return 0;
      }

      this.dexHelper
        .getLogger(this.dexKey)
        .debug(
          `${this.dexKey}: Calculated liquidity: $${totalLiquidityUSD.toFixed(
            2,
          )} USD for token ${tokenAddress}`,
        );

      return totalLiquidityUSD;
    } catch (error) {
      this.dexHelper
        .getLogger(this.dexKey)
        .error(
          `${this.dexKey}: Error calculating liquidity USD for ${tokenAddress}:`,
          error,
        );
      return 0;
    }
  }

  /**
   * Gets Renegade contract address for the current network.
   *
   * Renegade-specific behavior:
   * - Returns the appropriate contract address based on network
   * - TODO: Should be configured in RenegadeConfig
   *
   * @returns Contract address for Renegade on current network
   */
  private getRenegadeContractAddress(): Address {
    // TODO: This should be configured in RenegadeConfig
    // For now, return a placeholder - this needs to be updated with actual Renegade contract addresses
    const contractAddresses: { [key: number]: string } = {
      [Network.ARBITRUM]: '0x0000000000000000000000000000000000000000', // TODO: Add actual address
      [Network.BASE]: '0x0000000000000000000000000000000000000000', // TODO: Add actual address
    };

    const address = contractAddresses[this.network];
    if (!address) {
      throw new Error(
        `Renegade contract address not configured for network ${this.network}`,
      );
    }

    return address;
  }

  // ========================================
  // |         POOL IDENTIFIER HELPERS       |
  // ========================================

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

  // ========================================
  // |       RENEGADE VALIDATION HELPERS     |
  // ========================================

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
    const usdcAddress = USDC_ADDRESSES[this.network];
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

  /**
   * Validates a Renegade price level structure and values.
   *
   * Renegade-specific behavior:
   * - Single price level per pair (midpoint crossing)
   * - Price and size must be valid numbers
   * - Structure must be [price: string, size: string]
   * - Both values must be parseable as floats
   *
   * @param priceLevel - Price level to validate
   * @returns true if price level is valid, false otherwise
   */
  private isValidPriceLevel(priceLevel: RenegadePriceLevel): boolean {
    if (!priceLevel || priceLevel.length !== 2) {
      this.dexHelper
        .getLogger(this.dexKey)
        .warn(
          `${this.dexKey}: Invalid price level structure: ${JSON.stringify(
            priceLevel,
          )}`,
        );
      return false;
    }

    // Validate price and size are valid numbers
    const [priceStr, sizeStr] = priceLevel;
    if (
      !priceStr ||
      !sizeStr ||
      isNaN(parseFloat(priceStr)) ||
      isNaN(parseFloat(sizeStr))
    ) {
      this.dexHelper
        .getLogger(this.dexKey)
        .warn(
          `${this.dexKey}: Invalid price or size values: ${priceStr}, ${sizeStr}`,
        );
      return false;
    }

    // Validate positive values
    const price = parseFloat(priceStr);
    const size = parseFloat(sizeStr);
    if (price <= 0 || size <= 0) {
      this.dexHelper
        .getLogger(this.dexKey)
        .warn(
          `${this.dexKey}: Non-positive price or size values: ${price}, ${size}`,
        );
      return false;
    }

    return true;
  }

  /**
   * Gets the appropriate price level based on ParaSwap side parameter.
   *
   * Renegade-specific behavior:
   * - SELL orders use bids (selling to the bid)
   * - BUY orders use asks (buying from the ask)
   * - Single price level per pair (no complex order book traversal)
   * - Validates price level structure and values
   *
   * @param pairData - Pair data containing bids and asks
   * @param side - ParaSwap side parameter
   * @returns Price level for the side, or null if invalid
   */
  private getPriceLevelForSide(
    pairData: RenegadePairData,
    side: SwapSide,
  ): RenegadePriceLevel | null {
    const levels = side === SwapSide.SELL ? pairData.bids : pairData.asks;

    if (!levels || levels.length === 0) {
      this.dexHelper
        .getLogger(this.dexKey)
        .debug(
          `${this.dexKey}: No ${
            side === SwapSide.SELL ? 'bids' : 'asks'
          } available`,
        );
      return null;
    }

    const priceLevel = levels[0];
    if (!this.isValidPriceLevel(priceLevel)) {
      return null;
    }

    this.dexHelper
      .getLogger(this.dexKey)
      .debug(
        `${this.dexKey}: Using ${
          side === SwapSide.SELL ? 'bid' : 'ask'
        } level: price=${priceLevel[0]}, size=${priceLevel[1]}`,
      );

    return priceLevel;
  }

  // ========================================
  // |       PRICE CALCULATION HELPERS       |
  // ========================================

  /**
   * Converts amount from smallest token units to token units.
   *
   * Renegade-specific behavior:
   * - Handles different token decimals (USDC=6, WETH=18)
   * - Uses safe floating point conversion
   * - Accounts for precision in calculations
   *
   * @param amount - Amount in smallest token units
   * @param token - Token (for decimal places)
   * @returns Amount in token units
   */
  private convertAmountToTokenUnits(amount: bigint, token: Token): number {
    return Number(amount) / 10 ** token.decimals;
  }

  /**
   * Converts amount from token units to smallest token units.
   *
   * Renegade-specific behavior:
   * - Handles different token decimals (USDC=6, WETH=18)
   * - Uses Math.floor for integer conversion
   * - Ensures no precision loss in final amounts
   *
   * @param amount - Amount in token units
   * @param token - Token (for decimal places)
   * @returns Amount in smallest token units
   */
  private convertTokenUnitsToAmount(amount: number, token: Token): bigint {
    return BigInt(Math.floor(amount * 10 ** token.decimals));
  }

  /**
   * Calculates price for partial fill when input exceeds available liquidity.
   *
   * Renegade-specific behavior:
   * - Returns maximum available liquidity when input > size
   * - Uses single price level (no slippage within level)
   * - Handles decimal conversion properly
   * - Supports competitive positioning in ParaSwap routing
   *
   * @param inputAmount - Requested input amount
   * @param availableSize - Available liquidity size
   * @param price - Price per unit
   * @param outputToken - Output token (for decimals)
   * @returns Output amount for partial fill
   */
  private calculatePartialFillPrice(
    inputAmount: bigint,
    availableSize: number,
    price: number,
    outputToken: Token,
  ): bigint {
    const inputInTokenUnits = this.convertAmountToTokenUnits(
      inputAmount,
      outputToken,
    );

    this.dexHelper
      .getLogger(this.dexKey)
      .debug(
        `${this.dexKey}: Partial fill - requested: ${inputInTokenUnits}, available: ${availableSize}`,
      );

    // Use maximum available liquidity
    const outputInTokenUnits = availableSize * price;
    return this.convertTokenUnitsToAmount(outputInTokenUnits, outputToken);
  }

  /**
   * Calculates prices for all input amounts using a single price level.
   *
   * Renegade-specific behavior:
   * - Uses single price level per pair (midpoint crossing)
   * - Handles partial fills when input amount exceeds available liquidity
   * - Supports competitive positioning in ParaSwap routing
   * - Proper decimal handling for different token types
   *
   * @param amounts - Array of input amounts (in smallest token units)
   * @param priceLevel - Single price level [price, size] from Renegade
   * @param srcToken - Source token
   * @param destToken - Destination token
   * @param side - Whether this is SELL or BUY
   * @returns Array of output amounts (in smallest token units)
   */
  private calculatePricesFromSingleLevel(
    amounts: bigint[],
    priceLevel: RenegadePriceLevel,
    srcToken: Token,
    destToken: Token,
    side: SwapSide,
  ): bigint[] {
    const price = parseFloat(priceLevel[0]);
    const availableSize = parseFloat(priceLevel[1]);

    this.dexHelper
      .getLogger(this.dexKey)
      .debug(
        `${this.dexKey}: Price level - price: ${price}, size: ${availableSize}, side: ${side}`,
      );

    return amounts.map(inputAmount => {
      // Convert input amount to token units (accounting for decimals)
      const inputToken = side === SwapSide.SELL ? srcToken : destToken;
      const inputInTokenUnits = this.convertAmountToTokenUnits(
        inputAmount,
        inputToken,
      );

      // Check if we have sufficient liquidity
      if (inputInTokenUnits > availableSize) {
        // Return partial fill - use maximum available liquidity
        const outputToken = side === SwapSide.SELL ? destToken : srcToken;
        return this.calculatePartialFillPrice(
          inputAmount,
          availableSize,
          price,
          outputToken,
        );
      }

      // Calculate output amount
      const outputInTokenUnits = inputInTokenUnits * price;
      const outputToken = side === SwapSide.SELL ? destToken : srcToken;

      return this.convertTokenUnitsToAmount(outputInTokenUnits, outputToken);
    });
  }

  // ========================================
  // |       CONFLICT RESOLUTION HELPERS     |
  // ========================================

  /**
   * Determines Renegade's expected side based on USDC direction.
   *
   * Renegade-specific behavior:
   * - Sending USDC = BUY (buying the other token with USDC)
   * - Receiving USDC = SELL (selling the other token for USDC)
   * - This is Renegade's internal USDC-centric logic
   *
   * @param srcToken - Source token
   * @param destToken - Destination token
   * @returns Expected SwapSide based on USDC direction
   */
  private getUSDCExpectedSide(srcToken: Token, destToken: Token): SwapSide {
    const isSrcTokenUSDC = this.isTokenUSDC(srcToken);

    if (isSrcTokenUSDC) {
      // Sending USDC = BUY (buying the other token with USDC)
      return SwapSide.BUY;
    } else {
      // Receiving USDC = SELL (selling the other token for USDC)
      return SwapSide.SELL;
    }
  }

  /**
   * Validates that the USDC direction aligns with ParaSwap's side parameter.
   *
   * Renegade-specific behavior:
   * - Throws error on non-obvious scenarios to prevent incorrect pricing
   * - Prevents incorrect pricing in ambiguous cases
   * - Documents conflicts for manual review
   * - Uses USDC-centric logic to determine expected side
   *
   * @param srcToken - Source token
   * @param destToken - Destination token
   * @param side - ParaSwap side parameter
   * @throws Error if USDC direction conflicts with side parameter
   */
  private validateUSDCAndSideAlignment(
    srcToken: Token,
    destToken: Token,
    side: SwapSide,
  ): void {
    const usdcAddress = USDC_ADDRESSES[this.network];
    if (!usdcAddress) {
      return; // No USDC validation if not configured
    }

    const isSrcTokenUSDC = this.isTokenUSDC(srcToken);
    const isDestTokenUSDC = this.isTokenUSDC(destToken);

    // Skip validation if neither token is USDC (shouldn't happen due to getPoolIdentifiers)
    if (!isSrcTokenUSDC && !isDestTokenUSDC) {
      return;
    }

    // Determine Renegade's expected side based on USDC direction
    const renegadeExpectedSide = this.getUSDCExpectedSide(srcToken, destToken);

    // Check for conflict
    if (side !== renegadeExpectedSide) {
      const conflictType = isSrcTokenUSDC
        ? `SELL USDC (ParaSwap: ${side}, Renegade expects: ${renegadeExpectedSide})`
        : `BUY USDC (ParaSwap: ${side}, Renegade expects: ${renegadeExpectedSide})`;

      this.dexHelper
        .getLogger(this.dexKey)
        .error(
          `${this.dexKey}: USDC/side parameter conflict detected: ${conflictType}. ` +
            `This scenario needs manual review for correct bid/ask selection.`,
        );

      throw new Error(
        `Renegade USDC/side parameter conflict: ${conflictType}. ` +
          `ParaSwap side=${side} conflicts with Renegade's USDC-centric logic. ` +
          `This scenario requires manual validation for correct bid/ask selection.`,
      );
    }

    this.dexHelper
      .getLogger(this.dexKey)
      .debug(
        `${this.dexKey}: USDC/side alignment validated - ${
          isSrcTokenUSDC ? 'SELL' : 'BUY'
        } USDC matches side=${side}`,
      );
  }

  // ========================================
  // |        SIMPLE EXCHANGE HELPERS         |
  // ========================================

  /**
   * Override getApproveSimpleParam from SimpleExchange.
   *
   * @param token - Token to approve
   * @param target - Target address for approval
   * @param amount - Amount to approve
   * @returns Simple exchange parameter for approval
   */
  override getApproveSimpleParam(
    _token: Address,
    _target: Address,
    _amount: string,
  ): Promise<SimpleExchangeParam> {
    throw new Error('Method not implemented.');
  }

  /**
   * Build simple parameter without WETH conversion.
   *
   * @param src - Source token address
   * @param srcAmount - Source amount
   * @param dest - Destination token address
   * @param destAmount - Destination amount
   * @param swapCallData - Swap call data
   * @param swapCallee - Swap callee address
   * @returns Simple exchange parameter
   */
  protected async buildSimpleParamWithoutWETHConversion(
    _src: Address,
    _srcAmount: NumberAsString,
    _dest: Address,
    _destAmount: NumberAsString,
    _swapCallData: string,
    _swapCallee: Address,
  ): Promise<SimpleExchangeParam> {
    throw new Error('Method not implemented.');
  }
}
