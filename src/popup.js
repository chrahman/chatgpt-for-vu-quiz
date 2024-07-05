import Browser from "webextension-polyfill";

const { apiKey } = await Browser.storage.local.get("apiKey");

document.getElementById("inputApiKey").value = apiKey || "";

document.getElementById("inputApiKey").addEventListener("change", function (e) {
  const apiKey = e.target.value;
  Browser.storage.local.set({ apiKey: apiKey }).then(() => {
    console.log("API Key saved");
  });
});
