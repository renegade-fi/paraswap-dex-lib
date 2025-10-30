/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config();

import { DummyDexHelper } from '../../dex-helper/index';
import { Network, SwapSide } from '../../constants';
import { BI_POWS } from '../../bigint-constants';
import { Renegade } from './renegade';
import {
  checkPoolPrices,
  checkPoolsLiquidity,
  checkConstantPoolPrices,
  sleep,
} from '../../../tests/utils';
import { Tokens } from '../../../tests/constants-e2e';

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
  if (renegade.hasConstantPriceLargeAmounts) {
    checkConstantPoolPrices(poolPrices!, amounts, dexKey);
  } else {
    checkPoolPrices(poolPrices!, amounts, side, dexKey, false);
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

    const srcTokenSymbol = 'WETH';
    const destTokenSymbol = 'USDC';

    const amountsForSell = [
      0n,
      1n * BI_POWS[tokens[srcTokenSymbol].decimals],
      2n * BI_POWS[tokens[srcTokenSymbol].decimals],
    ];

    const amountsForBuy = [
      0n,
      1000n * BI_POWS[tokens[destTokenSymbol].decimals],
      2000n * BI_POWS[tokens[destTokenSymbol].decimals],
      3000n * BI_POWS[tokens[destTokenSymbol].decimals],
      4000n * BI_POWS[tokens[destTokenSymbol].decimals],
      5000n * BI_POWS[tokens[destTokenSymbol].decimals],
      6000n * BI_POWS[tokens[destTokenSymbol].decimals],
      7000n * BI_POWS[tokens[destTokenSymbol].decimals],
      8000n * BI_POWS[tokens[destTokenSymbol].decimals],
      9000n * BI_POWS[tokens[destTokenSymbol].decimals],
      10000n * BI_POWS[tokens[destTokenSymbol].decimals],
    ];

    beforeAll(async () => {
      blockNumber = await dexHelper.web3Provider.eth.getBlockNumber();
      renegade = new Renegade(network, dexKey, dexHelper);
      await renegade.initializePricing(blockNumber);
      await sleep(5000);
    });

    afterAll(async () => {
      if (renegade.releaseResources) {
        await renegade.releaseResources();
      }
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
      // We have to check without calling initializePricing, because
      // pool-tracker is not calling that function
      const newRenegade = new Renegade(network, dexKey, dexHelper);
      if (newRenegade.updatePoolState) {
        await newRenegade.updatePoolState();
      }
      const poolLiquidity = await newRenegade.getTopPoolsForToken(
        tokens[srcTokenSymbol].address,
        10,
      );
      console.log(
        `${srcTokenSymbol} Top Pools:`,
        JSON.stringify(poolLiquidity, null, 2),
      );

      if (!newRenegade.hasConstantPriceLargeAmounts) {
        checkPoolsLiquidity(
          poolLiquidity,
          Tokens[network][srcTokenSymbol].address,
          dexKey,
        );
      }
    });
  });

  describe('Base', () => {
    const network = Network.BASE;
    const dexHelper = new DummyDexHelper(network, 'https://mainnet.base.org');

    const tokens = Tokens[network];

    const srcTokenSymbol = 'WETH';
    const destTokenSymbol = 'USDC';

    const amountsForSell = [0n, BI_POWS[tokens[srcTokenSymbol].decimals] / 10n];

    const amountsForBuy = [
      0n,
      1000n * BI_POWS[tokens[destTokenSymbol].decimals],
      2000n * BI_POWS[tokens[destTokenSymbol].decimals],
      3000n * BI_POWS[tokens[destTokenSymbol].decimals],
      4000n * BI_POWS[tokens[destTokenSymbol].decimals],
    ];

    beforeAll(async () => {
      blockNumber = await dexHelper.web3Provider.eth.getBlockNumber();
      renegade = new Renegade(network, dexKey, dexHelper);
      await renegade.initializePricing(blockNumber);
      await sleep(5000);
    });

    afterAll(async () => {
      if (renegade.releaseResources) {
        await renegade.releaseResources();
      }
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
      // We have to check without calling initializePricing, because
      // pool-tracker is not calling that function
      const newRenegade = new Renegade(network, dexKey, dexHelper);
      if (newRenegade.updatePoolState) {
        await newRenegade.updatePoolState();
      }
      const poolLiquidity = await newRenegade.getTopPoolsForToken(
        tokens[srcTokenSymbol].address,
        10,
      );
      console.log(
        `${srcTokenSymbol} Top Pools:`,
        JSON.stringify(poolLiquidity, null, 2),
      );

      if (!newRenegade.hasConstantPriceLargeAmounts) {
        checkPoolsLiquidity(
          poolLiquidity,
          Tokens[network][srcTokenSymbol].address,
          dexKey,
        );
      }
    });
  });
});
