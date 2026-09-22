// ai-assistant.js
// Shared AI assistant for index.html, history.html, realtime_status.html.
// Keeps the existing app.js untouched to avoid global-const collisions.

(() => {
  const AI_CHAT_STORAGE_KEY = "bleMesh.aiChatHistory.v1";
  const AI_ANOMALY_SIGNATURE_KEY = "bleMesh.aiLastAnomalySignature.v1";
  const AI_CHAT_MAX_MESSAGES = 100;
  const AI_WELCOME_MESSAGE =
    "你好！我是 Jetson LLM 設備助理。您可以問我關於廁所環境狀況、衛生紙或洗手液補充提醒！";

  // Use the same backend as the existing project.
  const AI_API_BASE = "https://api.mesh-wc.xyz";

  let initialized = false;
  let aiChatHistory = [];
  let anomalyPolling = false;
  let lastAnomalySignature = "";

  function readChatHistory() {
    try {
      const raw = localStorage.getItem(AI_CHAT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(item => item && typeof item.text === "string")
        .map(item => ({
          text: item.text,
          sender: item.sender === "user" ? "user" : "bot",
          extraClass: item.extraClass === "alert" ? "alert" : "",
          ts: Number(item.ts) || Date.now()
        }))
        .slice(-AI_CHAT_MAX_MESSAGES);
    } catch (err) {
      console.warn("無法讀取 AI 對話：", err);
      return [];
    }
  }

  function saveChatHistory() {
    try {
      aiChatHistory = aiChatHistory.slice(-AI_CHAT_MAX_MESSAGES);
      localStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(aiChatHistory));
    } catch (err) {
      console.warn("無法保存 AI 對話：", err);
    }
  }

  function init() {
    if (initialized) return;

    const layout = document.querySelector(".dashboard-layout");
    const aiContent = document.querySelector(".ai-content");
    const aiOpenBtn = document.getElementById("ai-open");
    const aiCloseBtn = document.getElementById("ai-close");
    const aiClearBtn = document.getElementById("ai-clear");
    const chatMessages = document.getElementById("chat-messages");
    const chatInput = document.getElementById("chat-input");
    const chatSend = document.getElementById("chat-send");
    const aiStatusDot = document.getElementById("ai-status-dot");
    const aiStatusText = document.getElementById("ai-status-text");

    // Not an AI-enabled page.
    if (!layout || !aiContent || !chatMessages || !chatInput || !chatSend) return;
    initialized = true;

    function setAiExpanded(expanded) {
      layout.classList.toggle("ai-expanded", expanded);
      aiContent.setAttribute("aria-hidden", expanded ? "false" : "true");
      if (expanded) window.setTimeout(() => chatInput.focus(), 260);
    }

    function setLlmStatus(state, label) {
      if (aiStatusDot) {
        aiStatusDot.classList.remove("busy", "offline");
        if (state === "busy") aiStatusDot.classList.add("busy");
        if (state === "offline") aiStatusDot.classList.add("offline");
      }
      if (aiStatusText) aiStatusText.textContent = label;
    }

    function setChatBusy(isBusy) {
      chatInput.disabled = isBusy;
      chatSend.disabled = isBusy;
      chatSend.textContent = isBusy ? "分析中…" : "發送";
    }

    function appendMessage(text, sender = "bot", extraClass = "", persist = true) {
      const safeSender = sender === "user" ? "user" : "bot";
      const safeExtraClass =
        extraClass === "alert" || extraClass === "loading" ? extraClass : "";

      const msg = document.createElement("div");
      msg.className =
        `chat-msg ${safeSender}${safeExtraClass ? ` ${safeExtraClass}` : ""}`;
      msg.innerText = String(text ?? "");
      chatMessages.appendChild(msg);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      if (persist && safeExtraClass !== "loading") {
        aiChatHistory.push({
          text: String(text ?? ""),
          sender: safeSender,
          extraClass: safeExtraClass === "alert" ? "alert" : "",
          ts: Date.now()
        });
        saveChatHistory();
      }

      return msg;
    }

    function restoreChatHistory() {
      chatMessages.innerHTML = "";
      aiChatHistory = readChatHistory();

      if (!aiChatHistory.length) {
        appendMessage(AI_WELCOME_MESSAGE, "bot", "", true);
        return;
      }

      aiChatHistory.forEach(item => {
        appendMessage(item.text, item.sender, item.extraClass, false);
      });

      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function clearChatHistory() {
      aiChatHistory = [];
      try {
        localStorage.removeItem(AI_CHAT_STORAGE_KEY);
      } catch (_) {}

      chatMessages.innerHTML = "";
      appendMessage(AI_WELCOME_MESSAGE, "bot", "", true);
    }

    async function askJetsonLLM(query) {
      const response = await fetch(`${AI_API_BASE}/api/llm/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });

      let data;
      try {
        data = await response.json();
      } catch (_) {
        throw new Error(`LLM API 回傳格式錯誤 (HTTP ${response.status})`);
      }

      if (!response.ok) {
        throw new Error(data?.message || `LLM API 錯誤 (HTTP ${response.status})`);
      }

      return data;
    }

    async function handleUserSend() {
      const text = chatInput.value.trim();
      if (!text || chatSend.disabled) return;

      setAiExpanded(true);
      appendMessage(text, "user");
      chatInput.value = "";
      setChatBusy(true);
      setLlmStatus("busy", "Jetson LLM 分析中...");

      const loadingBubble = appendMessage(
        "正在調閱感測與歷史資料並生成分析…",
        "bot",
        "loading",
        false
      );

      try {
        const data = await askJetsonLLM(text);
        loadingBubble?.remove();

        if (data.status === "success") {
          appendMessage(
            data.report || "AI 已完成分析，但沒有回傳文字報告。",
            "bot"
          );
          setLlmStatus("online", "Jetson LLM 在線中");
        } else {
          appendMessage(
            `分析失敗：${data.message || "後端未提供錯誤原因"}`,
            "bot",
            "alert"
          );
          setLlmStatus("online", "Jetson LLM 已連線");
        }
      } catch (err) {
        loadingBubble?.remove();
        appendMessage(
          `無法連接 AI 服務：${err.message || "網路連線錯誤"}`,
          "bot",
          "alert"
        );
        setLlmStatus("offline", "Jetson LLM 無法連線");
        console.error("LLM query error:", err);
      } finally {
        setChatBusy(false);
        chatInput.focus();
      }
    }

    async function pollLlmAnomaly() {
      if (anomalyPolling) return;
      anomalyPolling = true;

      try {
        const response = await fetch(`${AI_API_BASE}/api/llm/anomaly`, {
          cache: "no-store"
        });

        let data;
        try {
          data = await response.json();
        } catch (_) {
          throw new Error(`異常 API 回傳格式錯誤 (HTTP ${response.status})`);
        }

        if (!response.ok) {
          throw new Error(
            data?.message || `異常 API 錯誤 (HTTP ${response.status})`
          );
        }

        setLlmStatus("online", "Jetson LLM 在線中");

        if (data.has_anomaly && data.report) {
          const signature = String(data.id || data.timestamp || data.report);

          if (signature !== lastAnomalySignature) {
            lastAnomalySignature = signature;

            try {
              localStorage.setItem(AI_ANOMALY_SIGNATURE_KEY, signature);
            } catch (_) {}

            setAiExpanded(true);
            appendMessage(
              `🚨 AI 異常診斷警報\n\n${data.report}`,
              "bot",
              "alert"
            );
          }
        } else if (!data.has_anomaly) {
          lastAnomalySignature = "";
          try {
            localStorage.removeItem(AI_ANOMALY_SIGNATURE_KEY);
          } catch (_) {}
        }
      } catch (err) {
        setLlmStatus("offline", "Jetson LLM 無法連線");
        console.error("LLM anomaly polling error:", err);
      } finally {
        anomalyPolling = false;
      }
    }

    aiOpenBtn?.addEventListener("click", () => setAiExpanded(true));
    aiCloseBtn?.addEventListener("click", () => setAiExpanded(false));

    aiClearBtn?.addEventListener("click", () => {
      if (!window.confirm("確定要清除所有已保存的 AI 對話嗎？")) return;
      clearChatHistory();
      chatInput.focus();
    });

    chatSend.addEventListener("click", handleUserSend);

    chatInput.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        handleUserSend();
      }
    });

    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && layout.classList.contains("ai-expanded")) {
        setAiExpanded(false);
        aiOpenBtn?.focus();
      }
    });

    restoreChatHistory();
    setAiExpanded(false);

    try {
      lastAnomalySignature =
        localStorage.getItem(AI_ANOMALY_SIGNATURE_KEY) || "";
    } catch (_) {}

    pollLlmAnomaly();
    setInterval(pollLlmAnomaly, 5000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
