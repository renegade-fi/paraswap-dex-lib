import { SubgraphConnectorPool, SubgraphPool, SubgraphTick } from './types';
import {
  POOL_MIN_TVL_USD,
  HOOKED_POOL_MIN_TVL_USD,
  SUBGRAPH_TIMEOUT,
} from './constants';
import { IDexHelper } from '../../dex-helper';
import { Logger } from 'log4js';
import { Address } from '@paraswap/core';
import { NULL_ADDRESS } from '../../constants';

type HookGroup = { hooks: string[]; minTVL: number };

// Helper to build hook groups based on provided hooks and their min TVL requirements
const buildHookGroups = (hooks: string[]): HookGroup[] => {
  const hooked = hooks.filter(h => h !== NULL_ADDRESS);
  const hookless = hooks.includes(NULL_ADDRESS) ? [NULL_ADDRESS] : [];

  const groups: HookGroup[] = [];

  if (hookless.length) {
    groups.push({ hooks: hookless, minTVL: POOL_MIN_TVL_USD });
  }

  if (hooked.length) {
    groups.push({ hooks: hooked, minTVL: HOOKED_POOL_MIN_TVL_USD });
  }

  return groups;
};

// Helper to fetch per hook group while honoring global skip/limit across groups
const fetchByHookGroups = async <T>(
  groups: HookGroup[],
  skip: number,
  limit: number,
  fetcher: (group: HookGroup, count: number) => Promise<T[]>,
): Promise<T[]> => {
  let remainingSkip = skip;
  let remainingLimit = limit;
  const merged: T[] = [];

  for (const group of groups) {
    if (remainingLimit <= 0) break;

    const fetchCount = remainingLimit + remainingSkip;
    if (fetchCount <= 0) continue;

    const data = await fetcher(group, fetchCount);

    if (remainingSkip >= data.length) {
      remainingSkip -= data.length;
      continue;
    }

    const usable = data.slice(remainingSkip, remainingSkip + remainingLimit);
    merged.push(...usable);
    remainingLimit -= usable.length;
    remainingSkip = 0;
  }

  return merged;
};

export async function queryTicksForPool(
  dexHelper: IDexHelper,
  logger: Logger,
  dexKey: string,
  subgraphUrl: string,
  blockNumber: number,
  id: string,
  skip: number,
  limit: number,
  latestBlock = false,
): Promise<SubgraphTick[]> {
  const ticksQuery = `query($poolId: Bytes!, $skip: Int!) {
      ticks(
        where: {pool_: {id: $poolId}}
        first: ${limit}
        skip: $skip
        orderBy: createdAtBlockNumber
        orderDirection: asc
        ${latestBlock ? '' : `block: { number: ${blockNumber} }`}
      ) {
        liquidityNet
        liquidityGross
        tickIdx
      }
  }`;

  const res = await dexHelper.httpRequest.querySubgraph<{
    data: {
      ticks: SubgraphTick[];
    };
    errors?: { message: string }[];
  }>(
    subgraphUrl,
    {
      query: ticksQuery,
      variables: { poolId: id, skip },
    },
    { timeout: SUBGRAPH_TIMEOUT },
  );

  if (res.errors && res.errors.length) {
    if (res.errors[0].message.includes('missing block')) {
      logger.info(
        `${dexKey}: subgraph query ticks fallback to the latest block...`,
      );
      return queryTicksForPool(
        dexHelper,
        logger,
        dexKey,
        subgraphUrl,
        blockNumber,
        id,
        skip,
        limit,
        true,
      );
    } else {
      throw new Error(res.errors[0].message);
    }
  }

  return res.data.ticks || [];
}

