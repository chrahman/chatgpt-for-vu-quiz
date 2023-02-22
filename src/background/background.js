import ExpiryMap from "expiry-map";
import { v4 as uuidv4 } from "uuid";
import Browser from "webextension-polyfill";
import { fetchSSE } from "./fetch-sse";

Browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    Browser.tabs.create({ url: "demo.html" });
  }
});

const KEY_ACCESS_TOKEN = "accessToken";

const cache = new ExpiryMap(10 * 1000);

async function getAccessToken() {
  if (cache.get(KEY_ACCESS_TOKEN)) {
    return cache.get(KEY_ACCESS_TOKEN);
  }
  const resp = await fetch("https://chat.openai.com/api/auth/session")
    .then((r) => r.json())
    .catch(() => ({}));
  if (!resp.accessToken) {
    throw new Error("UNAUTHORIZED");
  }
  cache.set(KEY_ACCESS_TOKEN, resp.accessToken);
  return resp.accessToken;
}

async function getAnswer(question, callback, abortController) {
  const accessToken = await getAccessToken();
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
    onMessage(message) {
      console.debug("sse message", message);
      if (message === "[DONE]") {
        return;
      }
      let data;
      try {
        data = JSON.parse(message);
      } catch (error) {
        console.debug("json error", error);
        cache.delete(KEY_ACCESS_TOKEN);
        return;
      }
      if (data) {
        callback(data);
      }
    },
    signal: abortController.signal,
  });
}

Browser.runtime.onConnect.addListener((port) => {
  let abortController = new AbortController();
  port.onMessage.addListener(async (msg) => {
    console.log("received msg", msg);
    try {
      await getAnswer(msg.question, (response) => {
        port.postMessage({ response });
        console.log("answer recived");
      }, abortController);
    } catch (err) {
      if (err.message === "The user aborted a request.") {
        console.log("Abort Error: The user aborted a request.");
      } else {
        // console.log(err);
        port.postMessage({ error: err.message });
        cache.delete(KEY_ACCESS_TOKEN);
      }
    }
  });
  port.onDisconnect.addListener(() => {
    console.log("port disconnected");
    if (abortController) {
      abortController.abort();
      console.log("abort: controller aborted");
    }
  });
});
