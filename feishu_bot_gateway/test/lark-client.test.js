import assert from "node:assert/strict";
import test from "node:test";

import { formatLarkError } from "../src/services/lark-client.js";

test("formatLarkError includes SDK response status and body", () => {
  const error = new Error("Request failed with status code 400");
  error.response = {
    status: 400,
    data: {
      code: 230099,
      msg: "Invalid request body",
      error: {
        ErrCode: 200736,
        ErrMsg: "variable content_image not found",
      },
    },
  };

  const formatted = formatLarkError(error);

  assert.match(formatted, /Request failed with status code 400/);
  assert.match(formatted, /status=400/);
  assert.match(formatted, /variable content_image not found/);
});
