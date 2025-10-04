/* eslint-disable no-console */
import 'dotenv/config';
import { testGasEstimation } from '../../../tests/utils-e2e';
import { Tokens } from '../../../tests/constants-e2e';
import { Network, SwapSide } from '../../constants';
import { ContractMethodV6 } from '@paraswap/core';

describe('Renegade Gas Estimation', () => {
  const dexKey = 'Renegade';
  const network = Network.ARBITRUM;

  describe('swapExactAmountIn', () => {
    const WETH = Tokens[network]['WETH'];
    const USDC = Tokens[network]['USDC'];
    const amount = 1000000000000000000n; // 1 WETH

    it('swapExactAmountIn', async () => {
      await testGasEstimation(
        network,
        WETH,
        USDC,
        amount,
        SwapSide.SELL,
        dexKey,
        ContractMethodV6.swapExactAmountIn,
      );
    });
  });

  describe('Base Network', () => {
    const network = Network.BASE;
    const WETH = Tokens[network]['WETH'];
    const USDC = Tokens[network]['USDC'];
    const amount = 1000000000000000000n; // 1 WETH

    it('swapExactAmountIn', async () => {
      await testGasEstimation(
        network,
        WETH,
        USDC,
        amount,
        SwapSide.SELL,
        dexKey,
        ContractMethodV6.swapExactAmountIn,
      );
    });
  });
});
