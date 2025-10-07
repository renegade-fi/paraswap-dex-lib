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

// Example pair identifier: "0xc3414a7ef14aaaa9c4522dfc00a4e66e74e9c25a/0xdf8d259c04020562717557f2b5a3cf28e92707d1"
// Format: `${baseToken}/${quoteToken}` where USDC is always the quote token

// Configuration for RateFetcher
export type RenegadeRateFetcherConfig = {
  apiKey: string;
  apiSecret: string;
  levelsCacheKey: string;
  levelsCacheTTL: number;
  tokenMetadataCacheKey: string;
  tokenMetadataCacheTTL: number;
};

// Minimal token metadata for getTopPoolsForToken (YAGNI)
export type RenegadeTokenMetadata = {
  address: string;
  decimals: number;
  ticker: string;
};

// Full token metadata structure from Renegade token mappings
export type RenegadeTokenInfo = {
  name: string;
  ticker: string;
  address: string;
  decimals: number;
  supported_exchanges: Record<string, string>;
  canonical_exchange: string;
};

// Token remap structure from Renegade API
export type RenegadeTokenRemap = {
  tokens: RenegadeTokenInfo[];
};

export type RenegadeSettlementTx = {
  to?: string;
  data?: string;
  value?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
  chainId?: string;
  type?: string;
};

export type RenegadeMatchBundle = {
  settlement_tx: RenegadeSettlementTx;
  match_result?: {
    quote_mint: string;
    base_mint: string;
    quote_amount: string;
    base_amount: string;
    direction: 'Buy' | 'Sell';
  };
};

export type RenegadeMatchResponse = {
  match_bundle: RenegadeMatchBundle;
  is_sponsored?: boolean;
};

// Data structure for DEX methods
export type RenegadeData = {
  settlementTx?: RenegadeSettlementTx;
  rawResponse?: RenegadeMatchResponse;
};

// Configuration parameters for Renegade DEX per network
export type DexParams = {
  usdcAddress: string;
  chainName: string;
  settlementAddress: string;
};
