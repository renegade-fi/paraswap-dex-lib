/**
 * RenegadeClient - Client for Renegade match endpoint API
 *
 * Handles authentication and HTTP requests to Renegade's external match endpoint.
 */

import { Network } from '../../constants';
import { IDexHelper } from '../../dex-helper/idex-helper';
import { Logger } from '../../types';
import { generateRenegadeAuthHeaders } from './auth-helper';
import {
  buildRenegadeApiUrl,
  RENEGADE_API_TIMEOUT_MS,
  RENEGADE_MATCH_ENDPOINT,
} from './constants';
import { ExternalOrder, SponsoredMatchResponse } from './types';

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
   * @returns Promise resolving to SponsoredMatchResponse
   */
  async requestExternalMatch(
    externalOrder: ExternalOrder,
  ): Promise<SponsoredMatchResponse> {
    const requestBody = {
      external_order: externalOrder,
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

    const response: SponsoredMatchResponse =
      await this.dexHelper.httpRequest.post(
        matchUrl + '?disable_gas_sponsorship=true',
        requestBody,
        RENEGADE_API_TIMEOUT_MS,
        headers,
      );

    return response;
  }
}
