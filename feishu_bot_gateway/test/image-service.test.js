import assert from "node:assert/strict";
import test from "node:test";

import { readJson } from "../src/lib/http.js";
import { parseCardRequest, parseUploadImageRequest } from "../src/services/image-request.js";
import { uploadCardImages, uploadImage } from "../src/services/image-service.js";
import { validateSendPayload } from "../src/validators/message.js";

test("uploadImage uploads a base64 image and returns imageKey", async () => {
  const requests = [];
  const requestLark = fakeRequestLark(requests, ["img_v2_test"]);

  const result = await uploadImage({
    appId: "cli_test",
    base64: "data:image/png;base64,AQID",
    fileName: "status.png",
  }, testEnv(), {
    requestLark,
  });

  assert.equal(result.imageKey, "img_v2_test");
  assert.equal(result.contentType, "image/png");
  assert.equal(result.fileName, "status.png");
  assert.equal(result.size, 3);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].appId, "cli_test");
  assert.equal(requests[0].request.url, "https://open.feishu.cn/open-apis/im/v1/images");
  assert.equal(requests[0].request.headers["Content-Type"], "multipart/form-data");
  assert.equal(requests[0].request.data.get("image_type"), "message");
  const uploaded = requests[0].request.data.get("image");
  assert.equal(uploaded.name, "status.png");
  assert.equal(uploaded.type, "image/png");
});

test("uploadCardImages injects uploaded image keys into template variables", async () => {
  const requests = [];
  const requestLark = fakeRequestLark(requests, ["img_cover", "img_detail"]);

  const result = await uploadCardImages({
    appId: "cli_test",
    templateId: "ctp_test",
    templateVariable: {
      title: "运行完成",
    },
    images: [
      {
        variable: "cover_image",
        base64: "AQID",
        contentType: "image/png",
      },
      {
        variable: "detail_image",
        base64: "BAUG",
        contentType: "image/jpeg",
      },
    ],
  }, testEnv(), {
    requestLark,
  });

  assert.equal(result.payload.templateVariable.title, "运行完成");
  assert.deepEqual(result.payload.templateVariable.cover_image, { img_key: "img_cover" });
  assert.deepEqual(result.payload.templateVariable.detail_image, { img_key: "img_detail" });
  assert.equal(result.images.length, 2);
  assert.equal(requests.length, 2);
});

test("uploadCardImages also injects variables into content template cards", async () => {
  const requestLark = fakeRequestLark([], ["img_content"]);
  const result = await uploadCardImages({
    appId: "cli_test",
    templateVariable: {
      title: "不应覆盖 content",
    },
    content: JSON.stringify({
      type: "template",
      data: {
        template_id: "ctp_test",
        template_variable: {
          title: "卡片标题",
        },
      },
    }),
    images: [
      {
        variable: "cover_image",
        base64: "AQID",
        contentType: "image/png",
      },
    ],
  }, testEnv(), {
    requestLark,
  });

  assert.equal(result.payload.content.data.template_variable.title, "卡片标题");
  assert.deepEqual(result.payload.content.data.template_variable.cover_image, { img_key: "img_content" });
});

test("uploadCardImages uses a cached transparent placeholder when image source is empty", async () => {
  const requests = [];
  const requestLark = fakeRequestLark(requests, ["img_placeholder"]);
  const appId = `cli_placeholder_${Date.now()}`;

  const first = await uploadCardImages({
    appId,
    templateId: "ctp_test",
    images: [
      {
        variable: "content_image",
      },
    ],
  }, testEnv(appId), {
    requestLark,
  });
  const second = await uploadCardImages({
    appId,
    templateId: "ctp_test",
    images: [
      {
        variable: "content_image",
        url: "",
      },
    ],
  }, testEnv(appId), {
    requestLark,
  });

  assert.deepEqual(first.payload.templateVariable.content_image, { img_key: "img_placeholder" });
  assert.deepEqual(second.payload.templateVariable.content_image, { img_key: "img_placeholder" });
  assert.equal(first.images[0].placeholder, true);
  assert.equal(second.images[0].placeholder, true);
  assert.equal(first.images[0].fileName, "transparent-card-placeholder-1200x1.png");
  assert.equal(first.images[0].contentType, "image/png");
  assert.equal(requests.length, 1);
  const uploaded = requests[0].request.data.get("image");
  assert.equal(uploaded.name, "transparent-card-placeholder-1200x1.png");
  assert.equal(uploaded.type, "image/png");
});

