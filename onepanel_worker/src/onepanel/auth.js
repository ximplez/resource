import { createHash } from "node:crypto";

export function buildOnePanelToken(apiKey, timestamp) {
  return createHash("md5").update(`1panel${apiKey}${timestamp}`).digest("hex");
}
