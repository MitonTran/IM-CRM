import "server-only";

import { isValidBearerSecret } from "./cron-auth-core";

export function hasValidCronAuthorization(header: string | null) {
  return isValidBearerSecret(header, process.env.CRON_SECRET);
}
