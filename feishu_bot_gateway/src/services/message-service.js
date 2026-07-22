import { getDefaultReceiveId, getDefaultReceiveIdType } from "../config/apps.js";
import { getLarkClient, unwrapLarkResponse } from "./lark-client.js";
import { buildTemplateCardContent, parseTemplateCardContent } from "./card-content.js";

export async function sendMessage(payload, env) {
  const client = await getLarkClient(payload.appId, env);
  const res = await client.im.message.create({
    params: {
      receive_id_type: payload.receiveIdType,
    },
    data: {
      receive_id: payload.receiveId,
      msg_type: payload.msgType,
      content: JSON.stringify(payload.content),
    },
  });
  const data = unwrapLarkResponse(res, "feishu send message failed");
  return {
    messageId: data && data.message_id ? data.message_id : "",
    feishu: {
      code: 0,
      data,
    },
  };
}

export async function sendTemplateCard(payload, env) {
  if (payload.messageId) {
    return await updateTemplateCard(payload, env);
  }
  const client = await getLarkClient(payload.appId, env);
  const receiveIdType = payload.receiveIdType || getDefaultReceiveIdType(payload.appId, env);
  const receiveId = payload.receiveId || getDefaultReceiveId(payload.appId, env);
  let res;
  if (payload.content) {
    res = await client.im.message.create({
      params: {
        receive_id_type: receiveIdType,
      },
      data: {
        receive_id: receiveId,
        msg_type: "interactive",
        content: JSON.stringify(parseTemplateCardContent(payload.content)),
      },
    });
  } else {
    res = await client.im.message.createByCard({
      params: {
        receive_id_type: receiveIdType,
      },
      data: {
        receive_id: receiveId,
        template_id: payload.templateId,
        template_version_name: payload.templateVersionName || undefined,
        template_variable: payload.templateVariable || {},
      },
    });
  }
  const data = unwrapLarkResponse(res, "feishu send card failed");
  return {
    messageId: data && data.message_id ? data.message_id : "",
    feishu: {
      code: 0,
      data,
    },
  };
}

export async function updateTemplateCard(payload, env) {
  const client = await getLarkClient(payload.appId, env);
  const content = buildTemplateCardContent(payload);
  const res = await client.im.message.patch({
    path: {
      message_id: payload.messageId,
    },
    data: {
      content: JSON.stringify(content),
    },
  });
  const data = unwrapLarkResponse(res, "feishu update card failed");
  return {
    messageId: payload.messageId,
    feishu: {
      code: 0,
      data,
      msg: "ok",
    },
  };
}
