#!/usr/bin/env npx ts-node

/**
 * Simple test script to test the getPricesVolume method from Renegade DEX
 *
 * Usage:
 * 1. Set your Renegade API credentials:
 *    export API_KEY=your_token_here
 *    export API_SECRET=your_secret_here
 *
 * 2. Run the test:
 *    npx ts-node src/dex/renegade/getpricesvolume.test.ts
 *
 * This will test:
 * - getPricesVolume method with ETH as srcToken and USDC as destToken
 * - Price calculation using Renegade's order book levels
 * - Partial fill handling and decimal conversion
 */

import { Network, SwapSide } from '../../constants';
import { Renegade } from './renegade';
import { DummyDexHelper } from '../../dex-helper/index';
import { Token } from '../../types';

async function testGetPricesVolume() {
  console.log('🚀 Testing Renegade getPricesVolume Method\n');

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
    const ethToken: Token = {
      address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH on Arbitrum
      decimals: 18,
      symbol: 'WETH',
    };

    const usdcToken: Token = {
      address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // Arbitrum USDC
      decimals: 6,
      symbol: 'USDC',
    };

    // Test amounts (in smallest token units)
    const testAmounts = [
      BigInt('1000000000000000000'), // 1.0 ETH (18 decimals)
      BigInt('2500000000000000000'), // 2.5 ETH (18 decimals)
      BigInt('5000000000000000000'), // 5.0 ETH (18 decimals)
    ];

    console.log('🔍 Testing getPricesVolume method...');
    console.log(`📊 Source Token: ${ethToken.symbol} (${ethToken.address})`);
    console.log(
      `📊 Destination Token: ${usdcToken.symbol} (${usdcToken.address})`,
    );
    console.log(`📊 Side: ${SwapSide.SELL} (SELL ETH for USDC)`);
    console.log(`📊 Test Amounts:`);
    testAmounts.forEach((amount, index) => {
      const ethAmount = Number(amount) / 10 ** ethToken.decimals;
      console.log(
        `  ${index + 1}. ${ethAmount} ETH (${amount} smallest units)`,
      );
    });
    console.log('');

    // Test getPricesVolume
    const exchangePrices = await renegade.getPricesVolume(
      ethToken,
      usdcToken,
      testAmounts,
      SwapSide.SELL,
      12345678, // dummy block number
    );

    console.log('📋 Results:');

    if (exchangePrices && exchangePrices.length > 0) {
      const poolPrices = exchangePrices[0];
      console.log(`✅ Found ${exchangePrices.length} exchange price(s)`);
      console.log(`📊 Exchange: ${poolPrices.exchange}`);
      console.log(`⛽ Gas Cost: ${poolPrices.gasCost}`);
      console.log(`🔢 Unit: ${poolPrices.unit} (1 ETH in smallest units)`);
      console.log(
        `🏊 Pool Identifiers: ${poolPrices.poolIdentifiers?.join(', ')}`,
      );
      console.log('');

      console.log('💰 Price Results:');
      poolPrices.prices.forEach((price, index) => {
        const inputAmount = testAmounts[index];
        const inputEth = Number(inputAmount) / 10 ** ethToken.decimals;
        const outputUsdc = Number(price) / 10 ** usdcToken.decimals;

        console.log(`  ${index + 1}. ${inputEth} ETH → ${outputUsdc} USDC`);
        console.log(`     Input: ${inputAmount} smallest units`);
        console.log(`     Output: ${price} smallest units`);

        if (outputUsdc > 0) {
          const rate = outputUsdc / inputEth;
          console.log(`     Rate: ${rate.toFixed(2)} USDC per ETH`);
        }
        console.log('');
      });

      console.log(
        '✅ getPricesVolume test PASSED - Successfully calculated prices!',
      );
    } else {
      console.log('❌ No exchange prices returned');
      console.log('\n⚠️  getPricesVolume test - No prices returned');
      console.log('This could mean:');
      console.log('  - ETH/USDC pair is not available on Renegade');
      console.log('  - API credentials are invalid');
      console.log(
        '  - USDC/side parameter conflict (try swapping token order)',
      );
      console.log('  - Network connectivity issues');
    }

    console.log('\n🎉 getPricesVolume test completed!');
  } catch (error) {
    console.error('❌ Test failed:', error);

    // Provide helpful error context
    if (error instanceof Error) {
      if (error.message.includes('USDC/side parameter conflict')) {
        console.log(
          "\n💡 Tip: This error indicates a conflict between ParaSwap's side parameter",
        );
        console.log(
          "   and Renegade's USDC-centric logic. Try swapping the token order:",
        );
        console.log('   - Instead of ETH→USDC SELL, try USDC→ETH BUY');
        console.log(
          '   - Or vice versa depending on your intended trade direction',
        );
      } else if (error.message.includes('API')) {
        console.log(
          '\n💡 Tip: Check your API credentials and network connectivity',
        );
      }
    }

    process.exit(1);
  }
}

