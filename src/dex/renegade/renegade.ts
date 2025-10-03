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
import { RenegadeData, RenegadeLevelsResponse } from './types';
import { RenegadeConfig } from './config';
import { RateFetcher } from './rate-fetcher';
import { USDC_ADDRESSES } from './constants';

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

  // --------
  // | IDex |
  // --------

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

  private _sortTokens(srcAddress: Address, destAddress: Address) {
    return [srcAddress, destAddress].sort((a, b) => (a < b ? -1 : 1));
  }

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
   * Returns list of pool identifiers that can be used for a given swap.
   *
   * Renegade-specific requirements:
   * - Exactly one token must be USDC (Renegade only supports USDC pairs)
   * - Checks both directions in levels response for pair existence
   * - Returns ParaSwap-compatible identifiers with alphabetical sorting
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

      // Identify USDC token
      const usdcAddress = USDC_ADDRESSES[this.network];
      if (!usdcAddress) {
        this.dexHelper
          .getLogger(this.dexKey)
          .warn(`USDC address not configured for network ${this.network}`);
        return [];
      }

      const isSrcTokenUSDC =
        srcToken.address.toLowerCase() === usdcAddress.toLowerCase();
      const isDestTokenUSDC =
        destToken.address.toLowerCase() === usdcAddress.toLowerCase();

      // Verify exactly one token is USDC (Renegade requirement)
      if (!(isSrcTokenUSDC !== isDestTokenUSDC)) {
        // XOR: exactly one is USDC
        return [];
      }

      // Check if pair exists in levels (try both directions)
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

  getPricesVolume(
    _srcToken: Token,
    _destToken: Token,
    _amounts: bigint[],
    _side: SwapSide,
    _blockNumber: number,
    _limitPools?: string[],
    _transferFees?: TransferFeeParams,
    _isFirstSwap?: boolean,
  ): Promise<ExchangePrices<RenegadeData> | null> {
    throw new Error('Method not implemented.');
  }

  getCalldataGasCost(_poolPrices: PoolPrices<RenegadeData>): number | number[] {
    throw new Error('Method not implemented.');
  }

  getAdapters(_side: SwapSide): { name: string; index: number }[] | null {
    throw new Error('Method not implemented.');
  }

  getTopPoolsForToken(
    _tokenAddress: Address,
    _limit: number,
  ): Promise<PoolLiquidity[]> {
    throw new Error('Method not implemented.');
  }

  // ------------------
  // | SimpleExchange |
  // ------------------

  override getApproveSimpleParam(
    _token: Address,
    _target: Address,
    _amount: string,
  ): Promise<SimpleExchangeParam> {
    throw new Error('Method not implemented.');
  }

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