export async function queryAvailablePoolsForToken(
  dexHelper: IDexHelper,
  logger: Logger,
  dexKey: string,
  subgraphUrl: string,
  tokenAddress: string,
  limit: number,
  staticPoolsList?: string[],
  hooks: string[] = [NULL_ADDRESS],
): Promise<{
  pools0: SubgraphConnectorPool[];
  pools1: SubgraphConnectorPool[];
}> {
  const hookGroups = buildHookGroups(hooks);
  const list = staticPoolsList
    ? staticPoolsList.map(t => `"${t}"`).join(',')
    : '';
  const poolsQuery = `query ($token: Bytes!, $hooks: [Bytes!], $minTVL: Int!, $count: Int) {
    pools0: pools(
      where: {
        token0: $token
        hooks_in: $hooks
        liquidity_gt: 0
        totalValueLockedUSD_gte: $minTVL
        ${list ? `id_in: [${list}]` : ''}
      }
      orderBy: volumeUSD
      orderDirection: desc
      first: $count
    ) {
      id
      volumeUSD
      token0 {
        address: id
        decimals
      }
      token1 {
        address: id
        decimals
      }
      fee: feeTier
      tickSpacing
      hooks
    }
    pools1: pools(
      where: {
        token1: $token
        hooks_in: $hooks
        liquidity_gt: 0
        totalValueLockedUSD_gte: $minTVL
        ${list ? `id_in: [${list}]` : ''}
      }
      orderBy: volumeUSD
      orderDirection: desc
      first: $count
    ) {
      id
      volumeUSD
      token0 {
        address: id
        decimals
      }
      token1 {
        address: id
        decimals
      }
      fee: feeTier
      tickSpacing
      hooks
    }
  }
`;

  const fetch = async (group: HookGroup, count: number) => {
    const res = await dexHelper.httpRequest.querySubgraph<{
      data: {
        pools0: SubgraphConnectorPool[];
        pools1: SubgraphConnectorPool[];
      };
      errors?: { message: string }[];
    }>(
      subgraphUrl,
      {
        query: poolsQuery,
        variables: {
          token: tokenAddress,
          count,
          hooks: group.hooks,
          minTVL: group.minTVL,
        },
      },
      { timeout: SUBGRAPH_TIMEOUT },
    );

    if (res.errors && res.errors.length) {
      throw new Error(res.errors[0].message);
    }

    return res.data;
  };

  const pools0 = await fetchByHookGroups(
    hookGroups,
    0,
    limit,
    async (group, count) => {
      const data = await fetch(group, count);
      return data.pools0;
    },
  );

  const pools1 = await fetchByHookGroups(
    hookGroups,
    0,
    limit,
    async (group, count) => {
      const data = await fetch(group, count);
      return data.pools1;
    },
  );

  return { pools0, pools1 };
}

export async function queryAvailablePoolsForPairFromSubgraph(
  dexHelper: IDexHelper,
  subgraphUrl: string,
  srcToken: Address,
  destToken: Address,
  hooks: string[] = [NULL_ADDRESS],
): Promise<SubgraphPool[]> {
  const ticksLimit = 300;
  const hookGroups = buildHookGroups(hooks);

  const poolsQuery = `query ($token0: Bytes!, $token1: Bytes!, $minTVL: Int!, $hooks: [Bytes!]) {
      pools(
        where: { token0: $token0, token1: $token1, hooks_in: $hooks, liquidity_gt: 0, totalValueLockedUSD_gte: $minTVL },
        orderBy: totalValueLockedUSD
        orderDirection: desc
      ) {
        id
        fee: feeTier
        tickSpacing
        token0 {
          address: id
        }
        token1 {
          address: id
        }
        hooks
        tick
        ticks(first: ${ticksLimit}) {
          id
          liquidityGross
          liquidityNet
          tickIdx
        }
      }
    }`;

  const [token0, token1] =
    parseInt(srcToken, 16) < parseInt(destToken, 16)
      ? [srcToken, destToken]
      : [destToken, srcToken];

  const pools: SubgraphPool[] = [];

  for (const group of hookGroups) {
    const res = await dexHelper.httpRequest.querySubgraph<{
      data: { pools: SubgraphPool[] };
      errors?: { message: string }[];
    }>(
      subgraphUrl,
      {
        query: poolsQuery,
        variables: {
          token0,
          token1,
          minTVL: group.minTVL,
          hooks: group.hooks,
        },
      },
      { timeout: SUBGRAPH_TIMEOUT },
    );

    if (res.errors && res.errors.length) {
      throw new Error(res.errors[0].message);
    }

    pools.push(...res.data.pools);
  }

  return pools;
}

