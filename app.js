/**
 * Coze Chatbot Frontend - Tối ưu, Thực dụng, Tinh gọn
 */

// Cấu hình Coze API (Được lưu trong LocalStorage)
const CONFIG = {
  apiKey: localStorage.getItem('coze_api_key') || '',
  botId: localStorage.getItem('coze_bot_id') || '',
  userId: localStorage.getItem('coze_user_id') || ('user_' + Math.random().toString(36).slice(2, 9)),
  apiUrl: '/api/coze' // Dùng Proxy cục bộ để tránh lỗi CORS
};
localStorage.setItem('coze_user_id', CONFIG.userId);

// Trạng thái ứng dụng
const STATE = {
  sessions: [],
  currentSessionId: null,
  isGenerating: false,
};

// Các phần tử DOM
const DOM = {
  sidebar: document.getElementById('sidebar'),
  sidebarBackdrop: document.getElementById('sidebar-backdrop'),
  btnOpenSidebar: document.getElementById('btn-open-sidebar'),
  btnCloseSidebar: document.getElementById('btn-close-sidebar'),
  btnNewChat: document.getElementById('btn-new-chat'),
  btnClearHistory: document.getElementById('btn-clear-history'),
  chatHistoryList: document.getElementById('chat-history-list'),
  currentChatTitle: document.getElementById('current-chat-title'),
  messagesContainer: document.getElementById('messages-container'),
  messagesWrapper: document.getElementById('messages-wrapper'),
  chatForm: document.getElementById('chat-form'),
  messageInput: document.getElementById('message-input'),
  btnSend: document.getElementById('btn-send'),

  // Settings Modal
  btnOpenSettings: document.getElementById('btn-open-settings'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  btnCancelSettings: document.getElementById('btn-cancel-settings'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  settingsModal: document.getElementById('settings-modal'),
  settingApiKey: document.getElementById('setting-api-key'),
  settingBotId: document.getElementById('setting-bot-id'),

  // Toast
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toast-message'),
};

/* ==========================================================
   1. Markdown & Syntax Highlighting
   ========================================================== */
function setupMarkdown() {
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      highlight: function (code, lang) {
        if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return (typeof hljs !== 'undefined') ? hljs.highlightAuto(code).value : code;
      },
      breaks: true,
      gfm: true
    });
  }
}

function cleanBotText(text) {
  if (!text) return "";
  return text
    .replace(/cancel_oauth[a-zA-Z0-9_\-]+/gi, '')
    .replace(/授权后即代表[^\n]*/g, '')
    .trim();
}

function renderMarkdown(raw) {
  const cleaned = cleanBotText(raw);
  if (typeof marked === 'undefined') return escapeHtml(cleaned);
  const html = marked.parse(cleaned);
  const div = document.createElement('div');
  div.innerHTML = html;

  // Xử lý code block với nút Copy
  div.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    const lang = code?.className.match(/language-(\w+)/)?.[1] || 'code';
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    wrapper.innerHTML = `
      <div class="code-block-header">
        <span class="uppercase font-mono">${lang}</span>
        <button class="code-copy-btn" onclick="copyCode(this)">
          <i data-lucide="copy" class="w-3.5 h-3.5"></i>
          <span>Sao chép</span>
        </button>
      </div>
    `;
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);
  });

  // Mở link an toàn, tự động loại bỏ link ủy quyền OAuth nếu bot có gửi kèm
  div.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (href.includes('accounts.google.com') || href.includes('oauth') || href.includes('coze.com/open/oauth')) {
      a.remove();
      return;
    }
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });

  return div.innerHTML;
}

window.copyCode = function (btn) {
  const codeEl = btn.closest('.code-block-wrapper')?.querySelector('code');
  if (!codeEl) return;
  navigator.clipboard.writeText(codeEl.innerText).then(() => {
    const span = btn.querySelector('span');
    span.innerText = 'Đã chép!';
    setTimeout(() => { span.innerText = 'Sao chép'; }, 2000);
  });
};

