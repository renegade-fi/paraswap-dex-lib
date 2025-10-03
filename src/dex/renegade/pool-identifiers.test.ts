#!/usr/bin/env npx ts-node

/**
 * Simple test script to test ONLY the getPoolIdentifiers method from Renegade DEX
 *
 * Usage:
 * 1. Set your Renegade API credentials:
 *    export API_KEY=your_token_here
 *    export API_SECRET=your_secret_here
 *
 * 2. Run the test:
 *    npx ts-node src/dex/renegade/test-pool-identifiers.ts
 *
 * This will test:
 * - getPoolIdentifiers method with WBTC as srcToken and USDC as destToken
 * - Pool identifier generation and validation
 */

import { Network, SwapSide } from '../../constants';
import { Renegade } from './renegade';
import { DummyDexHelper } from '../../dex-helper/index';
import { Token } from '../../types';

async function testGetPoolIdentifiers() {
  console.log('🚀 Testing Renegade getPoolIdentifiers Method\n');

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

    // Define test tokens
    const wbtcToken: Token = {
      address: '0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a',
      decimals: 8,
      symbol: 'WBTC',
    };

    const usdcToken: Token = {
      address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // Arbitrum USDC
      decimals: 6,
      symbol: 'USDC',
    };

    console.log('🔍 Testing getPoolIdentifiers method...');
    console.log(`📊 Source Token: ${wbtcToken.symbol} (${wbtcToken.address})`);
    console.log(
      `📊 Destination Token: ${usdcToken.symbol} (${usdcToken.address})`,
    );
    console.log(`📊 Side: ${SwapSide.SELL} (SELL)\n`);

    // Test getPoolIdentifiers
    const poolIdentifiers = await renegade.getPoolIdentifiers(
      wbtcToken,
      usdcToken,
      SwapSide.SELL,
      12345678, // dummy block number
    );

    console.log('📋 Results:');
    console.log(`Found ${poolIdentifiers.length} pool identifier(s):`);

    if (poolIdentifiers.length > 0) {
      poolIdentifiers.forEach((identifier, index) => {
        console.log(`  ${index + 1}. ${identifier}`);
      });
      console.log(
        '\n✅ getPoolIdentifiers test PASSED - Found valid pool identifiers!',
      );
    } else {
      console.log('  (No pool identifiers found)');
      console.log(
        '\n⚠️  getPoolIdentifiers test - No pool identifiers returned',
      );
      console.log('This could mean:');
      console.log('  - WBTC/USDC pair is not available on Renegade');
      console.log('  - API credentials are invalid');
      console.log('  - Network connectivity issues');
    }

    console.log('\n🎉 getPoolIdentifiers test completed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testGetPoolIdentifiers().catch(console.error);
}
