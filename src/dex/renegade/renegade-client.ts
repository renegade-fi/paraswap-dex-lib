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
  RENEGADE_QUOTE_ENDPOINT,
  RENEGADE_ASSEMBLE_ENDPOINT,
  RENEGADE_API_TIMEOUT_MS,
} from './constants';
import { generateRenegadeAuthHeaders } from './auth-helper';
import {
  ExternalQuoteRequest,
  SponsoredQuoteResponse,
  AssembleExternalMatchRequest,
  SponsoredMatchResponse,
  ExternalOrder,
} from './types';

/**
 * External order structure for Renegade match requests
 * @deprecated Use ExternalOrder from types.ts instead
 */
export type RenegadeExternalOrder = ExternalOrder;

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
    externalOrder: RenegadeExternalOrder,
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

  /**
   * Request a quote for an external order
   *
   * @param request - The quote request containing the external order and optional parameters
   * @param queryParams - Optional query parameters for gas sponsorship settings
   * @returns Promise resolving to SponsoredQuoteResponse
   */
  async requestQuote(
    request: ExternalQuoteRequest,
    queryParams?: {
      disable_gas_sponsorship?: boolean;
      refund_address?: string;
      refund_native_eth?: boolean;
    },
  ): Promise<SponsoredQuoteResponse> {
    const requestBody = request;

    // Build query string
    const queryString = new URLSearchParams();
    if (queryParams?.disable_gas_sponsorship !== undefined) {
      queryString.set(
        'disable_gas_sponsorship',
        String(queryParams.disable_gas_sponsorship),
      );
    }
    if (queryParams?.refund_address) {
      queryString.set('refund_address', queryParams.refund_address);
    }
    if (queryParams?.refund_native_eth !== undefined) {
      queryString.set(
        'refund_native_eth',
        String(queryParams.refund_native_eth),
      );
    }

    const pathWithQuery =
      queryString.toString().length > 0
        ? `${RENEGADE_QUOTE_ENDPOINT}?${queryString.toString()}`
        : RENEGADE_QUOTE_ENDPOINT;

    const quoteUrl = `${this.baseUrl}${pathWithQuery}`;

    const headers = generateRenegadeAuthHeaders(
      pathWithQuery,
      JSON.stringify(requestBody),
      {
        'content-type': 'application/json',
        accept: 'application/json;number=string',
      },
      this.apiKey,
      this.apiSecret,
    );

    this.logger.debug('Requesting quote from Renegade API', {
      url: quoteUrl,
      request: requestBody,
    });

    const response: SponsoredQuoteResponse =
      await this.dexHelper.httpRequest.post(
        quoteUrl,
        requestBody,
        RENEGADE_API_TIMEOUT_MS,
        headers,
      );

    return response;
  }

  /**
   * Assemble a signed quote into a settlement bundle
   *
   * @param request - The assemble request containing the signed quote and optional parameters
   * @returns Promise resolving to SponsoredMatchResponse
   */
  async assembleExternalMatch(
    request: AssembleExternalMatchRequest,
  ): Promise<SponsoredMatchResponse> {
    const requestBody = request;

    const assembleUrl = `${this.baseUrl}${RENEGADE_ASSEMBLE_ENDPOINT}`;

    const headers = generateRenegadeAuthHeaders(
      RENEGADE_ASSEMBLE_ENDPOINT,
      JSON.stringify(requestBody),
      {
        'content-type': 'application/json',
        accept: 'application/json;number=string',
      },
      this.apiKey,
      this.apiSecret,
    );

    this.logger.debug('Assembling external match from Renegade API', {
      url: assembleUrl,
      request: {
        do_gas_estimation: request.do_gas_estimation,
        allow_shared: request.allow_shared,
        matching_pool: request.matching_pool,
        has_signed_quote: !!request.signed_quote,
      },
    });

    const response: SponsoredMatchResponse =
      await this.dexHelper.httpRequest.post(
        assembleUrl,
        requestBody,
        RENEGADE_API_TIMEOUT_MS,
        headers,
      );

    return response;
  }
}
