# IDex Interface Dependency Graph for Renegade DEX Integration

This document outlines the required methods and fields that must be implemented in the Renegade DEX integration to satisfy the `IDex<RenegadeData>` interface.

## 📊 Current Implementation Status

### ✅ Completed (3/6 Critical Methods)

- **`getPoolIdentifiers()`** - Fully implemented with USDC validation and ParaSwap standard compliance
- **`getPricesVolume()`** - Fully implemented with order book pricing, partial fill handling, and USDC/side validation
- **`getTopPoolsForToken()`** - Fully implemented with liquidity calculation, connector token identification, and USD sorting

### 🚧 In Progress (0/6 Critical Methods)

- None currently in progress

### ❌ Pending (3/6 Critical Methods)

- **`getCalldataGasCost()`** - Gas estimation
- **`getAdapters()`** - Adapter configuration
- **`getAdapterParam()`** - V5 transaction encoding

### 📈 Progress: 50.0% Complete (3/6 critical methods)

## Interface Overview

The `IDex` interface combines three main interfaces:

- `IDexTxBuilder` - Transaction building methods
- `IDexPricing` - Price discovery and pool management
- `IDexPooltracker` - Pool tracking and liquidity information

## Required Fields (Readonly Properties)

### Core DEX Properties

```typescript
readonly dexKey: string;                    // ✅ Already implemented
readonly hasConstantPriceLargeAmounts: boolean;  // ✅ Already implemented (false)
readonly isFeeOnTransferSupported: boolean;      // ✅ Already implemented (false)
readonly cacheStateKey: string;             // ✅ Inherited from SimpleExchange
readonly isStatePollingDex?: boolean;       // ✅ Already implemented (true)
```

### Transaction Builder Properties

```typescript
readonly needWrapNative: boolean | NeedWrapNativeFunc;  // ✅ Already implemented (false)
readonly needsSequentialPreprocessing?: boolean;        // ❌ Not implemented (optional)
```

## Required Methods

### 1. IDexPricing Methods (Core Pricing Logic)

#### `getPoolIdentifiers()` - **CRITICAL**

```typescript
getPoolIdentifiers(
  srcToken: Token,
  destToken: Token,
  side: SwapSide,
  blockNumber: number,
): Promise<string[]>
```

- **Status**: ✅ **IMPLEMENTED** - Fully functional with USDC validation
- **Purpose**: Returns list of pool identifiers for a given token pair
- **Implementation Details**:
  - ✅ USDC token validation (exactly one token must be USDC)
  - ✅ Pair existence checking via Renegade API levels
  - ✅ ParaSwap-compatible pool identifier generation
  - ✅ Alphabetical token sorting following ParaSwap standard
  - ✅ Error handling and logging
- **Dependencies**:
  - ✅ RateFetcher for API calls
  - ✅ USDC_ADDRESSES constants
  - ✅ Helper methods for identifier generation

#### `getPricesVolume()` - **CRITICAL**

```typescript
getPricesVolume(
  srcToken: Token,
  destToken: Token,
  amounts: bigint[],
  side: SwapSide,
  blockNumber: number,
  limitPools?: string[],
  transferFees?: TransferFeeParams,
  isFirstSwap?: boolean,
): Promise<ExchangePrices<RenegadeData> | null>
```

- **Status**: ✅ **IMPLEMENTED** - Fully functional with comprehensive pricing logic
- **Purpose**: Returns pool prices for given amounts
- **Implementation Details**:
  - ✅ Input validation (same tokens, empty amounts, non-positive amounts)
  - ✅ USDC/side parameter alignment validation with conflict detection
  - ✅ Pool identifier resolution (reuses `getPoolIdentifiers()`)
  - ✅ Order book level fetching via `RateFetcher`
  - ✅ Bidirectional pair data lookup (src/dest and dest/src)
  - ✅ Price level selection based on swap side (bids for SELL, asks for BUY)
  - ✅ Single-level pricing calculation with partial fill support
  - ✅ Decimal handling for different token types (USDC=6, WETH=18)
  - ✅ Comprehensive error handling and logging
- **Dependencies**:
  - ✅ `getPoolIdentifiers()` - Pool discovery
  - ✅ `RateFetcher.fetchLevels()` - API integration
  - ✅ Price calculation helpers
  - ✅ USDC validation and side alignment logic

#### `getCalldataGasCost()` - **CRITICAL**

```typescript
getCalldataGasCost(poolPrices: PoolPrices<RenegadeData>): number | number[]
```

- **Status**: ❌ Not implemented (throws error)
- **Purpose**: Returns estimated gas cost for calldata
- **Dependencies**:
  - Transaction structure analysis
  - Gas cost constants

