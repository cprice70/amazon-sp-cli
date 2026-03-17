import { createRequire } from "module";
import type { SellingPartner } from "amazon-sp-api";
import type { Config } from "./config.js";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SellingPartnerClass = require("amazon-sp-api").SellingPartner as new (
  config: ConstructorParameters<typeof SellingPartner>[0]
) => SellingPartner;

export function createClient(config: Partial<Config>): SellingPartner {
  if (!config.clientId || !config.clientSecret || !config.refreshToken || !config.region) {
    throw new Error(
      'Missing SP-API credentials. Run "amazon-sp auth login" or set environment variables.'
    );
  }

  return new SellingPartnerClass({
    region: config.region,
    refresh_token: config.refreshToken,
    credentials: {
      SELLING_PARTNER_APP_CLIENT_ID: config.clientId,
      SELLING_PARTNER_APP_CLIENT_SECRET: config.clientSecret,
    },
    options: {
      auto_request_tokens: true,
      auto_request_throttled: true,
      use_sandbox: config.sandbox ?? false,
    },
  });
}
