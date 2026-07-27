import assert from "node:assert/strict";
import test from "node:test";

import { uploadCardImages } from "../src/services/image-service.js";
import {
  fillMissingTemplateSchemaImages,
  templateSchemaEnvNames,
  validateTemplateSchemaVariables,
} from "../src/validators/template-schema.js";

const wxreadTemplateSchema = {
  schema: "2.0",
  config: {
    update_multi: true,
    locales: [
      "en_us",
    ],
    style: {
      text_size: {
        normal_v2: {
          default: "normal",
          pc: "normal",
          mobile: "heading",
        },
      },
    },
  },
  body: {
    direction: "vertical",
    padding: "12px 12px 12px 12px",
    elements: [
      {
        tag: "markdown",
        content: "${content}",
        text_align: "left",
        text_size: "normal_v2",
        margin: "0px 0px 0px 0px",
      },
      {
        tag: "img",
        img_key: "${content_image}",
        preview: true,
        transparent: false,
        scale_type: "fit_horizontal",
        margin: "0px 0px 0px 0px",
      },
      {
        tag: "hr",
        margin: "0px 0px 0px 0px",
      },
      {
        tag: "markdown",
        content: "${foot}",
        text_align: "left",
        text_size: "normal_v2",
        margin: "0px 0px 0px 0px",
      },
      {
        tag: "column_set",
        horizontal_align: "left",
        columns: [
          {
            tag: "column",
            width: "weighted",
            elements: [
              {
                tag: "button",
                text: {
                  tag: "plain_text",
                  content: "${main_button_text}",
                },
                type: "primary_filled",
                width: "default",
                size: "medium",
                disabled: "${main_button}",
                disabled_tips: {
                  tag: "plain_text",
                  content: "${main_button_text}",
                },
                behaviors: [
                  {
                    type: "callback",
                    value: "${main_button_event}",
                  },
                ],
              },
              {
                tag: "button",
                text: {
                  tag: "plain_text",
                  content: "${sub_button_text}",
                },
                type: "default",
                width: "default",
                size: "medium",
                disabled: "${sub_button}",
                disabled_tips: {
                  tag: "plain_text",
                  content: "${sub_button_text}",
                },
                behaviors: [
                  {
                    type: "open_url",
                    default_url: "${sub_button_url}",
                    pc_url: "",
                    ios_url: "",
                    android_url: "",
                  },
                ],
              },
            ],
            direction: "horizontal",
            vertical_spacing: "8px",
            horizontal_align: "left",
            vertical_align: "top",
            weight: 1,
          },
        ],
        margin: "0px 0px 0px 0px",
      },
    ],
  },
  header: {
    title: {
      tag: "plain_text",
      content: "【${app_name}】${title}",
    },
    subtitle: {
      tag: "plain_text",
      content: "${sub_title}",
    },
    template: "${title_style}",
    padding: "12px 12px 12px 12px",
  },
};

test("validateTemplateSchemaVariables skips validation when schema env is missing", () => {
  validateTemplateSchemaVariables({
    templateId: "AAqWXbpoNRj3B",
    templateVariable: {
      main_button: "not boolean",
    },
  }, {});
});

test("validateTemplateSchemaVariables validates strong variables from configured schema", () => {
  const env = schemaEnv("AAqWXbpoNRj3B", wxreadTemplateSchema);

  assert.throws(
    () => validateTemplateSchemaVariables({
      templateId: "AAqWXbpoNRj3B",
      templateVariable: baseTemplateVariable(),
    }, env),
    /requires image variable content_image/,
  );
  assert.throws(
    () => validateTemplateSchemaVariables({
      templateId: "AAqWXbpoNRj3B",
      templateVariable: {
        ...baseTemplateVariable(),
        content_image: "img_v2_raw_string",
      },
    }, env),
    /image variable content_image must be an object/,
  );
  assert.throws(
    () => validateTemplateSchemaVariables({
      templateId: "AAqWXbpoNRj3B",
      templateVariable: {
        ...baseTemplateVariable(),
        content_image: {
          img_key: "img_v2_test",
        },
        main_button: "true",
      },
    }, env),
    /variable main_button must be boolean/,
  );
  assert.throws(
    () => validateTemplateSchemaVariables({
      templateId: "AAqWXbpoNRj3B",
      templateVariable: {
        ...baseTemplateVariable(),
        content_image: {
          img_key: "img_v2_test",
        },
        main_button_event: "noop",
      },
    }, env),
    /variable main_button_event must be object/,
  );
});