#### `getAdapters()` - **CRITICAL**

```typescript
getAdapters(side: SwapSide): { name: string; index: number }[] | null
```

- **Status**: ❌ Not implemented (throws error)
- **Purpose**: Returns contract adapters for buy/sell operations
- **Dependencies**:
  - Network-specific adapter configuration

### 2. IDexTxBuilder Methods (Transaction Building)

#### `getAdapterParam()` - **CRITICAL**

```typescript
getAdapterParam(
  srcToken: Address,
  destToken: Address,
  srcAmount: NumberAsString,
  destAmount: NumberAsString,
  data: RenegadeData,
  side: SwapSide,
): AdapterExchangeParam
```

- **Status**: ❌ Not implemented (throws error)
- **Purpose**: Encodes params for exchange adapter (V5 multiSwap, buy, megaSwap)
- **Dependencies**:
  - `RenegadeData` type definition
  - Transaction encoding logic
  - Network fee calculation

#### `getSimpleParam()` - **OPTIONAL**

```typescript
getSimpleParam?(
  srcToken: Address,
  destToken: Address,
  srcAmount: NumberAsString,
  destAmount: NumberAsString,
  data: RenegadeData,
  side: SwapSide,
): AsyncOrSync<SimpleExchangeParam>
```

- **Status**: ❌ Not implemented
- **Purpose**: Encodes call data for simpleSwap routers (V5)
- **Dependencies**:
  - `buildSimpleParamWithoutWETHConversion()` (inherited from SimpleExchange)

#### `getDexParam()` - **OPTIONAL**

```typescript
getDexParam?(
  srcToken: Address,
  destToken: Address,
  srcAmount: NumberAsString,
  destAmount: NumberAsString,
  recipient: Address,
  data: RenegadeData,
  side: SwapSide,
  context: Context,
  executorAddress: Address,
): AsyncOrSync<DexExchangeParam>
```

- **Status**: ❌ Not implemented
- **Purpose**: Returns params for generic method (V6)
- **Dependencies**:
  - V6 transaction structure
  - Executor integration

### 3. IDexPooltracker Methods (Pool Management)

#### `getTopPoolsForToken()` - **CRITICAL**

```typescript
getTopPoolsForToken(
  tokenAddress: Address,
  limit: number,
): AsyncOrSync<PoolLiquidity[]>
```

- **Status**: ✅ **IMPLEMENTED** - Fully functional with comprehensive pool tracking
- **Purpose**: Returns top pools by liquidity for a token
- **Implementation Details**:
  - ✅ Fetches cached levels from Renegade API via `RateFetcher`
  - ✅ Iterates through all available pairs to find token matches
  - ✅ Identifies connector tokens (the "other" token in each pair)
  - ✅ Calculates USD liquidity from order book levels (price × size)
  - ✅ Sorts pools by USD liquidity in descending order
  - ✅ Limits results to requested number of pools
  - ✅ Comprehensive error handling and logging
- **Dependencies**:
  - ✅ `RateFetcher.fetchLevels()` - API integration
  - ✅ `getTokenFromAddress()` - Token metadata helper
  - ✅ `calculateLiquidityUSD()` - Liquidity calculation
  - ✅ `getRenegadeContractAddress()` - Contract address resolution

### 4. Optional Methods (Recommended for RFQ DEXes)

#### `preProcessTransaction()` - **HIGHLY RECOMMENDED**

```typescript
preProcessTransaction?(
  optimalSwapExchange: OptimalSwapExchange<RenegadeData>,
  srcToken: Token,
  destToken: Token,
  side: SwapSide,
  options: PreprocessTransactionOptions,
): AsyncOrSync<[OptimalSwapExchange<RenegadeData>, ExchangeTxInfo]>
```

- **Status**: ❌ Not implemented
- **Purpose**: Called before getAdapterParam for async data fetching
- **Dependencies**:
  - RFQ quote fetching
  - Slippage validation
  - Deadline management

#### `initializePricing()` - **RECOMMENDED**

```typescript
initializePricing?(blockNumber: number): AsyncOrSync<void>
```

- **Status**: ❌ Not implemented
- **Purpose**: Initialize pricing service
- **Dependencies**:
  - Rate fetcher setup
  - Cache initialization
  - WebSocket connections

#### `releaseResources()` - **RECOMMENDED**

```typescript
releaseResources?(): AsyncOrSync<void>
```

- **Status**: ❌ Not implemented
- **Purpose**: Clean up timers and resources
- **Dependencies**:
  - Rate fetcher cleanup
  - WebSocket disconnection

