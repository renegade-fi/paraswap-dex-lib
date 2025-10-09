import BigNumber from 'bignumber.js';
import { Token } from '../../types';
import { RenegadePairData } from './types';

export type RenegadePairContext = {
  pairId: string;
  baseToken: Token;
  quoteToken: Token;
  pairData: RenegadePairData;
  srcIsBase: boolean;
};

/**
 * Class for Renegade API levels response.
 *
 * Provides convenient access methods for checking pair existence and retrieving order book data.
 * Used primarily in getPricesVolume for price discovery.
 */
export class RenegadeLevelsResponse {
  private readonly levels: { [pairIdentifier: string]: RenegadePairData };

  constructor(
    data: { [pairIdentifier: string]: RenegadePairData },
    private readonly usdcAddress: string,
  ) {
    // Extract data from HTTP response
    this.levels = data;

    // Basic validation - ensure we have an object
    if (!this.levels || typeof this.levels !== 'object') {
      throw new Error('Invalid Renegade levels response: expected object');
    }
  }

  /**
   * Check if a pair is supported by Renegade.
   *
   * @param srcToken - Source token
   * @param destToken - Destination token
   * @returns true if the pair exists, false otherwise
   */
  hasPair(srcToken: Token, destToken: Token): boolean {
    return this.resolvePair(srcToken, destToken) !== null;
  }

  /**
   * Resolve a ParaSwap (src,dest) pair into Renegade nomenclature.
   *
   * Renegade always quotes "base/quote" with USDC fixed as quote. The helper
   * determines which leg is base, produces the canonical pair identifier, and
   * returns the order book alongside a flag describing the src leg.
   */
  private resolvePair(
    srcToken: Token,
    destToken: Token,
  ): RenegadePairContext | null {
    if (srcToken.address.toLowerCase() === destToken.address.toLowerCase()) {
      return null;
    }

    const srcIsUSDC = this.isTokenUSDC(srcToken);

    const baseToken = srcIsUSDC ? destToken : srcToken;
    const quoteToken = srcIsUSDC ? srcToken : destToken;

    const pairId = this.getRenegadePairIdentifier(
      baseToken.address,
      quoteToken.address,
    );

    const pairData = this.levels[pairId];
    if (!pairData) {
      return null;
    }

    return {
      pairId,
      baseToken,
      quoteToken,
      pairData,
      srcIsBase: !srcIsUSDC,
    };
  }

  /**
   * Get the price of a pair.
   *
   * Renegade exposes a single midpoint level per pair.
   */
  getPrice(srcToken: Token, destToken: Token): BigNumber {
    const context = this.resolvePair(srcToken, destToken);
    if (!context) {
      throw new Error('No pair found');
    }

    const book = context.srcIsBase
      ? context.pairData.bids
      : context.pairData.asks;

    if (!book.length) {
      throw new Error('No price level found');
    }

    if (!book[0]) {
      throw new Error('No price level found');
    }

    return new BigNumber(book[0][0]);
  }

  /**
   * Check if a token is USDC.
   *
   * @param token - Token to check
   * @returns true if token is USDC, false otherwise
   */
  private isTokenUSDC(token: Token): boolean {
    if (!this.usdcAddress) {
      return false;
    }
    return token.address.toLowerCase() === this.usdcAddress.toLowerCase();
  }

  /**
   * Generate Renegade pair identifier for API lookup.
   *
   * @param baseMint - Base mint address
   * @param quoteMint - Quote mint address
   * @returns Renegade pair identifier
   */
  private getRenegadePairIdentifier(
    baseMint: string,
    quoteMint: string,
  ): string {
    return `${baseMint.toLowerCase()}/${quoteMint.toLowerCase()}`;
  }

  /**
   * Get the raw levels data.
   */
  getRawData(): { [pairIdentifier: string]: RenegadePairData } {
    return this.levels;
  }

  /**
   * Get all pairs that contain the specified token.
   *
   * @param tokenAddress - Token address to search for
   * @param tokensMap - Token metadata mapping for building Token objects
   * @returns Array of RenegadePairContext objects
   */
  getAllPairsForToken(
    tokenAddress: string,
    tokensMap: Record<string, Token>,
  ): RenegadePairContext[] {
    const normalizedTokenAddress = tokenAddress.toLowerCase();
    const pairs: RenegadePairContext[] = [];

    for (const [pairId, pairData] of Object.entries(this.levels)) {
      const [baseAddress, quoteAddress] = pairId.split('/');

      const isBase = baseAddress.toLowerCase() === normalizedTokenAddress;
      const isQuote = quoteAddress.toLowerCase() === normalizedTokenAddress;

      if (!isBase && !isQuote) continue;

      // Get tokens from map
      const baseToken = tokensMap[baseAddress.toLowerCase()];
      const quoteToken = tokensMap[quoteAddress.toLowerCase()];

      if (!baseToken || !quoteToken) continue;

      pairs.push({
        pairId,
        baseToken,
        quoteToken,
        pairData,
        srcIsBase: isBase,
      });
    }

    return pairs;
  }
}
