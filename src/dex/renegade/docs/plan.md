# Renegade DEX Integration Plan

## Overview

This document outlines the implementation plan for integrating Renegade DEX into the ParaSwap ecosystem. The integration follows established patterns from other RFQ-based DEXes like Bebop, SwaapV2, Hashflow, and Dexalot.

## Core Architecture

### 1. Rate Fetcher Pattern (Simplified - No Caching Initially)

Following the established pattern from other RFQ DEXes, we need to implement a `RateFetcher` class that:

- Makes direct API calls to Renegade's `/rfqt/v3/levels` endpoint
- **TODO: Add caching later** - Bypass cache for now for faster development
- Handles authentication and rate limiting
- **TODO: Add WebSocket support later** if available

### 2. Data Flow (Simplified)

```
Renegade API (/rfqt/v3/levels)
    ↓
RateFetcher (direct API calls)
    ↓
Renegade.getPoolIdentifiers() (checks API response directly)
    ↓
Router (compares across DEXes)
```

## Implementation Phases

### Phase 1: Foundation Setup ✅

- [x] Basic DEX class structure
- [x] Configuration setup
- [x] Type definitions
- [x] Pool identifier helper methods

### Phase 2: Rate Fetcher Implementation 🔄

**Priority: HIGH - This is the core of all pricing functionality**

#### 2.1 Create RateFetcher Class (Simplified - No Caching)

**File:** `src/dex/renegade/rate-fetcher.ts`

Based on existing patterns from:

- `src/dex/bebop/rate-fetcher.ts`
- `src/dex/swaap-v2/rate-fetcher.ts`
- `src/dex/hashflow/rate-fetcher.ts`
- `src/dex/dexalot/rate-fetcher.ts`

**Key Components (Simplified):**

```typescript
export class RateFetcher {
  private authToken: string;
  private apiUrl: string;

  // TODO: Add caching later - levelsCacheKey, levelsCacheTTL, pollingInterval

  // Direct API calls (no polling initially)
  async fetchLevels(): Promise<RenegadeLevelsResponse>;

  // TODO: Add polling later - start(), stop()
  // TODO: Add caching later - getCachedLevels(), cacheLevels()
}
```

#### 2.2 API Integration

**Endpoint:** `GET /rfqt/v3/levels`

**Response Format:**

```typescript
type RenegadeLevelsResponse = {
  [pairIdentifier: string]: {
    bids: [string, string][]; // [price, size]
    asks: [string, string][]; // [price, size]
  };
};

// Example pair identifier: "0xc3414a7ef14aaaa9c4522dfc00a4e66e74e9c25a/0xdf8d259c04020562717557f2b5a3cf28e92707d1"
```

**Authentication:**

- Add `renegadeAuthToken` to config
- Include in request headers: `Authorization: Bearer ${token}`

**Caching Strategy (TODO - Bypass for now):**

- **TODO: Local Cache TTL:** 30 seconds (fast access)
- **TODO: Redis Cache TTL:** 60 seconds (persistence)
- **TODO: Polling Interval:** 15 seconds (fresh data)
- **Current:** Direct API calls without caching

#### 2.3 Constants and Configuration ✅

**File:** `src/dex/renegade/constants.ts`

```typescript
// Chain-specific URL building
export const RENEGADE_API_URL_TEMPLATE =
  'https://{network}.auth-server.renegade.fi';
export const RENEGADE_LEVELS_ENDPOINT = '/rfqt/v3/levels';

// Network mapping for chain-specific subdomains
export const RENEGADE_NETWORK_MAPPING = {
  [Network.ARBITRUM]: 'arbitrum-one',
  [Network.BASE]: 'base-mainnet',
  // TODO: Add testnet mappings when needed
};

// Helper function to build network-specific URLs
export function buildRenegadeApiUrl(network: Network): string {
  const renegadeNetwork = RENEGADE_NETWORK_MAPPING[network];
  if (!renegadeNetwork) {
    throw new Error(`Network ${network} is not supported by Renegade`);
  }
  return RENEGADE_API_URL_TEMPLATE.replace('{network}', renegadeNetwork);
}

// TODO: Add caching constants later
// export const RENEGADE_LEVELS_CACHE_TTL = 30; // seconds
// export const RENEGADE_LEVELS_POLLING_INTERVAL = 15000; // milliseconds
// export const RENEGADE_LEVELS_CACHE_KEY = 'renegade_levels';
```

### Phase 3: Core DEX Methods Implementation

#### 3.1 Update getPoolIdentifiers()

**Current Status:** Throws "not implemented" error
**Dependencies:** RateFetcher, cached levels data

**Implementation Logic (Simplified - Direct API calls):**

