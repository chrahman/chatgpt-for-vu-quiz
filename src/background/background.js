import ExpiryMap from "expiry-map";
import { v4 as uuidv4 } from "uuid";
import Browser from "webextension-polyfill";
import { fetchSSE } from "./fetch-sse";
import { sha3_512 } from "js-sha3";
import randomInt from "random-int";
import { Buffer } from "buffer";

const KEY_ACCESS_TOKEN = "accessToken";
const KEY_ARKOSE_TOKEN = "arkoseToken";
const cache = new ExpiryMap(100 * 1000);
const cacheArkose = new ExpiryMap(100 * 1000);
const session = {};
let websocket;

async function getAccessToken() {
  if (cache.get(KEY_ACCESS_TOKEN)) {
    return cache.get(KEY_ACCESS_TOKEN);
  }
  const resp = await fetch("https://chatgpt.com/api/auth/session");
  if (resp.status === 403) {
    throw new Error("CLOUDFLARE");
  }
  const data = await resp.json().catch(() => ({}));
  if (!data.accessToken) {
    throw new Error("UNAUTHORIZED");
  }
  cache.set(KEY_ACCESS_TOKEN, data.accessToken);
  return data.accessToken;
}

async function request(token, method, path, data) {
  const apiUrl = "https://chatgpt.com";
  const response = await fetch(`${apiUrl}/backend-api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  const responseText = await response.text();
  console.debug(`request: ${path}`, responseText);
  return { response, responseText };
}

export async function sendMessageFeedback(token, data) {
  await request(token, "POST", "/conversation/message_feedback", data);
}

export async function setConversationProperty(token, conversationId, propertyObject) {
  await request(token, "PATCH", `/conversation/${conversationId}`, propertyObject);
}

export async function deleteConversation(token, conversationId) {
  if (conversationId) await setConversationProperty(token, conversationId, { is_visible: false });
}

export async function sendModerations(token, question, conversationId, messageId) {
  await request(token, "POST", `/moderations`, {
    conversation_id: conversationId,
    input: question,
    message_id: messageId,
    model: "text-moderation-playground",
  });
}

export async function getRequirements(accessToken) {
  const response = JSON.parse((await request(accessToken, "POST", "/sentinel/chat-requirements")).responseText);
  if (response) {
    return response;
  }
}

function generateProofToken(seed, diff, userAgent) {
  const cores = [1, 2, 4];
  const screens = [3008, 4010, 6000];
  const reacts = ["_reactListeningcfilawjnerp", "_reactListening9ne2dfo1i47", "_reactListening410nzwhan2a"];
  const acts = ["alert", "ontransitionend", "onprogress"];

  const core = cores[randomInt(0, cores.length)];
  const screen = screens[randomInt(0, screens.length)] + core;
  const react = cores[randomInt(0, reacts.length)];
  const act = screens[randomInt(0, acts.length)];

  const parseTime = new Date().toString();

  const config = [
    screen,
    parseTime,
    4294705152,
    0,
    userAgent,
    "https://tcr9i.chat.openai.com/v2/35536E1E-65B4-4D96-9D97-6ADB7EFF8147/api.js",
    "dpl=1440a687921de39ff5ee56b92807faaadce73f13",
    "en",
    "en-US",
    4294705152,
    "plugins−[object PluginArray]",
    react,
    act,
  ];

  const diffLen = diff.length;

  for (let i = 0; i < 20000; i++) {
    config[3] = i;
    const jsonData = JSON.stringify(config);
    // eslint-disable-next-line no-undef
    const base = Buffer.from(jsonData).toString("base64");
    const hashValue = sha3_512.create().update(seed + base);

    if (hashValue.hex().substring(0, diffLen) <= diff) {
      const result = "gAAAAAB" + base;
      return result;
    }
  }

  // eslint-disable-next-line no-undef
  const fallbackBase = Buffer.from(`"${seed}"`).toString("base64");
  return "gAAAAABwQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4D" + fallbackBase;
}

export async function isNeedWebsocket(accessToken) {
  return (await request(accessToken, "GET", "/accounts/check/v4-2023-04-27")).responseText.includes("shared_websocket");
}

export async function sendWebsocketConversation(accessToken, options) {
  const apiUrl = "https://chatgpt.com";
  const response = await fetch(`${apiUrl}/backend-api/conversation`, options).then((r) => r.json());
  console.debug(`request: ws /conversation`, response);
  return {
    conversationId: response.conversation_id,
    wsRequestId: response.websocket_request_id,
  };
}

export async function stopWebsocketConversation(accessToken, conversationId, wsRequestId) {
  await request(accessToken, "POST", "/stop_conversation", {
    conversation_id: conversationId,
    websocket_request_id: wsRequestId,
  });
}

let expires_at;
let wsCallbacks = [];

export async function registerWebsocket(accessToken) {
  if (websocket && new Date() < expires_at - 300000) return;

  const response = JSON.parse((await request(accessToken, "POST", "/register-websocket")).responseText);
  let resolve;
  if (response.wss_url) {
    websocket = new WebSocket(response.wss_url);
    websocket.onopen = () => {
      console.debug("global websocket opened");
      resolve();
    };
    websocket.onclose = () => {
      websocket = null;
      expires_at = null;
      console.debug("global websocket closed");
    };
    websocket.onmessage = (event) => {
      wsCallbacks.forEach((cb) => cb(event));
    };
    expires_at = new Date(response.expires_at);
  }
  return new Promise((r) => (resolve = r));
}

let answer = "";
let generationPrefixAnswer = "";
let generatedImageUrl = "";

function handleMessage(data, port) {
  if (data.error) {
    port.postMessage({
      error: data.error,
      // isCompleted: data?.message?.end_turn ?? false,
      isCompleted: false,
    });
  }

  if (data.conversation_id) session.conversationId = data.conversation_id;
  if (data.message?.id) session.parentMessageId = data.message.id;

  const respAns = data.message?.content?.parts?.[0];
  const contentType = data.message?.content?.content_type;
  if (contentType === "text" && respAns) {
    answer = generationPrefixAnswer + (generatedImageUrl && `\n\n![](${generatedImageUrl})\n\n`) + respAns;
  } else if (contentType === "code" && data.message?.status === "in_progress") {
    const generationText = "\n\n" + t("Generating...");
    if (answer && !answer.endsWith(generationText)) generationPrefixAnswer = answer;
    answer = generationPrefixAnswer + generationText;
  } else if (contentType === "multimodal_text" && respAns?.content_type === "image_asset_pointer") {
    const imageAsset = respAns?.asset_pointer || "";
    if (imageAsset) {
      fetch(`${config.customChatGptWebApiUrl}/backend-api/files/${imageAsset.replace("file-service://", "")}/download`, {
        credentials: "include",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(cookie && { Cookie: cookie }),
        },
      }).then((r) => r.json().then((json) => (generatedImageUrl = json?.download_url)));
    }
  }

  if (answer) {
    port.postMessage({
      answer: data?.message?.content?.parts[0],
      // isCompleted: data?.message?.end_turn ?? false,
      isCompleted: false,
    });
  }
}

function finishMessage(question, port) {
  console.debug("conversation history", {
    content: session.conversationRecords,
  });
  port.postMessage({ answer: answer, isCompleted: true, session: session });
}

async function getAnswer(port, question) {
  // console.clear();
  const accessToken = await getAccessToken();
  let conversationID;

  const controller = new AbortController();
  port.onDisconnect.addListener(() => {
    console.log("Port disconnected by the user");
    controller.abort();
    stopWebsocketConversation(accessToken, conversationID, session.wsRequestId);
    deleteConversation(accessToken, conversationID);
  });

  // const [requirements, useWebsocket] = await Promise.all([getRequirements(accessToken).catch(() => undefined), isNeedWebsocket(accessToken).catch(() => undefined)]);
  const requirements = await getRequirements(accessToken).catch(() => undefined);
  const usedModel = "text-davinci-002-render-sha";

  let proofToken;

  console.log("requirements", requirements);
  console.time();
  if (requirements?.proofofwork?.required) {
    proofToken = generateProofToken(requirements.proofofwork.seed, requirements.proofofwork.difficulty, navigator.userAgent);
  }
  console.timeEnd();

  let cookie;
  let oaiDeviceId;
  // if (Browser.cookies && Browser.cookies.getAll) {
  //   cookie = (await Browser.cookies.getAll({ url: "https://chatgpt.com/" }))
  //     .map((cookie) => {
  //       return `${cookie.name}=${cookie?.value}`;
  //     })
  //     .join("; ");
  //   oaiDeviceId = (
  //     await Browser.cookies.get({
  //       url: "https://chatgpt.com/",
  //       name: "oai-did",
  //     })
  //   )?.value;
  // }

  session.messageId = uuidv4();
  session.wsRequestId = uuidv4();
  if (session.parentMessageId == null) {
    session.parentMessageId = uuidv4();
  }
  const options = {
    method: "POST",
    signal: controller.signal,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      // ...(cookie && { Cookie: cookie }),
      ...(requirements?.arkose?.required && { "Openai-Sentinel-Arkose-Token": requirements?.arkose?.dx }),
      ...(requirements && {
        "Openai-Sentinel-Chat-Requirements-Token": requirements?.token,
      }),
      ...(proofToken && { "Openai-Sentinel-Proof-Token": proofToken }),
      ...(requirements?.turnstile?.required && { "Openai-Sentinel-Turnstile-Token": requirements?.turnstile?.dx }),
      // "Oai-Device-Id": oaiDeviceId,
      "Oai-Language": "en-US",
    },
    body: JSON.stringify({
      action: "next",
      conversation_id: session.conversationId || undefined,
      messages: [
        {
          id: session.messageId,
          author: {
            role: "user",
          },
          content: {
            content_type: "text",
            parts: [question],
          },
          metadata: {},
        },
      ],
      conversation_mode: {
        kind: "primary_assistant",
      },
      force_paragen: false,
      force_rate_limit: false,
      suggestions: [],
      model: "auto",
      parent_message_id: session.parentMessageId,
      timezone_offset_min: new Date().getTimezoneOffset(),
      history_and_training_disabled: false,
      force_nulligen: false,
      force_paragen_model_slug: "",
      force_use_sse: true,
      reset_rate_limits: false,
      // websocket_request_id: session.wsRequestId,
    }),
  };

  // if (useWebsocket) {
  // await registerWebsocket(accessToken);
  // const wsCallback = async (event) => {
  //   let wsData;
  //   try {
  //     wsData = JSON.parse(event.data);
  //   } catch (error) {
  //     console.debug("json error", error);
  //     return;
  //   }
  //   if (wsData.type === "http.response.body") {
  //     let body;
  //     try {
  //       body = atob(wsData.body).replace(/^data:/, "");
  //       const data = JSON.parse(body);
  //       console.debug("ws message", data);
  //       if (wsData.conversation_id === session.conversationId) {
  //         console.log("data ws", data);
  //         handleMessage(data, port);
  //       }
  //     } catch (error) {
  //       if (body && body.trim() === "[DONE]") {
  //         console.debug("ws message", "[DONE]");
  //         if (wsData.conversation_id === session.conversationId) {
  //           finishMessage(question, port);
  //           wsCallbacks = wsCallbacks.filter((cb) => cb !== wsCallback);
  //         }
  //       } else {
  //         console.debug("json error", error);
  //       }
  //     }
  //   }
  // };
  // wsCallbacks.push(wsCallback);
  // const { conversationId, wsRequestId } = await sendWebsocketConversation(accessToken, options);
  // session.conversationId = conversationId;
  // session.wsRequestId = wsRequestId;
  // port.postMessage({ session: session });
  // } else {
  await fetchSSE("https://chatgpt.com/backend-api/conversation", {
    ...options,
    onMessage(message) {
      console.debug("sse message received");
      if (message === "[DONE]") {
        return;
      }
      let data;
      try {
        data = JSON.parse(message);
        conversationID = data.conversation_id;
      } catch (err) {
        port.postMessage({ error: "Error parsing SSE message" });
        console.debug("Error parsing SSE message", err);
        cache.delete(KEY_ACCESS_TOKEN);
        cacheArkose.delete(KEY_ARKOSE_TOKEN);
        return;
      }
      if (data) {
        port.postMessage({
          answer: data?.message?.content?.parts[0],
          isCompleted: data?.message?.status === "finished_successfully",
        });
      }
    },
  });
  deleteConversation(accessToken, conversationID);
  // }
}

// // Delete the conversation after it's done
// async function deleteConversation(accessToken, conversationID) {
//   try {
//     const resp = await fetch(
//       `https://chatgpt.com/backend-api/conversation/${conversationID}`,
//       {
//         method: "PATCH",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${accessToken}`,
//         },
//         body: JSON.stringify({ is_visible: false }),
//       }
//     );
//     const data = await resp.json();
//     console.log("Conversation deleted", data);
//   } catch (err) {
//     console.error("Error deleting conversation", err);
//   }
// }

Browser.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener(async (msg) => {
    console.log("Question msg received", msg);
    try {
      await getAnswer(port, msg.question);
    } catch (err) {
      if (err.message === "The user aborted a request.") {
        console.log("The user aborted a request.");
      } else {
        port.postMessage({ error: err.message });
        cache.delete(KEY_ACCESS_TOKEN);
        cacheArkose.delete(KEY_ARKOSE_TOKEN);
      }
    }
  });
});

Browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    Browser.tabs.create({ url: "demo.html" });
  }
});
