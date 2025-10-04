/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config();

import { Tokens } from '../../../tests/constants-e2e';
import {
  checkPoolPrices,
  checkPoolsLiquidity,
  sleep,
} from '../../../tests/utils';
import { BI_POWS } from '../../bigint-constants';
import { Network, SwapSide } from '../../constants';
import { DummyDexHelper } from '../../dex-helper/index';
import { Renegade } from './renegade';

async function testPricingOnNetwork(
  renegade: Renegade,
  network: Network,
  dexKey: string,
  blockNumber: number,
  srcTokenSymbol: string,
  destTokenSymbol: string,
  side: SwapSide,
  amounts: bigint[],
) {
  const networkTokens = Tokens[network];

  const pools = await renegade.getPoolIdentifiers(
    networkTokens[srcTokenSymbol],
    networkTokens[destTokenSymbol],
    side,
    blockNumber,
  );
  console.log(
    `${srcTokenSymbol} <> ${destTokenSymbol} Pool Identifiers: `,
    pools,
  );

  expect(pools.length).toBeGreaterThan(0);

  const poolPrices = await renegade.getPricesVolume(
    networkTokens[srcTokenSymbol],
    networkTokens[destTokenSymbol],
    amounts,
    side,
    blockNumber,
    pools,
  );
  console.log(
    `${srcTokenSymbol} <> ${destTokenSymbol} Pool Prices: `,
    poolPrices,
  );

  expect(poolPrices).not.toBeNull();
  if (poolPrices && poolPrices.length > 0) {
    checkPoolPrices(poolPrices, amounts, side, dexKey, false);
  }
}

describe('Renegade', function () {
  const dexKey = 'Renegade';
  let blockNumber: number;
  let renegade: Renegade;

  describe('Arbitrum', () => {
    const network = Network.ARBITRUM;
    const dexHelper = new DummyDexHelper(network);

    const tokens = Tokens[network];

    // Renegade requirement: exactly one token must be USDC
    const srcTokenSymbol = 'WETH';
    const destTokenSymbol = 'USDC';

    const amountsForSell = [
      0n,
      1n * BI_POWS[tokens[srcTokenSymbol].decimals],
      2n * BI_POWS[tokens[srcTokenSymbol].decimals],
      3n * BI_POWS[tokens[srcTokenSymbol].decimals],
      4n * BI_POWS[tokens[srcTokenSymbol].decimals],
      5n * BI_POWS[tokens[srcTokenSymbol].decimals],
    ];

    const amountsForBuy = [
      0n,
      1000n * BI_POWS[tokens[destTokenSymbol].decimals],
      2000n * BI_POWS[tokens[destTokenSymbol].decimals],
      3000n * BI_POWS[tokens[destTokenSymbol].decimals],
      4000n * BI_POWS[tokens[destTokenSymbol].decimals],
      5000n * BI_POWS[tokens[destTokenSymbol].decimals],
    ];

    beforeAll(async () => {
      blockNumber = await dexHelper.web3Provider.eth.getBlockNumber();
      renegade = new Renegade(network, dexKey, dexHelper);
      // Renegade doesn't require initializePricing() - it uses direct API calls
    });

    afterAll(async () => {
      // Renegade doesn't have releaseResources() method
    });

    it('getPoolIdentifiers and getPricesVolume SELL', async function () {
      await testPricingOnNetwork(
        renegade,
        network,
        dexKey,
        blockNumber,
        srcTokenSymbol,
        destTokenSymbol,
        SwapSide.SELL,
        amountsForSell,
      );
    });

    it('getPoolIdentifiers and getPricesVolume BUY', async function () {
      await testPricingOnNetwork(
        renegade,
        network,
        dexKey,
        blockNumber,
        srcTokenSymbol,
        destTokenSymbol,
        SwapSide.BUY,
        amountsForBuy,
      );
    });

    it('getTopPoolsForToken', async function () {
      // Test pool discovery for USDC (should have multiple pairs)
      const poolLiquidity = await renegade.getTopPoolsForToken(
        tokens[destTokenSymbol].address,
        10,
      );
      console.log(`${destTokenSymbol} Top Pools:`, poolLiquidity);

      checkPoolsLiquidity(
        poolLiquidity,
        Tokens[network][destTokenSymbol].address,
        dexKey,
      );
    });

    it('getPoolIdentifiers returns no liquidity for non-USDC pairs', async function () {
      // Test that non-USDC pairs return no pools (Renegade requirement)
      const pools = await renegade.getPoolIdentifiers(
        tokens['WETH'],
        tokens['WBTC'],
        SwapSide.SELL,
        blockNumber,
      );
      console.log('WETH -> WBTC Pool Identifiers: ', pools);

      expect(pools.length).toBe(0);
    });

    it('getPoolIdentifiers returns no liquidity for same token', async function () {
      // Test that same token pairs return no pools
      const pools = await renegade.getPoolIdentifiers(
        tokens['USDC'],
        tokens['USDC'],
        SwapSide.SELL,
        blockNumber,
      );
      console.log('USDC -> USDC Pool Identifiers: ', pools);

      expect(pools.length).toBe(0);
    });
  });

  describe('Base', () => {
    const network = Network.BASE;
    const dexHelper = new DummyDexHelper(network);

    const tokens = Tokens[network];

    // Renegade requirement: exactly one token must be USDC
    const srcTokenSymbol = 'WETH';
    const destTokenSymbol = 'USDC';

    const amountsForSell = [
      0n,
      1n * BI_POWS[tokens[srcTokenSymbol].decimals],
      2n * BI_POWS[tokens[srcTokenSymbol].decimals],
      3n * BI_POWS[tokens[srcTokenSymbol].decimals],
    ];

    const amountsForBuy = [
      0n,
      1000n * BI_POWS[tokens[destTokenSymbol].decimals],
      2000n * BI_POWS[tokens[destTokenSymbol].decimals],
      3000n * BI_POWS[tokens[destTokenSymbol].decimals],
    ];

    beforeAll(async () => {
      blockNumber = await dexHelper.web3Provider.eth.getBlockNumber();
      renegade = new Renegade(network, dexKey, dexHelper);
    });

    it('getPoolIdentifiers and getPricesVolume SELL', async function () {
      await testPricingOnNetwork(
        renegade,
        network,
        dexKey,
        blockNumber,
        srcTokenSymbol,
        destTokenSymbol,
        SwapSide.SELL,
        amountsForSell,
      );
    });

    it('getPoolIdentifiers and getPricesVolume BUY', async function () {
      await testPricingOnNetwork(
        renegade,
        network,
        dexKey,
        blockNumber,
        srcTokenSymbol,
        destTokenSymbol,
        SwapSide.BUY,
        amountsForBuy,
      );
    });

    it('getTopPoolsForToken', async function () {
      // Test pool discovery for USDC on Base
      const poolLiquidity = await renegade.getTopPoolsForToken(
        tokens[destTokenSymbol].address,
        10,
      );
      console.log(`${destTokenSymbol} Top Pools:`, poolLiquidity);

      checkPoolsLiquidity(
        poolLiquidity,
        Tokens[network][destTokenSymbol].address,
        dexKey,
      );
    });
  });
});
