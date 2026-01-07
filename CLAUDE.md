# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**ParaSwap DexLib** is a library used by ParaSwap backend to integrate with 90+ decentralized exchanges. It enables DEX developers to integrate their protocols by creating pull requests to this repository.

## Common Commands

### Installation

```bash
yarn install
```

### Building

```bash
yarn build              # Run prettier, eslint, and compile TypeScript
yarn watch              # Watch mode for development
yarn check:tsc          # TypeScript compilation check only
yarn check:es           # ESLint check only
yarn check:pq           # Prettier check only
yarn checks             # Run all checks (prettier, tsc, eslint)
```

### Testing

```bash
# Run all tests
yarn test

# Run integration-specific tests (includes integration, events, and e2e tests)
yarn test-integration <dex-name>

# Run a single test file
yarn test <path-to-test-file>

# Examples:
yarn test src/dex/uniswap-v3/uniswap-v3-integration.test.ts
yarn test src/dex/curve-v1/curve-v1-events.test.ts
```

**E2E Tests Requirements**: E2E tests use Tenderly fork API. Create a `.env` file with:

```bash
TENDERLY_TOKEN=<your-token>          # From Account>Settings>Authorization
TENDERLY_ACCOUNT_ID=<your-account>   # Your Tenderly account name
TENDERLY_PROJECT=<your-project>      # Tenderly project name
```

### DEX Integration

```bash
# Initialize a new DEX integration (creates template code)
yarn init-integration <your-dex-name>
```

DEX names must be in `param-case` format. After initialization, add the DEX to the `Dexes` array in `src/dex/index.ts`.

## Architecture Overview

### Event-Based Pricing System

ParaSwap uses an **event-based architecture** that eliminates expensive fullnode RPC calls during pricing:

1. **Initial State**: DEX pool state is fetched once via Multicall on initialization
2. **Event Subscription**: Pools subscribe to relevant contract events (e.g., Uniswap `Sync`, Curve `TokenExchange`)
3. **State Updates**: Event subscriber processes logs and updates in-memory state cache
4. **Pricing**: Price calculations use cached state without RPC calls

**Key Classes**:

- `StatefulEventSubscriber`: Base class for event-driven state management
  - Implements `processLog()` to update state from events
  - Implements `generateState()` to reconstruct state from on-chain calls
- `StatefulRpcPoller`: Alternative for DEXes without good event support (polls contract state periodically)
- `ComposedEventSubscriber`: For DEXes with multiple event sources

### Core Abstractions

#### IDex Interface

Each DEX implements the `IDex` interface with three main responsibilities:

**Pricing (`IDexPricing<ExchangeData>`)**:

- `getPoolIdentifiers(srcToken, destToken)`: Returns identifiers for pools that can swap between tokens
- `getPricesVolume(srcToken, destToken, amounts, side)`: Calculates swap prices for given amounts
- `getTopPoolsForToken(token, limit)`: Returns most liquid pools for routing optimization

**Transaction Building (`IDexTxBuilder<ExchangeData>`)**:

_V5 Methods (Legacy Augustus)_:

- `getAdapterParam()`: Encode parameters for adapter-based routing
- `getSimpleParam()`: Encode for simpleSwap direct calls
- `getDirectParam()`: Encode for direct contract calls

_V6 Methods (Augustus V6)_:

- `getDexParam()`: Generic parameter encoding with context awareness
- `getDirectParamV6()`: Direct execution parameters

**ExchangeData Type**: Each DEX defines its own `ExchangeData` type containing pool-specific parameters (e.g., Uniswap V3's `path` and `deadline`, Curve's `poolAddress` and `underlyingSwap`).

#### DexHelper - Central Utility Provider

`IDexHelper` is injected into every DEX and provides:

- **RPC Access**: `provider` (ethers), `web3Provider` (web3)
- **Multicall**: `multiContract`, `multiWrapper` - batch on-chain calls efficiently
- **Caching**: `cache` - in-memory cache with TTL
- **HTTP**: `httpRequest` - rate-limited HTTP client
- **Block Management**: `blockManager` - event log subscription
- **Utilities**: `augustusApprovals`, `promiseScheduler`, token price helpers

**Always use Multicall** via `dexHelper.multiWrapper.aggregate()` to batch RPC calls and minimize costs.

### DEX Integration Structure

Each DEX follows this standardized layout:

```
src/dex/<dex-name>/
├── <dex-name>.ts              # Main DEX class implementing IDex
├── <dex-name>-pool.ts         # Event subscriber for pool state (if event-based)
├── <dex-name>-factory.ts      # Pool discovery/management (if applicable)
├── types.ts                   # ExchangeData and config types
├── config.ts                  # Network-specific configuration
├── contract-math/             # Replication of on-chain math
├── forks/                     # Protocol forks (if applicable)
└── *.test.ts                  # Integration, events, and e2e tests
```

