import ExpiryMap from "expiry-map";
import { v4 as uuidv4 } from "uuid";
import Browser from "webextension-polyfill";
import { fetchSSE } from "./fetch-sse";

const KEY_ARKOSE_TOKEN = "arkoseToken";

const cache = new ExpiryMap(100 * 1000);

async function getArkoseToken() {
  try {
    
    if (cache.get(KEY_ARKOSE_TOKEN)) {
      return cache.get(KEY_ARKOSE_TOKEN);
    }
    const resp = await fetch("https://chat.openai.com/backend-anon/sentinel/chat-requirements", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const data = await resp.json();
    cache.set(KEY_ARKOSE_TOKEN, data.token);
    return data.token;
  } catch (error) {
    throw new Error("error", error?.message);
  }
}

async function getAnswer(port, question) {
  console.clear();
  const arkoseToken = await getArkoseToken();

  const controller = new AbortController();
  port.onDisconnect.addListener(() => {
    console.log("Port disconnected by the user");
    controller.abort();
  });

  await fetchSSE("https://chat.openai.com/backend-anon/conversation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "openai-sentinel-chat-requirements-token": arkoseToken,
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
      model: "text-davinci-002-render-sha",
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
        console.debug("Error parsing SSE message", err);
        cache.delete(KEY_ARKOSE_TOKEN);
        return;
      }
      if (data) {
        port.postMessage({ response: data });
      }
    }
  });
}


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
        cache.delete(KEY_ARKOSE_TOKEN);
      }
    }
  });
});


Browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    Browser.tabs.create({ url: "demo.html" });
  }
});