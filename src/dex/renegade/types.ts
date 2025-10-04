/**
 * Type definitions for Renegade DEX integration
 */

// Price level format from Renegade API
export type RenegadePriceLevel = [price: string, size: string];

// Pair data structure from Renegade API
export type RenegadePairData = {
  bids: RenegadePriceLevel[];
  asks: RenegadePriceLevel[];
};

// Response format from /rfqt/v3/levels endpoint
export type RenegadeLevelsResponse = {
  [pairIdentifier: string]: RenegadePairData;
};

// Example pair identifier: "0xc3414a7ef14aaaa9c4522dfc00a4e66e74e9c25a/0xdf8d259c04020562717557f2b5a3cf28e92707d1"
// Format: `${baseToken}/${quoteToken}` where USDC is always the quote token

// Configuration for RateFetcher
export type RenegadeRateFetcherConfig = {
  apiKey: string;
  apiSecret: string;
  // TODO: Add caching config later
  // cacheConfig?: {
  //   levelsCacheKey: string;
  //   levelsCacheTTL: number;
  //   pollingInterval: number;
  // };
};

// Data structure for DEX methods
export type RenegadeData = {};

// Configuration parameters for Renegade DEX per network
export type DexParams = {
  usdcAddress: string;
  chainName: string;
};
