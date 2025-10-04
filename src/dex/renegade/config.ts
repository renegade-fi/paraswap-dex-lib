import { DexParams } from './types';
import { DexConfigMap } from '../../types';
import { Network } from '../../constants';

export const RenegadeConfig: DexConfigMap<DexParams> = {
  Renegade: {
    [Network.ARBITRUM]: {
      usdcAddress: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC
      chainName: 'arbitrum-one',
    },
    [Network.BASE]: {
      usdcAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDbC (USDC on Base)
      chainName: 'base-mainnet',
    },
  },
};
