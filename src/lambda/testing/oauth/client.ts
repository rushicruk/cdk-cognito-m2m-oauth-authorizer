import { SecretsManager } from "aws-sdk";
import got, { GotRequestFunction, HTTPError } from "got";
import { URLSearchParams } from "url";

const { COGNITO_OAUTH_HOST, COGNITO_OAUTH_SECRET_ARN,APIGATEWAY_ENDPOINT } = process.env;
if (!COGNITO_OAUTH_HOST) throw new Error("COGNITO_OAUTH_HOST undefined");
if (!COGNITO_OAUTH_SECRET_ARN) throw new Error("COGNITO_OAUTH_SECRET_ARN undefined");
if (!APIGATEWAY_ENDPOINT) throw new Error("APIGATEWAY_ENDPOINT undefined");


const THIRTY_MINUTES_IN_MILLIS = 30 * 60 * 1000;

const secretsManager = new SecretsManager({
  maxRetries: 3,
});

export default class OauthClient {
  authHeader: string | undefined;

  lastRefresh: number = new Date().getTime();

  async getAuthHeader(): Promise<string> {
    // Return the cached token if available and refreshed in the last 30 minutes.
    // The TTL is 60 minutes for all token requests currently.
    if (
      this.authHeader &&
      this.lastRefresh + THIRTY_MINUTES_IN_MILLIS > new Date().getTime()
    ) {
      return this.authHeader;
    }

    let oauthSecret: string | undefined;
    try {
      oauthSecret = (
        await secretsManager
          .getSecretValue({
            SecretId: COGNITO_OAUTH_SECRET_ARN!,
          })
          .promise()
      ).SecretString;
    } catch (err) {
      throw new Error("Secret for Cognito OAuth failed retrieval");
    }

    if (!oauthSecret) {
      throw new Error("Secret for Cognito OAuth returned empty");
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const {
      CLIENT_ID,
      CLIENT_SECRET,
      COGNITO_RESOURCE_SERVER_NAME
    }: { CLIENT_ID: string; CLIENT_SECRET: string, COGNITO_RESOURCE_SERVER_NAME:string } = JSON.parse(oauthSecret);
    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error("Cognito OAuth credentials not found");
    }

    if (!COGNITO_RESOURCE_SERVER_NAME) {
      throw new Error("Cognito Resource Server Name is required");
    }

    let authResponse: { access_token: string; token_type: string };
    try {
      authResponse = await got
        .post(`${COGNITO_OAUTH_HOST!}/oauth2/token`, {
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            scope: `${COGNITO_RESOURCE_SERVER_NAME}/user.read ${COGNITO_RESOURCE_SERVER_NAME}/user.write`,
          }).toString(),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          responseType: "json",
        })
        .json();
    } catch (err) {
      if (err instanceof HTTPError) {
        const httpError = err;
        console.log("OAuth Token call returned HTTP error");
      } else {
        console.log("OAuth Token call returned unknown error");
        console.log(err);
      }
      throw err;
    }
    this.authHeader = `${authResponse.token_type} ${authResponse.access_token}`;
    this.lastRefresh = new Date().getTime();
    return this.authHeader;
  }

  async get<T>(endpoint: string): Promise<T | undefined> {
    try {
      const authHeader = await this.getAuthHeader();
      return await got
        .get(`${APIGATEWAY_ENDPOINT!}/${endpoint}`, {
          headers: {
            Authorization: authHeader,
          },
          responseType: "json",
        })
        .json();
    } catch (err) {
        console.log("User API Gateway returned unknown error", {
          endpoint,
        });
        console.log(err);
        throw err;
    }
  }
}