### Testing Strategy

Each DEX requires three types of tests:

1. **Integration Tests** (`*-integration.test.ts`): Validates `getPoolIdentifiers()`, `getPricesVolume()`, gas estimates
2. **Events Unit Tests** (`*-events.test.ts`): Tests event processing and state management
3. **E2E Tests** (`*-e2e.test.ts`): Full swap simulation with Tenderly fork, tests transaction building and execution

### Transaction Building Pipeline

```
OptimalRate (from routing)
    ↓
PreprocessTransaction (optional async prep)
    ↓
getDexParam() or getAdapterParam()
    ↓
GenericSwapTransactionBuilder / TransactionBuilder
    ↓
ExecutorBytecodeBuilder (V6 - detects executor contract)
    ↓
TxObject (encoded transaction)
```

**Executors** are smart contracts that atomically:

1. Receive tokens from user
2. Execute DEX swaps
3. Return output tokens
4. Handle approvals and WETH wrapping/unwrapping

Three executor versions exist (`Executor01`, `Executor02`, `Executor03`), with automatic detection.

### Directory Structure

```
src/
├── dex/                    # 90+ DEX integrations
│   ├── idex.ts            # Core DEX interface definitions
│   ├── simple-exchange.ts # Base class for simple DEXes (WETH, Lido, etc.)
│   ├── index.ts           # DEX registration (Dexes array)
│   └── <dex-name>/        # Individual DEX implementations
├── dex-helper/            # Core utilities (IDexHelper interface)
├── lib/                   # Reusable libraries (multi-wrapper, decoders, etc.)
├── abi/                   # Smart contract ABIs (112+ ABIs)
├── executor/              # Transaction execution bytecode builders
├── router/                # Route encoding for different swap methods
├── stateful-event-subscriber.ts  # Base event subscriber class
├── pricing-helper.ts      # High-level pricing orchestration
├── types.ts               # Core TypeScript types
└── config.ts              # Network and DEX configuration
```

## Integration Best Practices

### Minimizing RPC Calls

- **Event-based pricing** is required - use `StatefulEventSubscriber`
- **Always use Multicall** - batch multiple contract calls via `dexHelper.multiWrapper`
- **Reuse Contract/Interface instances** - never create new instances per pool to avoid memory leaks

### Pricing Accuracy

- **Replicate on-chain math exactly** - any discrepancy causes transaction failures or surplus/deficit
- Use the same mathematical operations, bit shifting, and precision as the smart contract
- Reference existing implementations (Uniswap V3, Curve V1, Balancer V2) for complex math

### getDexParam Requirements

When implementing `getDexParam()`, carefully configure:

- `needWrapNative`: DEX only deals with wrapped native tokens (WETH)
- `dexFuncHasRecipient`: DEX can transfer to arbitrary recipient
- `exchangeData`: ABI-encoded call data for the DEX
- `targetExchange`: Contract address to call
- `spender`: Contract to approve (defaults to `targetExchange`)
- `transferSrcTokenBeforeSwap`: Transfer tokens before swap (vs encoding in `exchangeData`)
- `returnAmountPos`: Offset of return amount in function outputs (use `extractReturnAmountPosition` helper or `undefined`)

### Base Classes

- **SimpleExchange**: For simple DEXes without complex pool state (WETH, Lido, lending protocols)
- **SimpleExchangeWithRestrictions**: For DEXes with blacklists or regional restrictions
- **StatefulRpcPoller**: For DEXes without reliable event support (higher RPC cost)

## Code Style

- **TypeScript**: Strict mode enabled (`strict: true`, `strictNullChecks: true`)
- **Prettier**: Single quotes, 2 space tabs, trailing commas, 80 char line width
- **ESLint**: Airbnb base config
- **Imports**: Always remove unused imports - keep import statements clean and minimal
- **Comments**: Add comments only for complex logic that requires clarification. Simple, self-explanatory code should remain uncommented. Avoid redundant comments that merely restate what the code does.
- **Tests excluded from build**: `*.test.ts` files excluded from compilation

## Git Workflow

- Main branch: `master`
- Create feature branches: `feature/<dex-name>` or `feat/<ticket-id>`
- PRs must include:
  - DEX background and pricing logic explanation
  - Links to protocol documentation
  - Important contract addresses
  - All three test types passing

## Key Files to Reference

