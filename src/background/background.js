import Browser from "webextension-polyfill";
import { GoogleGenerativeAI } from "@google/generative-ai";

function handleResponse(answer, port) {
  port.postMessage({ answer: answer, isCompleted: true });
}

// const generationConfig = {
// stopSequences: ["red"],
// maxOutputTokens: 100,
// temperature: 0.9,
// topP: 0.1,
// topK: 16,
// };

async function getAnswer(port, question) {
  const { apiKey } = await Browser.storage.local.get("apiKey");
  if (!apiKey) {
    console.error("API key is not set.");
    port.postMessage({ error: "API key is not set." });
    return;
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  // The Gemini 1.5 models are versatile and work with most use cases
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    // generationConfig
  });

  // without stream
  // const chat = model.startChat({
  //   generationConfig
  // });
  // const result = await chat.generateContent(question);
  // const response = await result.response;
  // const text = response.text();

  // with stream
  const result = await model.generateContentStream(question);

  let text = "";
  for await (const chunk of result.stream) {
    const chunkText = chunk.text();
    console.log(chunkText);
    text += chunkText;
    handleResponse(text, port);
  }
  console.log("text", text);
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
      }
    }
  });
});

Browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    Browser.tabs.create({ url: "demo.html" });
  }
});
