import dotenv from 'dotenv';
dotenv.config();

import { testE2E } from '../../../tests/utils-e2e';
import {
  Tokens,
  Holders,
  NativeTokenSymbols,
} from '../../../tests/constants-e2e';
import { Network, ContractMethod, SwapSide } from '../../constants';
import { StaticJsonRpcProvider } from '@ethersproject/providers';
import { generateConfig } from '../../config';

/** Pause test after `initializePricing` */
const SLEEP_MS = 5000;

/*
  README
  ======

  This test script should add e2e tests for Renegade. The tests
  should cover as many cases as possible. Most of the DEXes follow
  the following test structure:
    - DexName
      - ForkName + Network
        - ContractMethod
          - ETH -> Token swap
          - Token -> ETH swap
          - Token -> Token swap

  The template already enumerates the basic structure which involves
  testing simpleSwap, multiSwap, megaSwap contract methods for
  ETH <> TOKEN and TOKEN <> TOKEN swaps. You should replace tokenA and
  tokenB with any two highly liquid tokens on Renegade for the tests
  to work. If the tokens that you would like to use are not defined in
  Tokens or Holders map, you can update the './tests/constants-e2e'

  Other than the standard cases that are already added by the template
  it is highly recommended to add test cases which could be specific
  to testing Renegade (Eg. Tests based on poolType, special tokens,
  etc).

  You can run this individual test script by running:
  `npx jest src/dex/<dex-name>/<dex-name>-e2e.test.ts`

  e2e tests use the Tenderly fork api. Please add the following to your
  .env file:
  TENDERLY_TOKEN=Find this under Account>Settings>Authorization.
  TENDERLY_ACCOUNT_ID=Your Tenderly account name.
  TENDERLY_PROJECT=Name of a Tenderly project you have created in your
  dashboard.

  (This comment should be removed from the final implementation)
*/

function testForNetwork(
  network: Network,
  dexKey: string,
  quoteSymbol: string,
  baseSymbol: string,
  quoteAmount: string,
  baseAmount: string,
  nativeTokenAmount: string,
) {
  const provider = new StaticJsonRpcProvider(
    generateConfig(network).privateHttpProvider,
    network,
  );
  const tokens = Tokens[network];
  const holders = Holders[network];
  const nativeTokenSymbol = NativeTokenSymbols[network];

  // TODO: Add any direct swap contractMethod name if it exists
  const sideToContractMethods = new Map([
    [SwapSide.SELL, [ContractMethod.swapExactAmountIn]],
    // TODO: If buy is not supported remove the buy contract methods
    [SwapSide.BUY, [ContractMethod.swapExactAmountOut]],
  ]);

  describe(`${network}`, () => {
    sideToContractMethods.forEach((contractMethods, side) =>
      describe(`${side}`, () => {
        contractMethods.forEach((contractMethod: ContractMethod) => {
          describe(`${contractMethod}`, () => {
            // it(`${quoteSymbol} -> ${nativeTokenSymbol}`, async () => {
            //   await testE2E(
            //     tokens[quoteSymbol], // srcToken
            //     tokens[nativeTokenSymbol], // destToken
            //     holders[quoteSymbol], // senderAddress
            //     side === SwapSide.SELL ? quoteAmount : nativeTokenAmount, // srcToken amount
            //     side,
            //     dexKey,
            //     contractMethod,
            //     network,
            //     provider,
            //     undefined, // poolIdentifiers
            //     undefined, // limitOrderProvider
            //     undefined, // transferFees
            //     100, // slippage
            //     SLEEP_MS,
            //     undefined, // replaceTenderlyWithEstimateGas
            //     undefined, // forceRoute
            //     undefined, // options
            //   );
            // });
            // it(`${nativeTokenSymbol} -> ${quoteSymbol}`, async () => {
            //   await testE2E(
            //     tokens[nativeTokenSymbol], // srcToken
            //     tokens[quoteSymbol], // destToken
            //     holders[nativeTokenSymbol], // senderAddress
            //     side === SwapSide.SELL ? nativeTokenAmount : quoteAmount, // srcToken amount
            //     side,
            //     dexKey,
            //     contractMethod,
            //     network,
            //     provider,
            //     undefined, // poolIdentifiers
            //     undefined, // limitOrderProvider
            //     undefined, // transferFees
            //     100, // slippage
            //     SLEEP_MS,
            //     undefined, // replaceTenderlyWithEstimateGas
            //     undefined, // forceRoute
            //     undefined, // options
            //   );
            // });
            it(`${quoteSymbol} -> ${baseSymbol}`, async () => {
              await testE2E(
                tokens[quoteSymbol], // srcToken
                tokens[baseSymbol], // destToken
                holders[quoteSymbol], // senderAddress
                side === SwapSide.SELL ? quoteAmount : baseAmount, // srcToken amount
                side,
                dexKey,
                contractMethod,
                network,
                provider,
                undefined, // poolIdentifiers
                undefined, // limitOrderProvider
                undefined, // transferFees
                100, // slippage
                SLEEP_MS,
                undefined, // replaceTenderlyWithEstimateGas
                undefined, // forceRoute
                undefined, // options
              );
            });
            it(`${baseSymbol} -> ${quoteSymbol}`, async () => {
              await testE2E(
                tokens[baseSymbol], // srcToken
                tokens[quoteSymbol], // destToken
                holders[baseSymbol], // senderAddress
                side === SwapSide.SELL ? baseAmount : quoteAmount, // srcToken amount
                side,
                dexKey,
                contractMethod,
                network,
                provider,
                undefined, // poolIdentifiers
                undefined, // limitOrderProvider
                undefined, // transferFees
                100, // slippage
                SLEEP_MS,
                undefined, // replaceTenderlyWithEstimateGas
                undefined, // forceRoute
                undefined, // options
              );
            });
          });
        });
      }),
    );
  });
}

describe('Renegade E2E', () => {
  const dexKey = 'Renegade';

  describe('Arbitrum', () => {
    const network = Network.ARBITRUM;

    // TODO: Modify the tokenASymbol, tokenBSymbol, tokenAAmount;
    const quoteSymbol: string = 'USDC';
    const baseSymbol: string = 'WETH';

    const quoteAmount: string = '10000000'; // 10 USDC
    const baseAmount: string = '10000000000000000'; // 0.01 WETH

    // const tokenASymbol: string = 'WETH';
    // const tokenBSymbol: string = 'USDC';

    // const tokenAAmount: string = '100000000000000000'; // 0.1 WETH
    // const tokenBAmount: string = '10000000'; // 10 USDC

    const nativeTokenAmount = '10000000000000000'; // 0.01 ETH

    testForNetwork(
      network,
      dexKey,
      quoteSymbol,
      baseSymbol,
      quoteAmount,
      baseAmount,
      nativeTokenAmount,
    );

    // TODO: Add any additional test cases required to test Renegade
  });
});
