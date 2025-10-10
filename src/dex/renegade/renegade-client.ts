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
  RENEGADE_QUOTE_ENDPOINT,
  RENEGADE_ASSEMBLE_ENDPOINT,
} from './constants';
import {
  AssembleExternalMatchRequest,
  ExternalOrder,
  ExternalQuoteRequest,
  QuoteQueryParams,
  SignedExternalQuote,
  SponsoredMatchResponse,
  SponsoredQuoteResponse,
} from './types';

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

  /**
   * Request a quote from Renegade API
   *
   * @param externalOrder - The external order details
   * @param queryParams - Optional query parameters for gas sponsorship and refund settings
   * @returns Promise resolving to SponsoredQuoteResponse with signed quote
   */
  async requestQuote(
    externalOrder: ExternalOrder,
    queryParams?: QuoteQueryParams & {
      matching_pool?: string;
      relayer_fee_rate?: number;
    },
  ): Promise<SponsoredQuoteResponse> {
    const requestBody: ExternalQuoteRequest = {
      external_order: externalOrder,
    };

    if (queryParams?.matching_pool !== undefined) {
      requestBody.matching_pool = queryParams.matching_pool;
    }

    if (queryParams?.relayer_fee_rate !== undefined) {
      requestBody.relayer_fee_rate = queryParams.relayer_fee_rate;
    }

    const queryString = buildQueryString(queryParams);
    const pathWithQuery = `${RENEGADE_QUOTE_ENDPOINT}${queryString}`;
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
      order: externalOrder,
      queryParams,
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
   * Assemble an external match from a signed quote
   *
   * @param signedQuote - The signed quote to assemble into a match bundle
   * @param queryParams - Optional query parameters including gas sponsorship, receiver, and order updates
   * @returns Promise resolving to SponsoredMatchResponse with match bundle
   */
  async assembleExternalMatch(
    signedQuote: SignedExternalQuote,
    queryParams?: QuoteQueryParams & {
      do_gas_estimation?: boolean;
      allow_shared?: boolean;
      matching_pool?: string;
      relayer_fee_rate?: number;
      receiver_address?: string | null;
      updated_order?: ExternalOrder | null;
    },
  ): Promise<SponsoredMatchResponse> {
    const requestBody: AssembleExternalMatchRequest = {
      signed_quote: signedQuote,
    };

    if (queryParams?.do_gas_estimation !== undefined) {
      requestBody.do_gas_estimation = queryParams.do_gas_estimation;
    }

    if (queryParams?.allow_shared !== undefined) {
      requestBody.allow_shared = queryParams.allow_shared;
    }

    if (queryParams?.matching_pool !== undefined) {
      requestBody.matching_pool = queryParams.matching_pool;
    }

    if (queryParams?.relayer_fee_rate !== undefined) {
      requestBody.relayer_fee_rate = queryParams.relayer_fee_rate;
    }

    if (queryParams?.receiver_address !== undefined) {
      requestBody.receiver_address = queryParams.receiver_address;
    }

    if (queryParams?.updated_order !== undefined) {
      requestBody.updated_order = queryParams.updated_order;
    }

    const queryString = buildQueryString(queryParams);
    const pathWithQuery = `${RENEGADE_ASSEMBLE_ENDPOINT}${queryString}`;
    const assembleUrl = `${this.baseUrl}${pathWithQuery}`;

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

    this.logger.debug('Assembling external match from Renegade API', {
      url: assembleUrl,
      queryParams,
    });

    const response: SponsoredMatchResponse =
      await this.dexHelper.httpRequest.post(
        assembleUrl,
        requestBody,
        RENEGADE_API_TIMEOUT_MS,
        headers,
      );

    this.logger.debug('Assembled external match from Renegade API', {
      response,
    });

    return response;
  }
}

/**
 * Build query string from optional query parameters
 *
 * @param params - Optional query parameters object
 * @returns Query string with leading '?' or empty string if no params
 */
function buildQueryString(params?: QuoteQueryParams): string {
  if (!params) {
    return '';
  }

  const queryParts: string[] = [];

  // if (params.disable_gas_sponsorship !== undefined) {
  queryParts.push(`disable_gas_sponsorship=${params.disable_gas_sponsorship}`);
  // }

  if (params.refund_address !== undefined) {
    queryParts.push(
      `refund_address=${encodeURIComponent(params.refund_address)}`,
    );
  }

  if (params.refund_native_eth !== undefined) {
    queryParts.push(`refund_native_eth=${params.refund_native_eth}`);
  }

  if (params.use_gas_sponsorship !== undefined) {
    queryParts.push(`use_gas_sponsorship=${params.use_gas_sponsorship}`);
  }

  return queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
}
