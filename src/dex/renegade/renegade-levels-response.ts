import { Response } from '../../dex-helper/irequest-wrapper';
import {
  RenegadePairData,
  RenegadePriceLevel,
  RenegadeTokenMetadata,
} from './types';
import { Token } from '../../types';

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
   * Resolve a ParaSwap (src,dest) pair into Renegade nomenclature.
   *
   * Renegade always quotes "base/quote" with USDC fixed as quote. The helper
   * determines which leg is base, produces the canonical pair identifier, and
   * returns the order book alongside a flag describing the src leg.
   */
  resolvePair(srcToken: Token, destToken: Token): RenegadePairContext | null {
    const srcIsUSDC = this.isTokenUSDC(srcToken);
    const destIsUSDC = this.isTokenUSDC(destToken);

    if (srcIsUSDC === destIsUSDC) {
      return null;
    }

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
   * Renegade exposes a single midpoint level per pair. This method returns the
   * appropriate leg (bids if the caller supplies base, asks if the caller
   * supplies quote) so downstream code can apply ParaSwap's sizing semantics.
   */
  getMidpointLevel(context: RenegadePairContext): RenegadePriceLevel | null {
    const book = context.srcIsBase
      ? context.pairData.bids
      : context.pairData.asks;

    if (!book.length) {
      return null;
    }

    return book[0];
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
   * @param tokenA - First token address
   * @param tokenB - Second token address
   * @returns Renegade pair identifier
   */
  private getRenegadePairIdentifier(tokenA: string, tokenB: string): string {
    return `${tokenA.toLowerCase()}/${tokenB.toLowerCase()}`;
  }

  /**
   * Get all available pair identifiers.
   *
   * @returns Array of all pair identifiers
   */
  getAllPairs(): string[] {
    return Object.keys(this.levels);
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
    tokensMap: Record<string, RenegadeTokenMetadata>,
  ): RenegadePairContext[] {
    const normalizedTokenAddress = tokenAddress.toLowerCase();
    const pairs: RenegadePairContext[] = [];

    for (const [pairId, pairData] of Object.entries(this.levels)) {
      const [baseAddress, quoteAddress] = pairId.split('/');

      const isBase = baseAddress.toLowerCase() === normalizedTokenAddress;
      const isQuote = quoteAddress.toLowerCase() === normalizedTokenAddress;

      if (!isBase && !isQuote) continue;

      // Get token metadata
      const baseMetadata = tokensMap[baseAddress.toLowerCase()];
      const quoteMetadata = tokensMap[quoteAddress.toLowerCase()];

      if (!baseMetadata || !quoteMetadata) continue;

      // Build Token objects
      const baseToken: Token = {
        address: baseMetadata.address,
        decimals: baseMetadata.decimals,
        symbol: baseMetadata.ticker,
      };

      const quoteToken: Token = {
        address: quoteMetadata.address,
        decimals: quoteMetadata.decimals,
        symbol: quoteMetadata.ticker,
      };

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

  /**
   * Get token metadata for a given address.
   *
   * @param address - Token address
   * @param tokensMap - Token metadata mapping
   * @returns Token object or null if not found
   */
  getTokenMetadata(
    address: string,
    tokensMap: Record<string, RenegadeTokenMetadata>,
  ): Token | null {
    const metadata = tokensMap[address.toLowerCase()];
    if (!metadata) return null;

    return {
      address: metadata.address,
      decimals: metadata.decimals,
      symbol: metadata.ticker,
    };
  }
}