/* ==========================================================
   2. Quản lý phiên chat & LocalStorage
   ========================================================== */
function loadState() {
  try {
    const saved = localStorage.getItem('coze_chat_sessions');
    if (saved) STATE.sessions = JSON.parse(saved);
  } catch (e) { }

  if (!STATE.sessions || STATE.sessions.length === 0) {
    createNewSession("Đoạn chat mới", true);
  } else {
    STATE.currentSessionId = STATE.sessions[0].id;
  }
}

function saveState() {
  localStorage.setItem('coze_chat_sessions', JSON.stringify(STATE.sessions));
}

function getCurrentSession() {
  return STATE.sessions.find(s => s.id === STATE.currentSessionId);
}

function createNewSession(title = "Đoạn chat mới", isInitial = false) {
  const newSession = {
    id: 'chat_' + Date.now(),
    title: title,
    messages: [
      {
        id: 'msg_welcome',
        role: 'assistant',
        content: 'Xin chào! Tôi là trợ lý AI Coze của bạn. Hãy gửi tin nhắn để bắt đầu trò chuyện nhé! 🤖',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]
  };

  STATE.sessions.unshift(newSession);
  STATE.currentSessionId = newSession.id;
  saveState();

  if (!isInitial) {
    renderHistoryList();
    renderCurrentChat();
  }
  return newSession;
}

function selectSession(id) {
  if (STATE.currentSessionId === id || STATE.isGenerating) return;
  STATE.currentSessionId = id;
  renderHistoryList();
  renderCurrentChat();
  closeMobileSidebar();
}

function deleteSession(id, e) {
  if (e) e.stopPropagation();
  STATE.sessions = STATE.sessions.filter(s => s.id !== id);
  if (STATE.sessions.length === 0) {
    createNewSession("Đoạn chat mới");
  } else if (STATE.currentSessionId === id) {
    STATE.currentSessionId = STATE.sessions[0].id;
  }
  saveState();
  renderHistoryList();
  renderCurrentChat();
}

/* ==========================================================
   3. Render UI & Tin nhắn
   ========================================================== */
function renderHistoryList() {
  DOM.chatHistoryList.innerHTML = '';
  STATE.sessions.forEach(session => {
    const isActive = session.id === STATE.currentSessionId;
    const item = document.createElement('div');
    item.className = `group flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-xs font-medium transition ${isActive ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-gray-300 hover:bg-gray-800/60'
      }`;
    item.onclick = () => selectSession(session.id);
    item.innerHTML = `
      <div class="flex items-center gap-2 truncate min-w-0">
        <i data-lucide="${isActive ? 'message-square-more' : 'message-square'}" class="w-3.5 h-3.5 shrink-0"></i>
        <span class="truncate">${escapeHtml(session.title)}</span>
      </div>
      <button class="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 rounded transition" title="Xóa" onclick="deleteSession('${session.id}', event)">
        <i data-lucide="trash-2" class="w-3 h-3"></i>
      </button>
    `;
    DOM.chatHistoryList.appendChild(item);
  });
  if (window.lucide) window.lucide.createIcons();
}

function renderCurrentChat() {
  const session = getCurrentSession();
  if (!session) return;
  DOM.currentChatTitle.innerText = session.title;
  DOM.messagesWrapper.innerHTML = '';
  session.messages.forEach(msg => appendMessageToDOM(msg, false));
  scrollToBottom();
}

function appendMessageToDOM(msg, shouldScroll = true) {
  const isUser = msg.role === 'user';
  const row = document.createElement('div');
  row.className = `flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`;
  const timeStr = msg.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isUser) {
    row.innerHTML = `
      <div class="flex flex-col items-end max-w-[85%] sm:max-w-[75%]">
        <div class="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words">
          ${escapeHtml(msg.content)}
        </div>
        <span class="text-[10px] text-gray-500 mt-1 mr-1">${timeStr}</span>
      </div>
      <div class="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold shrink-0">U</div>
    `;
  } else {
    row.innerHTML = `
      <div class="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
        <i data-lucide="bot" class="w-4 h-4"></i>
      </div>
      <div class="flex flex-col items-start max-w-[90%] sm:max-w-[85%] min-w-0">
        <div class="bg-[#181a21] border border-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 text-gray-200 shadow-sm w-full">
          <div class="markdown-body" id="body_${msg.id}">${renderMarkdown(msg.content)}</div>
        </div>
        <span class="text-[10px] text-gray-500 mt-1 ml-1">${timeStr}</span>
      </div>
    `;
  }

  DOM.messagesWrapper.appendChild(row);
  if (window.lucide) window.lucide.createIcons();
  if (shouldScroll) scrollToBottom();
  return document.getElementById(`body_${msg.id}`);
}

