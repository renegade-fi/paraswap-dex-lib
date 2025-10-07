/**
 * RenegadeClient - Client for Renegade match endpoint API
 *
 * Handles authentication and HTTP requests to Renegade's external match endpoint.
 */

import { IDexHelper } from '../../dex-helper/idex-helper';
import { Logger } from '../../types';
import { Network } from '../../constants';
import {
  buildRenegadeApiUrl,
  RENEGADE_MATCH_ENDPOINT,
  RENEGADE_API_TIMEOUT_MS,
} from './constants';
import { generateRenegadeAuthHeaders } from './auth-helper';
import { RenegadeMatchResponse } from './types';

/**
 * External order structure for Renegade match requests
 */
export type RenegadeExternalOrder = {
  quote_mint: string;
  base_mint: string;
  side: 'Buy' | 'Sell';
  base_amount: string;
  quote_amount: string;
  exact_base_output: string;
  exact_quote_output: string;
  min_fill_size: string;
};

/**
 * Client for interacting with Renegade match endpoint API
 */
export class RenegadeClient {
  private readonly baseUrl: string;

  constructor(
    private readonly dexHelper: IDexHelper,
    private readonly network: Network,
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly logger: Logger,
  ) {
    this.baseUrl = buildRenegadeApiUrl(this.network);
  }

  /**
   * Request an external match from Renegade API
   *
   * @param externalOrder - The external order details
   * @param receiverAddress - Address to receive the matched funds
   * @returns Promise resolving to RenegadeMatchResponse
   */
  async requestExternalMatch(
    externalOrder: RenegadeExternalOrder,
    receiverAddress: string,
  ): Promise<RenegadeMatchResponse> {
    const requestBody = {
      external_order: externalOrder,
      receiver_address: receiverAddress,
    };

    const matchUrl = `${this.baseUrl}${RENEGADE_MATCH_ENDPOINT}`;

    const headers = generateRenegadeAuthHeaders(
      `${RENEGADE_MATCH_ENDPOINT}?disable_gas_sponsorship=true`,
      JSON.stringify(requestBody),
      {
        'content-type': 'application/json',
        accept: 'application/json;number=string',
      },
      this.apiKey,
      this.apiSecret,
    );

    this.logger.debug('Requesting external match from Renegade API', {
      url: matchUrl,
      order: externalOrder,
    });

    const response: RenegadeMatchResponse =
      await this.dexHelper.httpRequest.post(
        matchUrl + '?disable_gas_sponsorship=true',
        requestBody,
        RENEGADE_API_TIMEOUT_MS,
        headers,
      );

    return response;
  }
}
