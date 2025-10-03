import { DexConfigMap } from '../../types';
import { Network } from '../../constants';

export interface RenegadeParams {}

export const RenegadeConfig: DexConfigMap<RenegadeParams> = {
  Renegade: {
    // Only support networks that Renegade actually supports
    [Network.ARBITRUM]: {},
    [Network.BASE]: {},
    // TODO: Add testnet support when needed
    // [Network.ARBITRUM_SEPOLIA]: {},
    // [Network.BASE_SEPOLIA]: {},
  },
};