test("uploadImage rejects redirects to unsupported URL protocols", async () => {
  await assert.rejects(
    uploadImage({
      appId: "cli_test",
      url: "https://example.com/image.png",
    }, testEnv(), {
      fetch: async () => new Response(null, {
        status: 302,
        headers: {
          Location: "file:///etc/passwd",
        },
      }),
    }),
    (error) => error.status === 400 && /http or https/.test(error.message),
  );
});

test("uploadImage rejects private network image URLs before fetch", async () => {
  let fetched = false;
  await assert.rejects(
    uploadImage({
      appId: "cli_test",
      url: "http://127.0.0.1/private.png",
    }, testEnv(), {
      fetch: async () => {
        fetched = true;
        throw new Error("unexpected");
      },
    }),
    (error) => error.status === 400 && /private network/.test(error.message),
  );
  assert.equal(fetched, false);
});

test("parseUploadImageRequest accepts multipart file upload", async () => {
  const form = new FormData();
  form.set("appId", "cli_test");
  form.set("image", new File([new Uint8Array([1, 2, 3])], "status.png", {
    type: "image/png",
  }));
  const request = new Request("https://gateway.example.com/upload_image", {
    method: "POST",
    body: form,
  });

  const payload = await parseUploadImageRequest(request);

  assert.equal(payload.appId, "cli_test");
  assert.equal(payload.file.name, "status.png");
  assert.equal(payload.file.size, 3);
});

test("uploadImage infers multipart octet-stream files from the extension", async () => {
  const requests = [];
  const requestLark = fakeRequestLark(requests, ["img_octet_stream"]);
  const result = await uploadImage({
    appId: "cli_test",
    file: new File([new Uint8Array([1, 2, 3])], "status.png", {
      type: "application/octet-stream",
    }),
  }, testEnv(), { requestLark });

  assert.equal(result.contentType, "image/png");
  assert.equal(result.imageKey, "img_octet_stream");
  assert.equal(requests.length, 1);
});

test("parseCardRequest maps multipart images to template variables", async () => {
  const form = new FormData();
  form.set("payload", JSON.stringify({
    appId: "cli_test",
    templateId: "ctp_test",
    receiveIdType: "email",
    receiveId: "name@example.com",
  }));
  form.set("imageMap", JSON.stringify([
    {
      variable: "cover_image",
    },
  ]));
  form.append("image", new File([new Uint8Array([1, 2, 3])], "cover.png", {
    type: "image/png",
  }));
  const request = new Request("https://gateway.example.com/send_card", {
    method: "POST",
    body: form,
  });

  const payload = await parseCardRequest(request);

  assert.equal(payload.images.length, 1);
  assert.equal(payload.images[0].variable, "cover_image");
  assert.equal(payload.images[0].file.name, "cover.png");
});

test("readJson enforces the actual body size without content-length", async () => {
  const request = new Request("https://gateway.example.com/upload_image", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"value":"too large"}'));
        controller.close();
      },
    }),
    duplex: "half",
  });

  await assert.rejects(
    readJson(request, 8),
    (error) => error.status === 413 && /too large/.test(error.message),
  );
});

test("validateSendPayload normalizes imageKey for image messages", () => {
  const payload = {
    appId: "cli_test",
    receiveIdType: "email",
    receiveId: "name@example.com",
    msgType: "image",
    content: {
      imageKey: "img_v2_test",
    },
  };

  validateSendPayload(payload);

  assert.equal(payload.content.image_key, "img_v2_test");
  assert.equal(payload.content.imageKey, undefined);
});

function testEnv(appId = "cli_test") {
  return {
    FEISHU_APPS_JSON: JSON.stringify({
      [appId]: {
        appId,
        appSecret: `secret_${Math.random()}`,
      },
    }),
  };
}

function fakeRequestLark(requests, imageKeys) {
  let imageIndex = 0;
  return async (appId, env, request) => {
    requests.push({ appId, env, request });
    assert.equal(request.url, "https://open.feishu.cn/open-apis/im/v1/images");
    const imageKey = imageKeys[imageIndex];
    imageIndex += 1;
    return {
      code: 0,
      msg: "success",
      data: {
        image_key: imageKey,
      },
    };
  };
}