#### `getTokenFromAddress()` - **HELPER**

```typescript
getTokenFromAddress?(address: Address): Token
```

- **Status**: ✅ **IMPLEMENTED** - Fully functional with hardcoded token metadata
- **Purpose**: Helper for testing preProcessTransaction and connector token identification
- **Implementation Details**:
  - ✅ Hardcoded token decimals for common tokens (USDC, WETH)
  - ✅ Network-specific token address mapping
  - ✅ Default to 18 decimals for unknown tokens
  - ✅ Comprehensive error handling with fallback
- **Dependencies**:
  - ✅ Common token address constants
  - ✅ Network-specific token mapping

## Implementation Priority

### Phase 1: Core Functionality (Critical)

1. ✅ **Define RenegadeData type** - Required for all transaction methods
2. ✅ **Implement getPoolIdentifiers()** - Foundation for pricing
3. ✅ **Implement getPricesVolume()** - Core pricing logic
4. ✅ **Implement getTopPoolsForToken()** - Pool tracking and liquidity information
5. **Implement getCalldataGasCost()** - Gas estimation
6. **Implement getAdapters()** - Adapter configuration

### Phase 2: Transaction Building (Critical)

1. **Implement getAdapterParam()** - V5 transaction support
2. **Implement getSimpleParam()** - Simple swap support
3. **Implement getDexParam()** - V6 transaction support

### Phase 3: RFQ Integration (Recommended)

1. **Implement preProcessTransaction()** - Quote fetching
2. **Implement initializePricing()** - Service initialization
3. **Implement releaseResources()** - Cleanup
4. ✅ **Implement getTokenFromAddress()** - Helper method

## Dependencies Between Methods

### Core Pricing Flow

```
initializePricing()
    ↓
getPoolIdentifiers() → getPricesVolume() → getCalldataGasCost()
    ↓                        ↓
getTopPoolsForToken()    preProcessTransaction()
    ↓                        ↓
Token Metadata         getAdapterParam()
                            ↓
                    getSimpleParam() / getDexParam()
```

### Data Dependencies

```
RenegadeData Type Definition
    ↓
preProcessTransaction() → getAdapterParam()
    ↓                        ↓
Quote Data              Transaction Encoding
    ↓                        ↓
Slippage Validation     Gas Cost Calculation
```

### Infrastructure Dependencies

```
Rate Fetcher → Price Data → getPricesVolume()
    ↓              ↓
WebSocket      Cache Layer
    ↓              ↓
initializePricing() → releaseResources()
```

### Implementation Hierarchy

```
Level 1 (Foundation):
├── RenegadeData type definition
├── Basic configuration (RenegadeConfig)
└── Core interfaces

Level 2 (Core Pricing):
├── getPoolIdentifiers()
├── getPricesVolume()
├── getCalldataGasCost()
└── getAdapters()

Level 3 (Transaction Building):
├── getAdapterParam()
├── getSimpleParam()
└── getDexParam()

Level 4 (Advanced Features):
├── preProcessTransaction()
├── initializePricing()
├── releaseResources()
└── getTopPoolsForToken()

Level 5 (Helper Methods):
├── getTokenFromAddress()
├── Error handling
└── Rate limiting
```

## Configuration Requirements

### RenegadeConfig Updates Needed

```typescript
export interface RenegadeParams {
  // API Configuration
  apiUrl: string;
  authToken: string;

  // Contract Addresses
  routerAddress: string;
  settlementAddress?: string;

  // Network-specific settings
  chainId: number;
  wrappedNativeToken: string;

  // Rate limiting
  rateLimitRpm?: number;
  rateLimitBurst?: number;
}
```

### Required Constants

- API endpoints
- Gas cost constants
- Cache TTL values
- Rate limiting thresholds
- Error codes

## Testing Requirements

Each implemented method should have:

- Unit tests for core logic
- Integration tests with mock data
- Error handling tests
- Edge case coverage

## Implementation Checklist

### ✅ Already Implemented

- [x] Basic class structure extending SimpleExchange
- [x] Core readonly properties (isStatePollingDex, hasConstantPriceLargeAmounts, etc.)
- [x] Static dexKeysWithNetwork configuration
- [x] Constructor with network, dexKey, and dexHelper
- [x] RateFetcher initialization with API credentials
- [x] `getPoolIdentifiers()` - Pool discovery with USDC validation
- [x] `getPricesVolume()` - Complete pricing logic with order book integration
- [x] `getTopPoolsForToken()` - Pool tracking with liquidity calculation and connector token identification
- [x] `getTokenFromAddress()` - Token metadata helper with hardcoded common tokens
- [x] Helper methods for pool identifier generation
- [x] `_sortTokens()` helper method following ParaSwap standard
- [x] USDC address validation and pair existence checking
- [x] Price calculation helpers with decimal handling
- [x] Partial fill support for liquidity constraints
- [x] USDC/side parameter alignment validation
- [x] Bidirectional pair data lookup
- [x] Liquidity calculation from order book levels (price × size)
- [x] Connector token identification for multi-hop routing
- [x] Pool sorting by USD liquidity in descending order
- [x] Comprehensive error handling and logging