- `src/dex/idex.ts`: Core interface definitions
- `src/dex/simple-exchange.ts`: Base class for common patterns
- `src/dex-helper/idex-helper.ts`: DexHelper interface
- `src/lib/multi-wrapper.ts`: Multicall batching wrapper
- `src/stateful-event-subscriber.ts`: Event-based state management base class
- `src/types.ts`: Core type definitions

## Example DEX Implementations

Reference these for different patterns:

- **Uniswap V3** (`src/dex/uniswap-v3/`): Complex AMM with concentrated liquidity
- **Curve V1** (`src/dex/curve-v1/`): Multiple pool types, complex math replication
- **Balancer V2** (`src/dex/balancer-v2/`): Vault-based architecture
- **UniswapV2** (`src/dex/uniswap-v2/`): Simple AMM, many forks
- **Solidly** (`src/dex/solidly/`): ve(3,3) model with volatile/stable pools
- **VelodromeSlipstream** (`src/dex/uniswap-v3/forks/velodrome-slipstream/`): Optimized centralized fee fetching pattern

## RPC Optimization Patterns

### Problem Identification

When optimizing RPC usage, look for these patterns:

1. **Per-Pool RPC Calls on Every Block**: Methods called from `processBlockLogs()` that make RPC calls
2. **Rarely Changing Data**: Values that change infrequently (governance parameters, fees, protocol settings)
3. **Multiple Instances**: Many pools making the same type of call independently
4. **No Event Subscriptions**: Data fetched via polling instead of event-based updates

**Example**: VelodromeSlipstream pools called `factory.getSwapFee()` on every block with activity, resulting in 720,000 RPC calls/day for 100 pools.

### Key Principles

1. **Batch Everything**: Use `multiWrapper.tryAggregate()` to batch multiple calls into one RPC request
2. **Centralize at DEX Level**: Data needed by multiple pools should be fetched at the DEX level
3. **Use State Management**: Leverage `StatefulEventSubscriber.setState()` for updates instead of creating new cache layers
4. **Master/Slave Awareness**: Only master instances should make RPC calls (check `!this.dexHelper.config.isSlave`)
5. **Proper Cleanup**: Always clear intervals in `releaseResources()`
6. **Error Handling**: Use `tryAggregate(false, ...)` to allow individual call failures without breaking the batch

### State Management Insights

**Key Methods**:

- `pool.getState(blockNumber)`: Returns state only if valid and not stale
- `pool.getStaleState()`: Returns state even if slightly stale (useful for updates)
- `pool.setState(newState, blockNumber, reason)`: Updates pool state immutably

**Immutability Pattern**:

```typescript
// WRONG: Direct mutation
state.fee = newFee; // ❌ State is DeepReadonly

// CORRECT: Create new object
const newState = { ...currentState, fee: newFee }; // ✅
pool.setState(newState, blockNumber, 'update_reason');
```

### Tools and Utilities

**MultiWrapper** (`dexHelper.multiWrapper`):

```typescript
// Batch multiple calls with automatic chunking
const results = await dexHelper.multiWrapper.tryAggregate<bigint>(
  false, // Don't throw on individual failures
  callData, // Array of MultiCallParams
  blockNumber, // Optional block number
);

// Results: Array of { success: boolean, returnData: T }
results.forEach((result, index) => {
  if (result.success) {
    const value = result.returnData;
    // Use value...
  }
});
```

**Decoders** (`src/lib/decoders.ts`):

- `uint24ToBigInt`: Decode uint24 to bigint
- `uint256ToBigInt`: Decode uint256 to bigint
- Custom decoders for complex return types

### Logging Best Practices

```typescript
// DO: Log important operations
this.logger.info(
  `${this.dexKey}: Updating fees for ${activePools.length} pools`,
);

// DO: Log warnings for failures
this.logger.warn(
  `${this.dexKey}: Failed to fetch fee for pool ${pool.poolAddress}`,
);

// DO: Log errors with context
this.logger.error(`${this.dexKey}: Error updating pool fees:`, error);

// DON'T: Log success/failure analytics unless specifically needed
// this.logger.info(`Updated ${successCount}/${totalCount} pools`); // ❌ Unnecessary noise
```

### Testing Considerations

After implementing optimization:

1. Verify only 1 RPC call made per interval (check logs/monitoring)
2. Confirm pool states contain updated values after batch run
3. Test fallback behavior (what happens if batch call fails?)
4. Verify interval cleanup on `releaseResources()`
5. Test master/slave separation (slaves shouldn't make RPC calls)

### Related Patterns in Codebase

Similar optimization patterns exist in:

- `src/dex/balancer-v2/balancer-v2.ts`: Block-based caching (lines 796-820)
- `src/dex/gmx/pool.ts`: TTL-based caching with error handling
- Other DEXes with `updatePoolState()` methods for batch operations