function showLoadingIndicator() {
  const row = document.createElement('div');
  row.id = 'typing-indicator';
  row.className = 'flex gap-3 justify-start items-center';
  row.innerHTML = `
    <div class="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
      <i data-lucide="bot" class="w-4 h-4"></i>
    </div>
    <div class="bg-[#181a21] border border-gray-800 rounded-2xl px-4 py-3 flex items-center gap-1.5 shadow-sm">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  DOM.messagesWrapper.appendChild(row);
  if (window.lucide) window.lucide.createIcons();
  scrollToBottom();
}

function removeLoadingIndicator() {
  document.getElementById('typing-indicator')?.remove();
}

function scrollToBottom() {
  DOM.messagesContainer.scrollTop = DOM.messagesContainer.scrollHeight;
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.innerText = text;
  return d.innerHTML;
}

/* ==========================================================
   4. Gửi tin nhắn & Kết nối Coze API Streaming
   ========================================================== */
async function handleSendMessage(e) {
  if (e) e.preventDefault();
  const text = DOM.messageInput.value.trim();
  if (!text || STATE.isGenerating) return;

  const session = getCurrentSession();
  if (!session) return;

  // Cập nhật tiêu đề đoạn chat theo câu hỏi đầu tiên
  if (session.messages.length <= 1) {
    session.title = text.length > 25 ? text.slice(0, 25) + '...' : text;
    DOM.currentChatTitle.innerText = session.title;
    renderHistoryList();
  }

  // 1. Hiển thị tin nhắn người dùng
  const userMsg = {
    id: 'msg_' + Date.now(),
    role: 'user',
    content: text,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  session.messages.push(userMsg);
  saveState();
  appendMessageToDOM(userMsg);

  DOM.messageInput.value = '';
  DOM.messageInput.style.height = 'auto';
  updateSendButtonState();

  // 2. Chuẩn bị khung tin nhắn Bot & Hiện loading
  STATE.isGenerating = true;
  DOM.btnSend.disabled = true;
  showLoadingIndicator();

  const botMsg = {
    id: 'msg_' + Date.now(),
    role: 'assistant',
    content: '',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  try {
    // Chuẩn bị Headers và Payload
    const reqHeaders = { "Content-Type": "application/json" };
    if (CONFIG.apiKey) {
      reqHeaders["Authorization"] = `Bearer ${CONFIG.apiKey}`;
    }

    const reqPayload = {
      user_id: CONFIG.userId,
      stream: true,
      additional_messages: [{ role: "user", content: text, content_type: "text" }]
    };
    if (CONFIG.botId) {
      reqPayload.bot_id = CONFIG.botId;
    }

    // Nếu gọi trực tiếp api.coze.com (không qua /api/coze) thì bắt buộc phải có key ở frontend
    const isDirectCoze = CONFIG.apiUrl && CONFIG.apiUrl.startsWith('http') && !CONFIG.apiUrl.includes('/api/coze');
    if (isDirectCoze && (!CONFIG.apiKey || !CONFIG.botId)) {
      throw new Error("Chưa điền Personal Access Token hoặc Bot ID. Vui lòng bấm vào 'Cài đặt Bot' ở góc trên để cấu hình.");
    }

    // Gửi yêu cầu POST tới Coze API (qua Proxy /api/coze hoặc trực tiếp)
    let response;
    try {
      response = await fetch(CONFIG.apiUrl, {
        method: "POST",
        headers: reqHeaders,
        body: JSON.stringify(reqPayload)
      });
    } catch (netErr) {
      if (CONFIG.apiUrl !== '/api/coze') {
        // Fallback tự động qua /api/coze nếu gọi trực tiếp bị CORS
        response = await fetch('/api/coze', {
          method: "POST",
          headers: reqHeaders,
          body: JSON.stringify(reqPayload)
        });
      } else {
        throw new Error("Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại kết nối mạng.");
      }
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || err.msg || `Lỗi HTTP ${response.status}: ${response.statusText}`);
    }

    // Xóa loading và tạo thẻ bot
    removeLoadingIndicator();
    const msgElement = appendMessageToDOM(botMsg, true);
    session.messages.push(botMsg);

    // Đọc luồng SSE Stream từ Coze
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    const answerMessages = new Map(); // Lưu trữ nội dung từng message type: "answer"
    let lastMsgId = "msg_default";
    let accumulatedText = "";
    let buffer = "";
    let currentEvent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Bắt tên sự kiện (event: conversation.message.delta, completed...)
        if (trimmed.startsWith("event:")) {
          currentEvent = trimmed.slice(6).trim();
          continue;
        }

        if (!trimmed.startsWith("data:")) continue;

        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === "[DONE]") continue;

        try {
          const eventData = JSON.parse(jsonStr);

          // Chỉ bắt lỗi nếu Coze thực sự báo mã lỗi khác 0
          if (eventData.last_error && eventData.last_error.code !== 0) {
            throw new Error(`Coze: ${eventData.last_error.msg || 'Thất bại'} (Mã: ${eventData.last_error.code})`);
          }

          // Lọc bỏ triệt để các gói tin kỹ thuật nội bộ (verbose, generate_answer_finish, function_call, tool_response...)
          const isInternal =
            eventData.type === "verbose" ||
            eventData.type === "function_call" ||
            eventData.type === "tool_response" ||
            eventData.type === "knowledge" ||
            (typeof eventData.content === "string" && (
              eventData.content.includes("generate_answer_finish") ||
              eventData.content.includes("finish_reason") ||
              eventData.content.trim().startsWith('{"msg_type"')
            ));

          if (isInternal) {
            continue;
          }

          // Chỉ xử lý tin nhắn dạng câu trả lời ("answer")
          const isAnswer = eventData.type === "answer" || (!eventData.type && eventData.role === "assistant");
          if (!isAnswer) {
            continue;
          }

          const msgId = eventData.id || lastMsgId;
          lastMsgId = msgId;

          // 1. Khi nhận delta (từng từ): CỘNG DỒN vào message tương ứng
          if (currentEvent === "conversation.message.delta") {
            if (eventData.content) {
              const prev = answerMessages.get(msgId) || "";
              answerMessages.set(msgId, prev + eventData.content);
            }
          }
          // 2. Khi nhận completed (kết thúc tin nhắn): ĐỒNG BỘ NỘI DUNG CUỐI CÙNG CỦA MESSAGE ĐÓ
          else if (currentEvent === "conversation.message.completed") {
            if (eventData.content) {
              answerMessages.set(msgId, eventData.content);
            }
          }
          // 3. Dự phòng trường hợp Coze không gửi dòng "event:"
          else if (eventData.content) {
            const prev = answerMessages.get(msgId) || "";
            if (eventData.content.startsWith(prev) && eventData.content.length >= prev.length) {
              answerMessages.set(msgId, eventData.content);
            } else {
              answerMessages.set(msgId, prev + eventData.content);
            }
          }

          // Cập nhật giao diện với toàn bộ các câu trả lời nhận được
          accumulatedText = Array.from(answerMessages.values()).filter(Boolean).join("\n\n");
          if (accumulatedText) {
            msgElement.innerHTML = renderMarkdown(accumulatedText);
            botMsg.content = accumulatedText;
            scrollToBottom();
          }
        } catch (e) {
          if (e.message && e.message.startsWith("Coze:")) throw e;
        }
      }
    }

    if (!accumulatedText) {
      accumulatedText = "⚠️ Bot đã xử lý xong nhưng không trả về văn bản. Hãy đảm bảo bạn đã nhấn **Publish** bot trên Coze Studio và chọn kênh **Bot as API**.";
      msgElement.innerHTML = renderMarkdown(accumulatedText);
      botMsg.content = accumulatedText;
    }

    saveState();

  } catch (error) {
    removeLoadingIndicator();
    appendMessageToDOM({
      id: 'msg_err_' + Date.now(),
      role: 'assistant',
      content: `❌ **Đã xảy ra lỗi:** ${error.message}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  } finally {
    STATE.isGenerating = false;
    updateSendButtonState();
    DOM.messageInput.focus();
  }
}

