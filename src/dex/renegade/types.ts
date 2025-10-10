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

// Configuration for RateFetcher
export type RenegadeRateFetcherConfig = {
  apiKey: string;
  apiSecret: string;
  levelsCacheKey: string;
  levelsCacheTTL: number;
  tokenMetadataCacheKey: string;
  tokenMetadataCacheTTL: number;
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
  settlementTx?: RenegadeTx;
  rawResponse?: SponsoredMatchResponse;
};

// Configuration parameters for Renegade DEX per network
export type DexParams = {
  usdcAddress: string;
  chainName: string;
  settlementAddress: string;
};

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
 * Renegade transaction data
 */
export type RenegadeTx = {
  to: string;
  data: string;
  value: string;
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

/**
 * Request body for quote endpoint
 */
export type ExternalQuoteRequest = {
  external_order: ExternalOrder;
  matching_pool?: string;
  relayer_fee_rate?: number;
};

/**
 * Response from quote endpoint with signed quote and optional sponsorship
 */
export type SponsoredQuoteResponse = {
  signed_quote: SignedExternalQuote;
  gas_sponsorship_info?: SignedGasSponsorshipInfo | null;
};

/**
 * EIP-1559 / EIP-4844 aware transaction request
 */
export type TransactionRequest = {
  from?: string | null;
  to?: string | null;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  maxFeePerBlobGas?: string;
  gas?: string;
  value?: string;
  input?: string;
  data?: string;
  nonce?: string;
  chainId?: string;
  accessList?: Array<{
    address: string;
    storageKeys: string[];
  }>;
  type?: string;
  blobVersionedHashes?: string[];
  sidecar?: Record<string, any>;
  authorizationList?: Array<Record<string, any>>;
};

/**
 * Request body for assemble external match endpoint
 */
export type AssembleExternalMatchRequest = {
  signed_quote: SignedExternalQuote;
  do_gas_estimation?: boolean;
  allow_shared?: boolean;
  matching_pool?: string;
  relayer_fee_rate?: number;
  receiver_address?: string | null;
  updated_order?: ExternalOrder | null;
};

/**
 * Optional query parameters for quote and assembly endpoints
 */
export type QuoteQueryParams = {
  disable_gas_sponsorship?: boolean;
  refund_address?: string;
  refund_native_eth?: boolean;
  use_gas_sponsorship?: boolean;
};