### ❌ Critical Methods (Must Implement)

- [ ] `getCalldataGasCost()` - Gas estimation
- [ ] `getAdapters()` - Adapter configuration
- [ ] `getAdapterParam()` - V5 transaction encoding

## ✅ Completed Implementation: `getPoolIdentifiers()` Method

### Implementation Status: **COMPLETE**

The `getPoolIdentifiers()` method has been successfully implemented with all required functionality:

#### ✅ Implemented Features

1. **USDC Token Validation**

   - ✅ Validates exactly one token is USDC (Renegade requirement)
   - ✅ Uses `USDC_ADDRESSES` constants for network-specific USDC addresses
   - ✅ Returns empty array if neither or both tokens are USDC

2. **Pair Existence Checking**

   - ✅ Fetches levels from Renegade API via `RateFetcher`
   - ✅ Checks both directions (`tokenA/tokenB` and `tokenB/tokenA`)
   - ✅ Returns empty array if pair doesn't exist in levels

3. **ParaSwap Standard Compliance**

   - ✅ Uses `_sortTokens()` helper method for alphabetical sorting
   - ✅ Generates ParaSwap-compatible pool identifiers
   - ✅ Format: `${dexKey}_${sortedTokenA}_${sortedTokenB}`

4. **Error Handling**

   - ✅ Comprehensive try-catch error handling
   - ✅ Proper logging for debugging and monitoring
   - ✅ Graceful fallback to empty array on errors

5. **Helper Methods**
   - ✅ `getRenegadePairIdentifier()` - For API calls
   - ✅ `getPoolIdentifier()` - For ParaSwap format
   - ✅ `_sortTokens()` - Following ParaSwap standard pattern

#### Key Design Decisions Implemented

1. **USDC-Only Trading**: Only returns pools where exactly one token is USDC
2. **ParaSwap Standard Compliance**: Alphabetical sorting of token addresses
3. **Pair Existence Validation**: Checks Renegade API levels for pair availability
4. **API Integration**: Uses Renegade format for API calls, ParaSwap format for returns

## ✅ Completed Implementation: `getPricesVolume()` Method

### Implementation Status: **COMPLETE**

The `getPricesVolume()` method has been successfully implemented with comprehensive pricing functionality:

#### ✅ Implemented Features

1. **Input Validation**

   - ✅ Same token address detection
   - ✅ Empty amounts array validation
   - ✅ Non-positive amounts validation
   - ✅ Comprehensive logging for debugging

2. **USDC/Side Parameter Alignment**

   - ✅ Validates USDC direction matches ParaSwap side parameter
   - ✅ Conflict detection with detailed error messages
   - ✅ Prevents incorrect pricing in ambiguous scenarios
   - ✅ Uses Renegade's USDC-centric logic (sending USDC = BUY, receiving USDC = SELL)

3. **Pool Resolution**

   - ✅ Reuses `getPoolIdentifiers()` for pool discovery
   - ✅ Supports `limitPools` parameter for specific pool targeting
   - ✅ Handles empty pool scenarios gracefully

4. **Order Book Integration**

   - ✅ Fetches real-time levels via `RateFetcher.fetchLevels()`
   - ✅ Bidirectional pair data lookup (src/dest and dest/src)
   - ✅ Validates pair data structure (bids/asks arrays)
   - ✅ Handles API failures gracefully

5. **Price Level Selection**

   - ✅ SELL orders use bids (selling to the bid)
   - ✅ BUY orders use asks (buying from the ask)
   - ✅ Single price level per pair (midpoint crossing)
   - ✅ Price level validation (structure and positive values)

6. **Price Calculation**

   - ✅ Single-level pricing with partial fill support
   - ✅ Decimal handling for different token types (USDC=6, WETH=18)
   - ✅ Amount conversion between token units and smallest units
   - ✅ Liquidity constraint handling (returns max available when input > size)

7. **Error Handling**
   - ✅ Comprehensive try-catch error handling
   - ✅ Detailed logging for debugging and monitoring
   - ✅ Graceful fallback to null on errors
   - ✅ Input validation with early returns