/* ==========================================================
   5. Cài đặt & Sự kiện
   ========================================================== */
function openSettings() {
  DOM.settingApiKey.value = CONFIG.apiKey;
  DOM.settingBotId.value = CONFIG.botId;
  DOM.settingsModal.classList.remove('hidden');
}

function closeSettings() {
  DOM.settingsModal.classList.add('hidden');
}

function saveSettings() {
  CONFIG.apiKey = DOM.settingApiKey.value.trim();
  CONFIG.botId = DOM.settingBotId.value.trim();
  localStorage.setItem('coze_api_key', CONFIG.apiKey);
  localStorage.setItem('coze_bot_id', CONFIG.botId);
  closeSettings();
  showToast("Đã lưu cấu hình!");
}

function showToast(msg) {
  DOM.toastMessage.innerText = msg;
  DOM.toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => DOM.toast.classList.add('translate-y-20', 'opacity-0'), 2000);
}

function updateSendButtonState() {
  DOM.btnSend.disabled = !DOM.messageInput.value.trim() || STATE.isGenerating;
}

function openMobileSidebar() {
  DOM.sidebar.classList.remove('-translate-x-full');
  DOM.sidebarBackdrop.classList.remove('hidden');
}

function closeMobileSidebar() {
  DOM.sidebar.classList.add('-translate-x-full');
  DOM.sidebarBackdrop.classList.add('hidden');
}

