import { Contract } from 'ethers';
import { IDexHelper } from '../../../../dex-helper';
import { ArenaHookConfig } from './config';
import { Network } from '../../../../constants';
import { Logger } from '../../../../types';
import { PoolKey } from '../../types';
import {
  SwapParams,
  BalanceDelta,
  HooksPermissions,
  IBaseHook,
} from '../types';
import { toId } from '../../utils';
import ArenaFeeHelperABI from '../../../../abi/uniswap-v4/hooks/arena/arena-fee-helper.abi.json';
import { _require } from '../../../../utils';

const MAX_HOOK_FEE = 1_000_000n; // 100%
const UINT128_MAX = (1n << 128n) - 1n;
const INT128_MAX = (1n << 127n) - 1n;

export class ArenaHook implements IBaseHook {
  readonly name = this.constructor.name;
  readonly address: string;

  constructor(
    readonly dexHelper: IDexHelper,
    readonly network: Network,
    readonly logger: Logger,
    readonly feeHelperAddress = ArenaHookConfig[
      network
    ].feeHelperAddress.toLowerCase(),
    readonly arenaFeeHelper = new Contract(
      feeHelperAddress,
      ArenaFeeHelperABI,
      dexHelper.provider,
    ),
  ) {
    this.address = ArenaHookConfig[network].hookAddress.toLowerCase();
  }

  getHookPermissions(): HooksPermissions {
    return {
      beforeInitialize: true,
      afterInitialize: false,
      beforeAddLiquidity: false,
      afterAddLiquidity: false,
      beforeRemoveLiquidity: false,
      afterRemoveLiquidity: false,
      beforeSwap: false,
      afterSwap: true,
      beforeDonate: false,
      afterDonate: false,
      beforeSwapReturnDelta: false,
      afterSwapReturnDelta: true,
      afterAddLiquidityReturnDelta: false,
      afterRemoveLiquidityReturnDelta: false,
    };
  }

  async afterSwap(
    _sender: string,
    key: PoolKey,
    params: SwapParams,
    delta: BalanceDelta,
    _hookData: string,
  ): Promise<bigint> {
    const amountSpecified = BigInt(params.amountSpecified);
    const isExactInput = amountSpecified < 0n;
    const unspecifiedDelta =
      amountSpecified < 0n === params.zeroForOne
        ? delta.amount1
        : delta.amount0;

    if (unspecifiedDelta === 0n) {
      return 0n;
    }

    const output = unspecifiedDelta < 0n ? -unspecifiedDelta : unspecifiedDelta;

    _require(
      output <= UINT128_MAX,
      'Unspecified output exceeds uint128',
      { output },
      'output <= UINT128_MAX',
    );

    const totalFeePpm = BigInt(
      (await this.arenaFeeHelper.getTotalFeePpm(toId(key))).toString(),
    );

    if (totalFeePpm === 0n) {
      return 0n;
    }

    _require(
      totalFeePpm <= MAX_HOOK_FEE,
      'Hook fee too large',
      { totalFeePpm },
      'totalFeePpm <= MAX_HOOK_FEE',
    );

    const feeAmount = (output * totalFeePpm) / MAX_HOOK_FEE;

    _require(
      feeAmount <= INT128_MAX,
      'Hook fee exceeds int128',
      { feeAmount },
      'feeAmount <= INT128_MAX',
    );

    const netOutput = isExactInput ? output - feeAmount : output + feeAmount;

    return netOutput;
  }
}