test("validateTemplateSchemaVariables accepts placeholder image injected from empty image source", async () => {
  const requests = [];
  const payload = {
    appId: "cli_test",
    templateId: "AAqWXbpoNRj3B",
    templateVariable: baseTemplateVariable(),
    images: [
      {
        variable: "content_image",
      },
    ],
  };

  const prepared = await uploadCardImages(payload, testEnv(), {
    requestLark: fakeRequestLark(requests, ["img_placeholder"]),
  });

  validateTemplateSchemaVariables(prepared.payload, schemaEnv("AAqWXbpoNRj3B", wxreadTemplateSchema));
  assert.deepEqual(prepared.payload.templateVariable.content_image, {
    img_key: "img_placeholder",
  });
  assert.equal(prepared.images[0].placeholder, true);
});

test("fillMissingTemplateSchemaImages auto-adds placeholder image entries for schema image variables", async () => {
  const requests = [];
  const appId = `cli_auto_placeholder_${Date.now()}`;
  const payload = fillMissingTemplateSchemaImages({
    appId,
    templateId: "AAqWXbpoNRj3B",
    templateVariable: baseTemplateVariable(),
  }, schemaEnv("AAqWXbpoNRj3B", wxreadTemplateSchema));

  assert.deepEqual(payload.images, [
    {
      variable: "content_image",
    },
  ]);

  const prepared = await uploadCardImages(payload, testEnv(appId), {
    requestLark: fakeRequestLark(requests, ["img_auto_placeholder"]),
  });

  validateTemplateSchemaVariables(prepared.payload, schemaEnv("AAqWXbpoNRj3B", wxreadTemplateSchema));
  assert.deepEqual(prepared.payload.templateVariable.content_image, {
    img_key: "img_auto_placeholder",
  });
  assert.equal(prepared.images[0].placeholder, true);
  assert.equal(requests.length, 1);
});

test("fillMissingTemplateSchemaImages does not duplicate existing image variables", () => {
  const env = schemaEnv("AAqWXbpoNRj3B", wxreadTemplateSchema);
  assert.deepEqual(fillMissingTemplateSchemaImages({
    templateId: "AAqWXbpoNRj3B",
    templateVariable: {
      content_image: {
        img_key: "img_v2_existing",
      },
    },
  }, env).images, undefined);

  assert.deepEqual(fillMissingTemplateSchemaImages({
    templateId: "AAqWXbpoNRj3B",
    images: [
      {
        variable: "content_image",
        base64: "data:image/png;base64,AQID",
      },
    ],
  }, env).images, [
    {
      variable: "content_image",
      base64: "data:image/png;base64,AQID",
    },
  ]);
});

test("fillMissingTemplateSchemaImages only adds image variables missing from input", () => {
  const schema = {
    body: {
      elements: [
        {
          tag: "img",
          img_key: "${content_image}",
        },
        {
          tag: "img",
          img_key: "${detail_image}",
        },
      ],
    },
  };
  const payload = fillMissingTemplateSchemaImages({
    templateId: "AAqTwoImages",
    images: [
      {
        variable: "content_image",
        base64: "data:image/png;base64,AQID",
      },
    ],
  }, schemaEnv("AAqTwoImages", schema));

  assert.deepEqual(payload.images, [
    {
      variable: "content_image",
      base64: "data:image/png;base64,AQID",
    },
    {
      variable: "detail_image",
    },
  ]);
});

test("validateTemplateSchemaVariables supports content template payloads", () => {
  const payload = {
    content: {
      type: "template",
      data: {
        template_id: "AAqWXbpoNRj3B",
        template_variable: {
          ...baseTemplateVariable(),
          content_image: {
            img_key: "img_v2_test",
          },
        },
      },
    },
  };

  validateTemplateSchemaVariables(payload, schemaEnv("AAqWXbpoNRj3B", wxreadTemplateSchema));
});

function baseTemplateVariable() {
  return {
    content: "正文",
    foot: "脚注",
    main_button: true,
    main_button_event: {
      action: "noop",
    },
    sub_button: false,
  };
}

function schemaEnv(templateId, schema) {
  return {
    [templateSchemaEnvNames(templateId)[0]]: JSON.stringify(schema),
  };
}

function testEnv(appId = "cli_test") {
  return {
    FEISHU_APPS_JSON: JSON.stringify({
      [appId]: {
        appId,
        appSecret: "secret",
      },
    }),
  };
}

function fakeRequestLark(requests, imageKeys) {
  let imageIndex = 0;
  return async (appId, env, request) => {
    requests.push({ appId, env, request });
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