export async function queryOnePageForAllAvailablePoolsFromSubgraph(
  dexHelper: IDexHelper,
  logger: Logger,
  dexKey: string,
  subgraphUrl: string,
  blockNumber: number,
  skip: number,
  limit: number,
  hooks: string[] = [NULL_ADDRESS],
  latestBlock = false,
): Promise<SubgraphPool[]> {
  const hookGroups = buildHookGroups(hooks);

  return fetchByHookGroups(
    hookGroups,
    skip,
    limit,
    async (group, count): Promise<SubgraphPool[]> => {
      const runQuery = async (useLatestBlock: boolean) => {
        const poolsQuery = `query ($skip: Int!, $minTVL: Int!, $hooks: [Bytes!]) {
          pools(
            where: { hooks_in: $hooks, liquidity_gt: 0, totalValueLockedUSD_gte: $minTVL },
            ${useLatestBlock ? '' : `block: { number: ${blockNumber} }`}
            orderBy: totalValueLockedUSD
            orderDirection: desc
            skip: $skip
            first: ${count}
          ) {
          id
          fee: feeTier
          volumeUSD
          tickSpacing
          token0 {
            address: id
          }
          token1 {
            address: id
          }
            hooks
          }
        }`;

        const res = await dexHelper.httpRequest.querySubgraph<{
          data: { pools: SubgraphPool[] };
          errors?: { message: string }[];
        }>(
          subgraphUrl,
          {
            query: poolsQuery,
            variables: {
              skip: 0,
              hooks: group.hooks,
              minTVL: group.minTVL,
            },
          },
          { timeout: SUBGRAPH_TIMEOUT },
        );

        if (res.errors && res.errors.length) {
          throw new Error(res.errors[0].message);
        }

        return res.data.pools;
      };

      try {
        return await runQuery(latestBlock);
      } catch (err: any) {
        if (
          err?.message &&
          typeof err.message === 'string' &&
          err.message.includes('missing block') &&
          !latestBlock
        ) {
          logger.info(`${dexKey}: subgraph fallback to the latest block...`);
          return runQuery(true);
        }
        throw err;
      }
    },
  );
}

export async function queryPoolsFromSubgraph(
  dexHelper: IDexHelper,
  subgraphUrl: string,
  poolIds: string[],
  hooks: string[] = [NULL_ADDRESS],
): Promise<SubgraphPool[]> {
  const hookGroups = buildHookGroups(hooks);
  const poolsQuery = `query ($minTVL: Int!, $hooks: [Bytes!], $pools: [Bytes!]!) {
      pools(where: {liquidity_gt: 0, totalValueLockedUSD_gte: $minTVL, id_in: $pools, hooks_in: $hooks}) {
        id
        fee: feeTier
        volumeUSD
        tickSpacing
        token0 {
          address: id
        }
        token1 {
          address: id
        }
        hooks
      }
    }`;

  const results: SubgraphPool[] = [];

  for (const group of hookGroups) {
    const res = await dexHelper.httpRequest.querySubgraph<{
      data: {
        pools: SubgraphPool[];
      };
      errors?: { message: string }[];
    }>(
      subgraphUrl,
      {
        query: poolsQuery,
        variables: {
          hooks: group.hooks,
          minTVL: group.minTVL,
          pools: poolIds,
        },
      },
      { timeout: SUBGRAPH_TIMEOUT },
    );

    if (res.errors && res.errors.length) {
      throw new Error(res.errors[0].message);
    }

    results.push(...(res?.data?.pools ?? []));
  }

  return results;
}