```typescript
async getPoolIdentifiers(srcToken: Token, destToken: Token, side: SwapSide, blockNumber: number): Promise<string[]> {
  // 1. Get levels directly from API (TODO: Add caching later)
  const levels = await this.rateFetcher.fetchLevels();
  if (!levels) return [];

  // 2. Try both directions (USDC is always quote in Renegade)
  const pairId1 = this.getRenegadePairIdentifier(srcToken.address, destToken.address);
  const pairId2 = this.getRenegadePairIdentifier(destToken.address, srcToken.address);

  // 3. Check if either pair exists and has liquidity
  const pairData = levels[pairId1] || levels[pairId2];
  if (!pairData || !pairData.bids?.length || !pairData.asks?.length) {
    return [];
  }

  // 4. Return ParaSwap-compatible pool identifier
  const baseToken = levels[pairId1] ? srcToken.address : destToken.address;
  const quoteToken = levels[pairId1] ? destToken.address : srcToken.address;

  return [this.getPoolIdentifier(baseToken, quoteToken)];
}
```

#### 3.2 Implement getPricesVolume()

**Dependencies:** RateFetcher, levels data, price calculation logic

**Key Components:**

- Fetch levels directly from API (TODO: Add caching later)
- Calculate prices from bids/asks
- Handle single price level per pair (Renegade characteristic)
- Return ExchangePrices format

#### 3.3 Implement preProcessTransaction()

**Dependencies:** RFQ quote endpoint, transaction building

**Key Components:**

- Call Renegade's quote endpoint
- Validate slippage
- Build transaction data
- Handle errors and restrictions

### Phase 4: Supporting Infrastructure

#### 4.1 Configuration Updates

**File:** `src/dex/renegade/config.ts`

Add:

- API base URL
- Authentication token
- Cache TTLs
- Polling intervals
- Network-specific settings

#### 4.2 Type Definitions

**File:** `src/dex/renegade/types.ts`

```typescript
export type RenegadeLevelsResponse = {
  [pairIdentifier: string]: {
    bids: [string, string][];
    asks: [string, string][];
  };
};

export type RenegadeData = {
  // Quote data from preProcessTransaction
  quoteData?: any;
  // Transaction data
  txData?: any;
};

export type RenegadePairData = {
  baseToken: string;
  quoteToken: string;
  bids: [string, string][];
  asks: [string, string][];
};
```

#### 4.3 Error Handling and Restrictions

Following patterns from other RFQ DEXes:

- Blacklist management for restricted users
- Pool restriction for failed pairs
- Rate limiting handling
- Slippage validation

### Phase 5: Testing and Integration

#### 5.1 Unit Tests

- RateFetcher functionality
- Pool identifier generation
- Price calculation logic
- Error handling

#### 5.2 Integration Tests

- End-to-end pricing flow
- Transaction building
- Error scenarios
- Performance testing

#### 5.3 Configuration Testing

- Different network configurations
- Authentication token validation
- Cache behavior verification

## Implementation Order

1. **RateFetcher** (Critical path - blocks everything else)
2. **getPoolIdentifiers()** (Required for routing)
3. **getPricesVolume()** (Core pricing functionality)
4. **preProcessTransaction()** (Transaction execution)
5. **Supporting methods** (getAdapters, getCalldataGasCost, etc.)
6. **Testing and validation**

## Key Design Decisions

### 1. Single Price Level Per Pair

Renegade's characteristic of having only one price level per pair (midpoint pricing) simplifies our price calculation logic compared to traditional order book DEXes.

### 2. USDC Always Quote

Renegade's stable pair format where USDC is always the quote token affects how we:

- Generate pair identifiers
- Map ParaSwap token pairs to Renegade pairs
- Handle pair direction detection

### 3. Caching Strategy (TODO - Bypass for now)

Following established patterns:

- **TODO: Local cache for fast access (30s TTL)**
- **TODO: Redis cache for persistence (60s TTL)**
- **TODO: Aggressive polling (15s interval) for fresh data**
- **Current: Direct API calls without caching for faster development**

### 4. Error Handling

Following RFQ DEX patterns:

- Graceful degradation when API is unavailable
- Pool restriction for consistently failing pairs
- User blacklisting for restricted accounts

## Dependencies

### External Dependencies

- Renegade API access and authentication
- Redis for caching
- Network configuration for supported chains

### Internal Dependencies

- IDexHelper for caching and HTTP requests
- SimpleExchange base class
- ParaSwap type definitions
- Existing utility functions

## Success Criteria

1. **Functional Requirements**

   - Successfully fetch and cache price levels
   - Generate accurate pool identifiers
   - Provide competitive pricing
   - Handle transaction execution

2. **Performance Requirements**

   - Sub-second response times for pool identification
   - **TODO: Fresh price data (within 30 seconds) - Currently direct API calls**
   - Minimal API rate limit violations

3. **Reliability Requirements**
   - Graceful handling of API failures
   - Proper error reporting and logging
   - Consistent behavior across network conditions

## Next Steps

1. **Immediate:** Implement simplified RateFetcher class with direct API calls (no caching)
2. **Short-term:** Update getPoolIdentifiers() to use direct API response
3. **Medium-term:** Implement full pricing and transaction functionality
4. **Long-term:** Add caching, polling, and advanced features like pool restriction and user blacklisting
