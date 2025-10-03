#!/usr/bin/env npx ts-node

/**
 * Test script to fetch price levels from Renegade API
 * This script hits the actual Renegade auth server to test the rate fetcher
 *
 * Usage:
 * 1. Set your Renegade API token:
 *    export API_KEY=your_token_here
 *    export API_SECRET=your_secret_here
 *
 * 2. Run the test:
 *    npx ts-node src/dex/renegade/test-integration.ts
 *
 * This will test:
 * - Direct API call to /rfqt/v3/levels endpoint
 * - Price levels data fetching and parsing
 * - Network-specific URL building
 */

import { Network } from '../../constants';
import { Renegade } from './renegade';
import { DummyDexHelper } from '../../dex-helper/index';

async function testPriceLevelsFetching() {
  console.log('🚀 Testing Renegade Price Levels Fetching\n');

  try {
    // Check for auth token
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

    // Manually set the auth token in the config since DummyDexHelper doesn't load env vars
    dexHelper.config.data.renegadeApiKey = process.env.API_KEY;
    dexHelper.config.data.renegadeApiSecret = process.env.API_SECRET;
    console.log('✅ DexHelper initialized successfully\n');

    // Initialize Renegade DEX
    console.log('📦 Initializing Renegade DEX...');
    const renegade = new Renegade(
      Network.ARBITRUM, // Test with Arbitrum network
      'Renegade',
      dexHelper,
    );
    console.log('✅ Renegade DEX initialized successfully\n');

    // Test direct price levels fetching
    console.log('🔍 Testing direct price levels fetching...');
    console.log(
      '📡 Fetching from: https://arbitrum-one.auth-server.renegade.fi/rfqt/v3/levels\n',
    );

    // Access the rateFetcher through a type assertion since it's private
    const levels = await (renegade as any).rateFetcher.fetchLevels();

    if (levels) {
      console.log('✅ Successfully fetched price levels!');
      console.log(`📊 Found ${Object.keys(levels).length} trading pairs\n`);

      // Show first few pairs as examples
      const pairKeys = Object.keys(levels).slice(0, 3);
      console.log('📈 Sample trading pairs:');
      pairKeys.forEach(pairKey => {
        const pairData = levels[pairKey];
        console.log(`  ${pairKey}:`);
        console.log(`    Bids: ${pairData.bids.length} levels`);
        console.log(`    Asks: ${pairData.asks.length} levels`);
        if (pairData.bids.length > 0) {
          console.log(
            `    Best bid: ${pairData.bids[0][0]} @ ${pairData.bids[0][1]}`,
          );
        }
        if (pairData.asks.length > 0) {
          console.log(
            `    Best ask: ${pairData.asks[0][0]} @ ${pairData.asks[0][1]}`,
          );
        }
        console.log('');
      });

      if (Object.keys(levels).length > 3) {
        console.log(`  ... and ${Object.keys(levels).length - 3} more pairs\n`);
      }
    } else {
      console.log('❌ Failed to fetch price levels');
    }

    console.log('🎉 Price levels fetching test completed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testPriceLevelsFetching().catch(console.error);
}
