import ExpiryMap from "expiry-map";
import { v4 as uuidv4 } from "uuid";
import Browser from "webextension-polyfill";
import { fetchSSE } from "./fetch-sse";

const KEY_ACCESS_TOKEN = "accessToken";

const cache = new ExpiryMap(100 * 1000);

async function getAccessToken() {
  if (cache.get(KEY_ACCESS_TOKEN)) {
    return cache.get(KEY_ACCESS_TOKEN);
  }
  const resp = await fetch("https://chat.openai.com/api/auth/session");
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

async function getAnswer(port, question) {
  const accessToken = await getAccessToken();

  const controller = new AbortController();
  port.onDisconnect.addListener(() => {
    console.log("Port disconnected by the user");
    controller.abort();
  });

  await fetchSSE("https://chat.openai.com/backend-api/conversation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action: "next",
      messages: [
        {
          id: uuidv4(),
          role: "user",
          content: {
            content_type: "text",
            parts: [question],
          },
        },
      ],
      model: "text-davinci-002-render",
      parent_message_id: uuidv4(),
    }),
    signal: controller.signal,
    onMessage(message) {
      console.debug("sse message received");
      if (message === "[DONE]") {
        return;
      }
      let data;
      try {
        data = JSON.parse(message);
      } catch (err) {
        if (err.message === "The user aborted a request.") {
          console.log("The user aborted a request.");
        } else {
          port.postMessage({ error: err.message });
          cache.delete(KEY_ACCESS_TOKEN);
        }
      }
      if (data) {
        port.postMessage({ response: data });
      }
    }
  });
}

Browser.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener(async (msg) => {
    console.log("received msg", msg);
    try {
      await getAnswer(port, msg.question);
    } catch (err) {
      if (err.message === "The user aborted a request.") {
        console.log("The user aborted a request.");
      } else {
        port.postMessage({ error: err.message });
        cache.delete(KEY_ACCESS_TOKEN);
      }
    }
  });
});


Browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    Browser.tabs.create({ url: "demo.html" });
  }
});