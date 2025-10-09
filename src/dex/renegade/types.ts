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

// Data structure for DEX methods
export type RenegadeData = {
  settlementTx?: TransactionRequest;
  rawResponse?: SponsoredMatchResponse;
};

// Configuration parameters for Renegade DEX per network
export type DexParams = {
  usdcAddress: string;
  chainName: string;
  settlementAddress: string;
};

// ============================================================================
// Quote and Assemble Endpoint Types (from OpenAPI spec)
// ============================================================================

/**
 * Represents a token transfer with mint address and amount
 */
export type ApiExternalAssetTransfer = {
  mint: string;
  amount: string;
};

/**
 * Match result with quote/base mints, amounts, and direction
 */
export type ApiExternalMatchResult = {
  quote_mint: string;
  base_mint: string;
  quote_amount: string;
  base_amount: string;
  direction: 'Buy' | 'Sell';
};

/**
 * Price with timestamp
 */
export type ApiTimestampedPrice = {
  price: string;
  timestamp: number;
};

/**
 * Relayer and protocol fees
 */
export type FeeTake = {
  relayer_fee: string;
  protocol_fee: string;
};

/**
 * External order structure for Renegade match requests
 */
export type ExternalOrder = {
  quote_mint: string;
  base_mint: string;
  side: 'Buy' | 'Sell';
  base_amount: string;
  quote_amount: string;
  exact_base_output: string;
  exact_quote_output: string;
  min_fill_size: string;
};

/**
 * Complete quote structure with order, match result, fees, and pricing
 */
export type ApiExternalQuote = {
  order: ExternalOrder;
  match_result: ApiExternalMatchResult;
  fees: FeeTake;
  send: ApiExternalAssetTransfer;
  receive: ApiExternalAssetTransfer;
  price: ApiTimestampedPrice;
  timestamp: number;
};

/**
 * Quote with signature binding it to the relayer
 */
export type SignedExternalQuote = {
  quote: ApiExternalQuote;
  signature: string;
};

/**
 * Gas refund details
 */
export type GasSponsorshipInfo = {
  refund_amount: string;
  refund_native_eth: boolean;
  refund_address: string | null;
};

/**
 * Signed gas sponsorship info (deprecated signature field)
 */
export type SignedGasSponsorshipInfo = {
  gas_sponsorship_info: GasSponsorshipInfo;
  signature: string; // deprecated
};

/**
 * Ethereum transaction request (alloy-compatible)
 */
export type TransactionRequest = {
  from?: string | null;
  to?: string | null;
  gas_price?: string | null;
  max_fee_per_gas?: string | null;
  max_priority_fee_per_gas?: string | null;
  max_fee_per_blob_gas?: string | null;
  gas?: string | null;
  value?: string | null;
  data?: string | null;
  input?: string | null;
  nonce?: string | null;
  chain_id?: string | null;
  access_list?: any[] | null;
  type?: string | null;
  blob_versioned_hashes?: string[] | null;
  authorization_list?: any[] | null;
};

/**
 * Complete match bundle with settlement transaction
 */
export type AtomicMatchApiBundle = {
  match_result: ApiExternalMatchResult;
  fees: FeeTake;
  receive: ApiExternalAssetTransfer;
  send: ApiExternalAssetTransfer;
  settlement_tx: TransactionRequest;
};

/**
 * Response from assemble endpoint
 */
export type SponsoredMatchResponse = {
  match_bundle: AtomicMatchApiBundle;
  is_sponsored: boolean;
  gas_sponsorship_info?: GasSponsorshipInfo | null;
};