#### Key Design Decisions Implemented

1. **Single Price Level Model**: Uses one price level per pair (midpoint crossing) rather than complex order book traversal
2. **Partial Fill Support**: Returns maximum available liquidity when input amount exceeds available size
3. **USDC-Centric Logic**: Validates that USDC direction aligns with ParaSwap side parameter
4. **Bidirectional Lookup**: Checks both src/dest and dest/src directions for pair data
5. **Decimal Precision**: Proper handling of different token decimals (USDC=6, WETH=18)

## ✅ Completed Implementation: `getTopPoolsForToken()` Method

### Implementation Status: **COMPLETE**

The `getTopPoolsForToken()` method has been successfully implemented with comprehensive pool tracking functionality:

#### ✅ Implemented Features

1. **Pool Discovery**

   - ✅ Fetches cached levels from Renegade API via `RateFetcher`
   - ✅ Iterates through all available pairs to find token matches
   - ✅ Handles empty levels gracefully with proper logging

2. **Connector Token Identification**

   - ✅ Identifies the "other" token in each pair (connector token)
   - ✅ Uses `getTokenFromAddress()` for token metadata
   - ✅ Supports multi-hop routing by providing connector tokens

3. **Liquidity Calculation**

   - ✅ Calculates USD liquidity from order book levels (price × size)
   - ✅ Uses direct USD calculation (price already in USD/base, size in base units)
   - ✅ Sums liquidity across all available levels
   - ✅ Filters out pools with zero or negative liquidity

4. **Pool Sorting and Limiting**

   - ✅ Sorts pools by USD liquidity in descending order
   - ✅ Limits results to requested number of pools
   - ✅ Returns empty array when no pools found

5. **Error Handling**
   - ✅ Comprehensive try-catch error handling
   - ✅ Detailed logging for debugging and monitoring
   - ✅ Graceful fallback to empty array on errors

#### Key Design Decisions Implemented

1. **USDC-Centric Model**: Only returns pools where exactly one token is USDC (Renegade requirement)
2. **Direct USD Calculation**: Uses `price × size` directly since price is already in USD/base
3. **Connector Token Support**: Provides connector tokens for multi-hop routing
4. **Liquidity-Based Ranking**: Sorts pools by actual USD liquidity for optimal routing

#### Next Priority: `getCalldataGasCost()` Implementation

With `getTopPoolsForToken()` complete, the next critical method to implement is `getCalldataGasCost()`, which will:

- Return gas cost estimation for Renegade transactions
- Use the `RENEGADE_GAS_COST` constant (150,000 gas)
- Support both single number and array return types

### 🔄 Optional Methods (Recommended)

- [ ] `preProcessTransaction()` - RFQ quote fetching
- [ ] `initializePricing()` - Service initialization
- [ ] `releaseResources()` - Cleanup
- [ ] `getSimpleParam()` - Simple swap support
- [ ] `getDexParam()` - V6 transaction support
- [ ] `getTokenFromAddress()` - Helper method

### 📋 Supporting Infrastructure Needed

- [ ] RenegadeData type definition
- [ ] Rate fetcher implementation
- [ ] API client for Renegade
- [ ] Cache management
- [ ] Error handling patterns
- [ ] Configuration updates

## Next Steps

### Immediate Priority (Phase 1 Completion)

1. ✅ **Define RenegadeData type** in `types.ts` - **COMPLETED**
2. ✅ **Update RenegadeConfig** with API endpoints and contract addresses - **COMPLETED**
3. ✅ **Implement `getPoolIdentifiers()`** - **COMPLETED**
4. ✅ **Add rate fetcher** for real-time price data - **COMPLETED**
5. ✅ **Implement `getPricesVolume()`** - **COMPLETED**

### Next Critical Implementation (Phase 1 Continuation)

6. **Implement `getCalldataGasCost()`** - Gas estimation for transactions
7. **Implement `getAdapters()`** - Adapter configuration for V5/V6

### Future Implementation (Phase 2)

8. **Implement transaction building methods** (`getAdapterParam`, `getSimpleParam`, `getDexParam`)
9. **Add comprehensive error handling** and logging improvements
10. **Write unit and integration tests**

## Notes

- All methods marked as "throws error" need complete implementation
- RFQ DEXes typically require `preProcessTransaction()` for quote fetching
- State polling DEXes need `initializePricing()` and `releaseResources()`
- Consider implementing rate limiting and error handling patterns from other RFQ DEXes (Bebop, Hashflow, SwaapV2)
- Follow the implementation patterns from existing DEX integrations for consistency
