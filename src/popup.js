// import MarkdownIt from "markdown-it";
// import Browser from "webextension-polyfill";
// import hljs from "highlight.js";

// const form = document.getElementById("form");
// const input = document.getElementById("input");
// async function run(question) {
//   const markdown = new MarkdownIt();

//   const container = document.querySelector("#answer-container");
//   container.className = "chat-gpt-container";
//   container.innerHTML = '<p class="loading">Waiting for ChatGPT response...</p>';

//   const port = Browser.runtime.connect();
//   port.onMessage.addListener(function (msg) {
//     if (msg.answer) {
//       // console.log("answer", msg.answer)
//       container.innerHTML += `
//         <div class="question">${question}</div>
//         <div class="answer">${markdown.render(msg.answer)}</div>
//       `;
//       hljs.initHighlightingOnLoad();
//     } else if (msg.error === "UNAUTHORIZED") {
//       container.innerHTML =
//         '<p>Please login at <a href="https://chat.openai.com" target="_blank">chat.openai.com</a> first</p>';
//     } else {
//       container.innerHTML = "<p>Failed to load response from ChatGPT</p>";
//     }
//   });
//   port.postMessage({ question });
// }

// function isaQuestion(question) {
//   return question.endsWith("?");
// }

// // const searchInput = document.getElementsByName("q")[0];
// // if (searchInput && searchInput.value) {
// //   if (
// //     searchInput &&
// //     searchInput.value &&
// //     isaQuestion(searchInput.value.trim())
// //   ) {
// //     // only run on first page
// //     const startParam = new URL(location.href).searchParams.get("start") || "0";
// //     if (startParam === "0") {

// //     }
// //   }
// // }

// form.addEventListener("submit", (e) => {
//   e.preventDefault();
//   run(input.value);
// });

// document.getElementById("input").addEventListener("input", function () {
//   if (this.scrollHeight > 140) {
//     this.style.overflow = "auto";
//   } else {
//     this.style.overflow = "hidden";
//   }
//   this.style.height = "auto";
//   this.style.height = this.scrollHeight - 42 + "px";
// });