async function testUSDCAndSideConflict() {
  console.log('\n🚨 Testing USDC/Side Parameter Conflict Scenario\n');

  try {
    // Check for auth credentials (reuse from main test)
    if (!process.env.API_KEY || !process.env.API_SECRET) {
      console.log('⚠️  Skipping conflict test - API credentials not set');
      return;
    }

    // Initialize DexHelper
    const dexHelper = new DummyDexHelper(Network.ARBITRUM);
    dexHelper.config.data.renegadeApiKey = process.env.API_KEY;
    dexHelper.config.data.renegadeApiSecret = process.env.API_SECRET;

    // Initialize Renegade DEX
    const renegade = new Renegade(Network.ARBITRUM, 'Renegade', dexHelper);

    // Define test tokens (same as main test)
    const ethToken: Token = {
      address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH on Arbitrum
      decimals: 18,
      symbol: 'WETH',
    };

    const usdcToken: Token = {
      address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // Arbitrum USDC
      decimals: 6,
      symbol: 'USDC',
    };

    // Test amounts (small amount to minimize impact)
    const testAmounts = [
      BigInt('1000000000000000000'), // 1.0 ETH (18 decimals)
    ];

    console.log('🔍 Testing USDC/Side parameter conflict...');
    console.log(`📊 Source Token: ${usdcToken.symbol} (${usdcToken.address})`);
    console.log(
      `📊 Destination Token: ${ethToken.symbol} (${ethToken.address})`,
    );
    console.log(`📊 Side: ${SwapSide.SELL} (SELL USDC for ETH)`);
    console.log(`📊 This should FAIL due to USDC/side parameter conflict\n`);

    // Test the conflicting scenario: SELL USDC (should fail)
    const exchangePrices = await renegade.getPricesVolume(
      usdcToken, // USDC as source
      ethToken, // ETH as destination
      testAmounts,
      SwapSide.SELL, // SELL side (conflicts with USDC direction)
      12345678,
    );

    // Check if the method returned null (indicating validation failure)
    if (exchangePrices === null) {
      console.log(
        '✅ CONFLICT TEST PASSED - Method returned null as expected!',
      );
      console.log(
        '   The conflicting scenario was correctly rejected and returned null.',
      );
      console.log('');
      console.log('📋 Conflict Analysis:');
      console.log('   - ParaSwap side: SELL (selling USDC to get ETH)');
      console.log('   - Renegade logic: Sending USDC = BUY');
      console.log('   - Result: Conflict detected and method returned null ✅');
      console.log('');
      console.log(
        '💡 This is the expected behavior - conflicts are caught and the method',
      );
      console.log('   returns null to indicate the trade cannot be executed.');
    } else {
      console.log(
        '❌ TEST FAILED - Expected null return but got:',
        exchangePrices,
      );
      console.log(
        '   The conflicting scenario should have been rejected but returned prices.',
      );
      console.log(
        '   This indicates the USDC/side validation is not working properly.',
      );
    }
  } catch (error) {
    // Handle unexpected errors (not related to validation)
    console.log('❌ UNEXPECTED ERROR - An unexpected error occurred:');
    console.error('   ', error);
    console.log(
      '   This indicates an issue not related to USDC/side validation.',
    );
  }
}

async function runAllTests() {
  console.log('🧪 Running Renegade getPricesVolume Tests\n');
  console.log('='.repeat(60));

  // Run happy path test
  await testGetPricesVolume();

  console.log('='.repeat(60));

  // Run conflict scenario test
  await testUSDCAndSideConflict();

  console.log('='.repeat(60));
  console.log('🎉 All tests completed!');
}

// Run the test
if (require.main === module) {
  runAllTests().catch(console.error);
}
