// ==========================================
// 1. 全域設定
// ==========================================
// ★★★ 換成你的 Cloudflare 公開網址 (記得要用 https) ★★★
const API_BASE = "https://api.mesh-wc.xyz";

// 區域網路連線不需要繞過 ngrok 警告，將 Header 回歸標準設定
const NGROK_HEADERS = {
    "Content-Type": "application/json"
    // 已移除 "ngrok-skip-browser-warning"
};

// ==========================================
// 2. 登入狀態檢查 (警衛) - 原有功能保留
// ==========================================
(function checkAuth() {
    const path = window.location.pathname;
    const isLoginOrReg = path.includes("login.html") || path.includes("register.html");
    const isLoggedIn = localStorage.getItem("isLoggedIn") === "true";

    if (!isLoggedIn && !isLoginOrReg && path !== "/" && path !== "") {
        window.location.replace("login.html");
        return; 
    }

    if (isLoggedIn && (isLoginOrReg || path === "/")) {
        const lastNode = localStorage.getItem("selectedNode") || "JETSON_NANO_01";
        window.location.replace(`index.html?node_id=${lastNode}`);
    }
})();

const params = new URLSearchParams(window.location.search);
const NODE_ID = params.get("node_id") || "JETSON_NANO_01";

// ==========================================
// 3. 儀表板數據更新 (Dashboard) - 原有功能保留
// ==========================================
async function refreshDashboard() {
  if (!document.getElementById("env-index")) return;

  try {
    // 使用新的 API_BASE 進行 fetch，並保持與 NGROK_HEADERS 的相容性
    const res = await fetch(`${API_BASE}/api/latest?node_id=${NODE_ID}`, {
        method: "GET",
        headers: new Headers({ "Content-Type": "application/json" }) 
    });
    
    if (!res.ok) throw new Error("API Error");
    
    const data = await res.json();
    if (data.error) {
        console.warn("後端回報錯誤:", data.error);
        return;
    }

    const s = data.sensors || {};
    const ctrl = data.control || {};

    const scoreEl = document.getElementById("env-index");
    if(scoreEl) {
        scoreEl.textContent = data.env_score;
        scoreEl.style.color = data.env_score >= 80 ? "#059669" : (data.env_score >= 60 ? "#ca8a04" : "#dc2626");
    }

    updateValue("val-temp", s.temp ? s.temp.toFixed(1) : "--", "°C");
    updateValue("val-hum", s.hum ? s.hum.toFixed(0) : "--", "%");
    updateValue("val-ppm", s.mq135 ? s.mq135.toFixed(0) : "--", " PPM");
    
    updateSupplyStatus("val-liquid", s.liquid);
    updateDistStatus("val-paper", s.dist);

    const date = new Date(data.ts);
    updateValue("last-update", date.toLocaleTimeString(), "");

    const btn = document.getElementById("btn-fan");
    if (btn) {
      if (ctrl.fan) {
        btn.classList.add("active");
        btn.innerHTML = "🌀 排風扇：運轉中"; 
      } else {
        btn.classList.remove("active");
        btn.innerHTML = "🌀 排風扇：已關閉";
      }
    }

  } catch (e) {
    console.error("Dashboard 連線失敗:", e);
  }
}

// 輔助函式均保留原本邏輯
function updateValue(id, val, unit) {
  const el = document.getElementById(id);
  if (el) el.textContent = (val !== undefined && val !== null) ? `${val}${unit}` : "--";
}

function updateSupplyStatus(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (val === 1) {
    el.textContent = "充足";
    el.style.color = "#059669";
  } else {
    el.textContent = "需補充";
    el.style.color = "#dc2626";
  }
}

function updateDistStatus(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (val === undefined || val === null || val === 0) {
      el.textContent = "感測異常";
      el.style.color = "#64748b";
      return;
  }
  if (val > 15) {
    el.textContent = `缺紙 (${val.toFixed(1)}cm)`;
    el.style.color = "#dc2626";
  } else if (val >= 12) {
    el.textContent = `低存量 (${val.toFixed(1)}cm)`;
    el.style.color = "#ca8a04";
  } else {
    el.textContent = `充足 (${val.toFixed(1)}cm)`;
    el.style.color = "#059669";
  }
}

