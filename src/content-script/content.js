import MarkdownIt from "markdown-it";
import Browser from "webextension-polyfill";
import hljs from "highlight.js";
import js_beautify from "js-beautify";

let textarea = document.querySelectorAll("#divnoselect textarea");

if (textarea) {
  for (let i = 0; i < textarea.length; i++) {
    let cur = textarea[i];
    if (cur.style.display !== "none") {
      cur.classList.add("getActualQuestion");
    }
    // else {
    //   cur.classList.add("fakeQuestion");
    // }
  }
}

let span = document.querySelectorAll("#divnoselect span");

if (span) {
  for (let i = 0; i < span.length; i++) {
    let cur = span[i];
    if (cur.style.display !== "none") {
      cur.classList.add("getActualQuestion");
    }
    // else {
    //   cur.classList.add("fakeQuestion");
    // }
  }
}

let question;
if (document.querySelector("#divnoselect textarea.getActualQuestion")) {
  question = document.querySelector("#divnoselect textarea.getActualQuestion").value;
} else if (document.querySelector("#divnoselect span.getActualQuestion")) {
  question = document.querySelector("#divnoselect span.getActualQuestion").innerText;
}

let q1, q2, q3, q4;

if (document.getElementById("lblExpression0")) {
  q1 = document.querySelector("#lblExpression0").innerText;
} else if (document.getElementById("lblAnswer0")) {
  q1 = document.getElementById("lblAnswer0").value;
}

if (document.getElementById("lblExpression1")) {
  q2 = document.querySelector("#lblExpression1").innerText;
} else if (document.getElementById("lblAnswer1")) {
  q2 = document.getElementById("lblAnswer1").value;
}

if (document.getElementById("lblExpression2")) {
  q3 = document.querySelector("#lblExpression2").innerText;
} else if (document.getElementById("lblAnswer2")) {
  q3 = document.getElementById("lblAnswer2").value;
}

if (document.getElementById("lblExpression3")) {
  q4 = document.querySelector("#lblExpression3").innerText;
} else if (document.getElementById("lblAnswer3")) {
  q4 = document.getElementById("lblAnswer3").value;
}

function scrollToBottom(element) {
  element.scrollTop = element.scrollHeight;
}

async function run(question) {
  const markdown = new MarkdownIt();
  const port = Browser.runtime.connect();

  const container = document.getElementById("gptAnswerContainer");
  const btnContainer = document.getElementById("btnContainer");
  container.className = "chat-gpt-container";
  container.innerHTML = '<p class="loading">Waiting for ChatGPT response...</p>';
  btnContainer.innerHTML = "";
  
  const regenerateButton = document.createElement("button");
  regenerateButton.id = "regenerateButton";
  regenerateButton.style.display = "none";
  regenerateButton.innerHTML = `
    <svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" class="regen-svg" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
    Regenerate Answer
  `;
  regenerateButton.addEventListener("click", () => {
    regenerateButton.disabled = true;
    run(question);
  });
  btnContainer.appendChild(regenerateButton);

  const stopButton = document.createElement("button");
  stopButton.id = "stopButton";
  stopButton.style.display = "none";
  stopButton.innerHTML = "Stop Generating";
  stopButton.addEventListener("click", () => {
    port.disconnect();
    setTimeout(() => {
      stopButton.style.display = "none";
      document.getElementById("regenerateButton").style.display = "block";
    }, 1000);
  });
  btnContainer.appendChild(stopButton);

  port.onMessage.addListener(function (msg) {
    console.log(msg)
    if (msg.response) {
      const answer = msg.response.message?.content?.parts?.[0];
      container.classList.add("answer");

      container.innerHTML = `
        <h5>Question:</h5>
        ${markdown.render(question)}
        <h5>Answer:</h5>
        ${markdown.render(answer)}
      `;
      hljs.highlightAll();
      scrollToBottom(container);
      
      const isCompleted = msg.response.message.end_turn === true;
      if (isCompleted) {
        stopButton.style.display = "none";
        regenerateButton.style.display = "block";
        regenerateButton.disabled = false;
      }
      else {
        stopButton.style.display = "block";
        regenerateButton.style.display = "none";
      }
    }
    else if (msg.error) {
      container.innerHTML = `<p class="gpt-error">Failed to load response from ChatGPT</p><pre>${js_beautify(msg.error, { indent_size: 2, space_in_empty_paren: true })}</pre>`;
      stopButton.style.display = "none";
      regenerateButton.style.display = "none";
    } else {
      container.innerHTML = "<p class='gpt-error'>Unknown Error!</p><p>Failed to load response from ChatGPT.</p>";
      stopButton.style.display = "none";
      regenerateButton.style.display = "none";
    }
  });

  port.postMessage({ question });
}

console.log("content script loaded");

// create modal
const openModal = document.createElement("button");
const getImageSrc = Browser.runtime.getURL("assets/48.png");
openModal.id = "openModalBtn1";
openModal.innerHTML = "Show Answer";
const myModal = document.createElement("div");
myModal.id = "myModal1";
myModal.className = "modal1";
myModal.innerHTML = `
  <div class="modal-header1">
    <span class="close1" title="Close to select answer">&times;</span>
    <div class="flex-head"><img src="${getImageSrc}" /><h3>ChatGPT For Vu Quiz</h3></div>
  </div>
  <div id="answerContainer1">
    <div id="gptAnswerContainer"></div>
    <div id="btnContainer"></div>
  </div>
`;

document.body.append(openModal, myModal);
const styleSheet = document.createElement("link");
styleSheet.rel = "stylesheet";
styleSheet.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/github.min.css";
document.head.appendChild(styleSheet);

var close = document.getElementsByClassName("close1")[0];

openModal.onclick = function () {
  const newLine = "\n \n";
  if (question) {
    if (!document.getElementById("gptAnswerContainer").classList.contains("answer")) {
      const mc = q1 && q2 && q3 && q4 ? q1 + newLine + q2 + newLine + q3 + newLine + q4 + newLine : "";
      // run("Show me the example of HTML CSS and JavaScript");
      run(question + newLine + mc);
    }
  } else {
    document.getElementById("gptAnswerContainer").innerHTML = "<p>Something went wrong!</p><p>Question not found on this page</p>";
  }
  myModal.classList.add("show");
};

close.onclick = function () {
  myModal.classList.remove("show");
};