#!/usr/bin/env npx ts-node

/**
 * Simple test script to test ONLY the getTopPoolsForToken method from Renegade DEX
 *
 * Usage:
 * 1. Set your Renegade API credentials:
 *    export API_KEY=your_token_here
 *    export API_SECRET=your_secret_here
 *
 * 2. Run the test:
 *    npx ts-node src/dex/renegade/gettoppoolsfortoken.test.ts
 *
 * This will test:
 * - getTopPoolsForToken method with USDC as the input token
 * - Pool liquidity calculation and connector token identification
 * - USD liquidity conversion and sorting
 */

import { Network } from '../../constants';
import { Renegade } from './renegade';
import { DummyDexHelper } from '../../dex-helper/index';
import { Token } from '../../types';

async function testGetTopPoolsForToken() {
  console.log('🚀 Testing Renegade getTopPoolsForToken Method\n');

  try {
    // Check for auth credentials
    if (!process.env.API_KEY) {
      console.error('❌ API_KEY environment variable is required');
      console.log('Please set it with: export API_KEY=your_token_here');
      process.exit(1);
    }

    if (!process.env.API_SECRET) {
      console.error('❌ API_SECRET environment variable is required');
      console.log('Please set it with: export API_SECRET=your_secret_here');
      process.exit(1);
    }

    // Initialize DexHelper
    console.log('📦 Initializing DexHelper...');
    const dexHelper = new DummyDexHelper(Network.ARBITRUM);

    // Set auth credentials
    dexHelper.config.data.renegadeApiKey = process.env.API_KEY;
    dexHelper.config.data.renegadeApiSecret = process.env.API_SECRET;
    console.log('✅ DexHelper initialized successfully\n');

    // Initialize Renegade DEX
    console.log('📦 Initializing Renegade DEX...');
    const renegade = new Renegade(Network.ARBITRUM, 'Renegade', dexHelper);
    console.log('✅ Renegade DEX initialized successfully\n');

    // Define test token (USDC - should have multiple pairs on Renegade)
    const usdcToken: Token = {
      address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // Arbitrum USDC
      decimals: 6,
      symbol: 'USDC',
    };

    console.log('🔍 Testing getTopPoolsForToken method...');
    console.log(`📊 Input Token: ${usdcToken.symbol} (${usdcToken.address})`);
    console.log(`📊 Limit: 5 pools\n`);

    // Test getTopPoolsForToken
    const topPools = await renegade.getTopPoolsForToken(
      usdcToken.address,
      20, // limit to 5 pools
    );

    console.log('📋 Results:');
    console.log(`Found ${topPools.length} pool(s) for ${usdcToken.symbol}:\n`);

    if (topPools.length > 0) {
      topPools.forEach((pool, index) => {
        console.log(`  ${index + 1}. Pool Details:`);
        console.log(`     Exchange: ${pool.exchange}`);
        console.log(`     Address: ${pool.address}`);
        console.log(`     Liquidity USD: $${pool.liquidityUSD.toFixed(2)}`);
        console.log(`     Connector Tokens: ${pool.connectorTokens.length}`);

        pool.connectorTokens.forEach((connector, connectorIndex) => {
          console.log(
            `       ${connectorIndex + 1}. ${connector.address} (${
              connector.decimals
            } decimals)`,
          );
        });
        console.log('');
      });

      // Validate results
      const hasValidLiquidity = topPools.every(pool => pool.liquidityUSD > 0);
      const hasConnectorTokens = topPools.every(
        pool => pool.connectorTokens.length > 0,
      );
      const isSorted = topPools.every(
        (pool, index) =>
          index === 0 || pool.liquidityUSD <= topPools[index - 1].liquidityUSD,
      );

      console.log('✅ Validation Results:');
      console.log(
        `  - All pools have positive liquidity: ${
          hasValidLiquidity ? '✅' : '❌'
        }`,
      );
      console.log(
        `  - All pools have connector tokens: ${
          hasConnectorTokens ? '✅' : '❌'
        }`,
      );
      console.log(
        `  - Pools are sorted by liquidity (desc): ${isSorted ? '✅' : '❌'}`,
      );

      if (hasValidLiquidity && hasConnectorTokens && isSorted) {
        console.log(
          '\n✅ getTopPoolsForToken test PASSED - All validations passed!',
        );
      } else {
        console.log('\n⚠️  getTopPoolsForToken test - Some validations failed');
      }
    } else {
      console.log('  (No pools found)');
      console.log('\n⚠️  getTopPoolsForToken test - No pools returned');
      console.log('This could mean:');
      console.log('  - USDC has no trading pairs on Renegade');
      console.log('  - API credentials are invalid');
      console.log('  - Network connectivity issues');
      console.log('  - Liquidity calculation failed');
    }

    console.log('\n🎉 getTopPoolsForToken test completed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testGetTopPoolsForToken().catch(console.error);
}