// ==========================================
// 4. 設備控制 (Fan Control) - 原有功能保留
// ==========================================
async function toggleFan() {
  const btn = document.getElementById("btn-fan");
  if (!btn) return;
  
  const isCurrentlyOn = btn.classList.contains("active");
  const action = isCurrentlyOn ? "fan_off" : "fan_on";

  btn.textContent = "傳送指令...";
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/control`, {
      method: "POST",
      headers: NGROK_HEADERS,
      body: JSON.stringify({
        node_id: NODE_ID,
        action: action
      })
    });
    
    if (!res.ok) throw new Error("API 回應錯誤");
    
    const data = await res.json();
    if (data.status === "ok") {
        refreshDashboard(); 
    } else {
        alert("控制失敗: " + (data.error || "Unknown error"));
    }
  } catch (e) {
    alert("連線錯誤，無法控制風扇。");
  } finally {
    btn.disabled = false;
  }
}

// ==========================================
// 5. 啟動與初始化 - 原有功能保留
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  const fanBtn = document.getElementById("btn-fan");
  if (fanBtn) {
    fanBtn.addEventListener("click", toggleFan);
  }

  if (document.getElementById("env-index")) {
    refreshDashboard();
    refreshOccupancy(); // <-- [新增] 網頁載入時先拉取一次佔用狀態

    // 將兩個更新函數綁定在同一個定時器，或者分開寫也可以
    setInterval(() => {
        refreshDashboard();
        refreshOccupancy(); // <-- [新增] 每兩秒更新一次佔用狀態
    }, 2000); 
  }

  document.querySelectorAll(".menu-item").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href || href === "#" || href.includes("select_node.html")) return;
    
    if (!href.includes("node_id=")) {
        const separator = href.includes("?") ? "&" : "?";
        link.setAttribute("href", `${href}${separator}node_id=${NODE_ID}`);
    }
  });

  const logoutBtn = document.querySelector(".logout");
  if (logoutBtn) {
      const username = localStorage.getItem("username") || "管理員";
      const role = localStorage.getItem("role") || "admin";
      
      const container = logoutBtn.parentElement;
      const userDiv = document.createElement("div");
      userDiv.className = "user-profile";
      userDiv.innerHTML = `
        <div class="user-icon">👤</div>
        <div class="user-text">
            <div class="user-name">${username}</div>
            ${role === 'admin' ? '<span class="badge-admin">ADMIN</span>' : ''}
        </div>`;
      container.insertBefore(userDiv, logoutBtn);

      logoutBtn.addEventListener("click", () => {
          if(confirm("確定要登出系統嗎？")) {
              localStorage.setItem("isLoggedIn", "false");
              location.href = "login.html";
          }
      });
  }
}
);
// ==========================================
// 6. 佔用狀態更新 (Occupancy) - 新增的功能
// ==========================================
async function refreshOccupancy() {
    try {
        const res = await fetch(`${API_BASE}/api/occupancy?node_id=${NODE_ID}`, {
            method: "GET",
            headers: new Headers({ "Content-Type": "application/json" })
        });
        
        if (!res.ok) throw new Error("Occupancy API Error");
        const data = await res.json();
        
        // 處理小便斗 (urinals) 的狀態更新
        // 陣列為 [0, 1, 0...]，1 代表有人，0 代表無人
        if (data.urinals) {
            data.urinals.forEach((state, index) => {
                // 假設您 HTML 中小便斗的 ID 是 urinal-0, urinal-1 ...
                const el = document.getElementById(`urinal-${index}`);
                if (el) {
                    if (state === 1) {
                        el.classList.add("occupied"); // 請替換成您定義的「有人」CSS class
                        el.classList.remove("vacant");
                        el.innerHTML = "🔴 有人"; 
                    } else {
                        el.classList.add("vacant");   // 請替換成您定義的「無人」CSS class
                        el.classList.remove("occupied");
                        el.innerHTML = "🟢 空閒";
                    }
                }
            });
        }

        // 處理馬桶隔間 (stalls) 的狀態更新
        if (data.stalls) {
            data.stalls.forEach((state, index) => {
                // 假設您 HTML 中馬桶隔間的 ID 是 stall-0, stall-1 ...
                const el = document.getElementById(`stall-${index}`);
                if (el) {
                    if (state === 1) {
                        el.classList.add("occupied");
                        el.classList.remove("vacant");
                        el.innerHTML = "🔴 有人";
                    } else {
                        el.classList.add("vacant");
                        el.classList.remove("occupied");
                        el.innerHTML = "🟢 空閒";
                    }
                }
            });
        }
    } catch (e) {
        console.error("佔用狀態連線失敗:", e);
    }
}