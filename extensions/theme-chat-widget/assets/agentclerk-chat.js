(function () {
  "use strict";

  const root = document.getElementById("agentclerk-chat-root");
  if (!root) return;

  const config = {
    shop: root.dataset.shop || "",
    proxyUrl: root.dataset.proxyUrl || "/apps/agentclerk/chat",
    position: root.dataset.position || "bottom-right",
    buttonLabel: root.dataset.buttonLabel || "Get Help",
    primaryColor: root.dataset.primaryColor || "#5C6AC4",
  };

  let sessionId = sessionStorage.getItem("agentclerk_session");
  if (!sessionId) {
    sessionId = "ac-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
    sessionStorage.setItem("agentclerk_session", sessionId);
  }

  let isOpen = false;
  let messages = [];
  let isLoading = false;

  // Create widget DOM
  function createWidget() {
    const positionStyles =
      config.position === "bottom-left"
        ? "left: 20px; right: auto;"
        : "right: 20px; left: auto;";

    // Toggle button
    const toggleBtn = document.createElement("button");
    toggleBtn.id = "agentclerk-toggle";
    toggleBtn.className = "agentclerk-toggle";
    toggleBtn.setAttribute("style", positionStyles);
    toggleBtn.innerHTML =
      '<span class="agentclerk-toggle-label">' +
      escapeHtml(config.buttonLabel) +
      "</span>";
    toggleBtn.style.backgroundColor = config.primaryColor;
    toggleBtn.addEventListener("click", toggleChat);

    // Chat window
    const chatWindow = document.createElement("div");
    chatWindow.id = "agentclerk-window";
    chatWindow.className = "agentclerk-window agentclerk-hidden";
    chatWindow.setAttribute("style", positionStyles);

    chatWindow.innerHTML =
      '<div class="agentclerk-header" style="background-color: ' +
      escapeHtml(config.primaryColor) +
      '">' +
      '  <span class="agentclerk-header-title">AgentClerk</span>' +
      '  <button class="agentclerk-close" aria-label="Close">&times;</button>' +
      "</div>" +
      '<div class="agentclerk-messages" id="agentclerk-messages"></div>' +
      '<div class="agentclerk-input-area">' +
      '  <input type="text" id="agentclerk-input" placeholder="Type a message..." autocomplete="off" />' +
      '  <button id="agentclerk-send" style="background-color: ' +
      escapeHtml(config.primaryColor) +
      '">Send</button>' +
      "</div>";

    document.body.appendChild(toggleBtn);
    document.body.appendChild(chatWindow);

    // Event listeners
    chatWindow
      .querySelector(".agentclerk-close")
      .addEventListener("click", toggleChat);

    const sendBtn = document.getElementById("agentclerk-send");
    const inputEl = document.getElementById("agentclerk-input");

    sendBtn.addEventListener("click", sendMessage);
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter") sendMessage();
    });
  }

  function toggleChat() {
    isOpen = !isOpen;
    const window = document.getElementById("agentclerk-window");
    const toggle = document.getElementById("agentclerk-toggle");

    if (isOpen) {
      window.classList.remove("agentclerk-hidden");
      toggle.classList.add("agentclerk-hidden");
      document.getElementById("agentclerk-input").focus();
    } else {
      window.classList.add("agentclerk-hidden");
      toggle.classList.remove("agentclerk-hidden");
    }
  }

  function addMessage(role, content) {
    messages.push({ role: role, content: content });
    renderMessages();
  }

  function renderMessages() {
    const container = document.getElementById("agentclerk-messages");
    container.innerHTML = "";

    messages.forEach(function (msg) {
      const div = document.createElement("div");
      div.className = "agentclerk-msg agentclerk-msg-" + msg.role;
      div.textContent = msg.content;
      container.appendChild(div);
    });

    if (isLoading) {
      const loader = document.createElement("div");
      loader.className = "agentclerk-msg agentclerk-msg-assistant agentclerk-loading";
      loader.innerHTML = '<span class="agentclerk-dots"><span>.</span><span>.</span><span>.</span></span>';
      container.appendChild(loader);
    }

    container.scrollTop = container.scrollHeight;
  }

  async function sendMessage() {
    const input = document.getElementById("agentclerk-input");
    const message = input.value.trim();
    if (!message || isLoading) return;

    input.value = "";
    addMessage("user", message);
    isLoading = true;
    renderMessages();

    try {
      const url =
        config.proxyUrl +
        "?shop=" +
        encodeURIComponent(config.shop);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message,
          sessionId: sessionId,
        }),
      });

      const data = await response.json();

      isLoading = false;
      addMessage("assistant", data.reply || "Sorry, I could not process that.");

      // Handle checkout URL
      if (data.checkoutUrl) {
        addMessage(
          "assistant",
          "Here is your checkout link: " + data.checkoutUrl
        );
      }
    } catch (err) {
      isLoading = false;
      addMessage("assistant", "Sorry, something went wrong. Please try again.");
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // Initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createWidget);
  } else {
    createWidget();
  }
})();