function initEvents() {
  DOM.messageInput.addEventListener('input', () => {
    DOM.messageInput.style.height = 'auto';
    DOM.messageInput.style.height = Math.min(DOM.messageInput.scrollHeight, 180) + 'px';
    updateSendButtonState();
  });

  DOM.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  DOM.chatForm.addEventListener('submit', handleSendMessage);
  DOM.btnNewChat.addEventListener('click', () => { createNewSession(); closeMobileSidebar(); });
  DOM.btnClearHistory.addEventListener('click', () => {
    if (confirm("Xóa toàn bộ lịch sử trò chuyện?")) {
      STATE.sessions = [];
      createNewSession();
    }
  });

  DOM.btnOpenSidebar.addEventListener('click', openMobileSidebar);
  DOM.btnCloseSidebar.addEventListener('click', closeMobileSidebar);
  DOM.sidebarBackdrop.addEventListener('click', closeMobileSidebar);

  DOM.btnOpenSettings.addEventListener('click', openSettings);
  DOM.btnCloseSettings.addEventListener('click', closeSettings);
  DOM.btnCancelSettings.addEventListener('click', closeSettings);
  DOM.btnSaveSettings.addEventListener('click', saveSettings);
  DOM.settingsModal.addEventListener('click', (e) => {
    if (e.target === DOM.settingsModal) closeSettings();
  });
}

function initApp() {
  setupMarkdown();
  loadState();
  renderHistoryList();
  renderCurrentChat();
  initEvents();
  updateSendButtonState();
  if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', initApp);
