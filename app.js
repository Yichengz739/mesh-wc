// ==========================================
// 1. 全域設定
// ==========================================
const API_BASE = "https://api.mesh-wc.xyz";
const params = new URLSearchParams(window.location.search);
const NODE_ID = params.get("node_id") || localStorage.getItem("selectedNode") || "JETSON_NANO_01";
const NGROK_HEADERS = { "Content-Type": "application/json" };

// ==========================================
// 2. 核心功能：儀表板數據更新 (Dashboard)
// ==========================================
async function refreshDashboard() {
    try {
        const res = await fetch(`${API_BASE}/api/latest?node_id=${NODE_ID}`, {
            method: "GET",
            headers: NGROK_HEADERS
        });

        if (!res.ok) throw new Error("API Error");
        const data = await res.json();
        if (data.error) return;

        const s = data.sensors || {};
        const ctrl = data.control || {};

        updateValue("val-temp", typeof s.temp === "number" ? s.temp.toFixed(1) : "--", "°C");
        updateValue("val-hum", typeof s.hum === "number" ? s.hum.toFixed(0) : "--", "%");
        updateValue("val-ppm", typeof s.mq135 === "number" ? s.mq135.toFixed(0) : "--", " PPM");

        updateSupplyStatus("val-liquid", s.liquid);
        updateDistStatus("val-paper", s.dist);

        const lastUpdateEl = document.getElementById("last-update");
        if (lastUpdateEl) lastUpdateEl.textContent = new Date().toLocaleTimeString();

        const btn = document.getElementById("btn-fan");
        if (btn) {
            btn.className = ctrl.fan ? "btn-fan active" : "btn-fan";
            btn.textContent = ctrl.fan ? "🌀 排風扇：運轉中" : "🌀 排風扇：已關閉";
        }
    } catch (e) {
        console.error("Dashboard 更新失敗:", e);
    }
}

// ==========================================
// 3. 核心功能：佔用狀態監測與告警 (Occupancy)
// ==========================================
async function refreshOccupancy() {
    try {
        const res = await fetch(`${API_BASE}/api/occupancy?node_id=${NODE_ID}`, {
            method: "GET",
            headers: NGROK_HEADERS
        });

        if (!res.ok) throw new Error("Occupancy API Error");
        const data = await res.json();

        if (data.stalls) {
            if (typeof checkOccupancyAlert === "function") {
                checkOccupancyAlert(data.stalls);
            }

            data.stalls.forEach((state, index) => {
                const el = document.getElementById(`stall-${index}`);
                if (el) {
                    el.className = state === 1 ? "cubicle occupied" : "cubicle free";
                    el.textContent = state === 1 ? "使用中" : "空閒";
                }
            });
        }
    } catch (e) {
        console.error("佔用狀態連線失敗:", e);
    }
}

// ==========================================
// 4. 輔助函式 (UI Updates)
// ==========================================
function updateValue(id, val, unit) {
    const el = document.getElementById(id);
    if (el) el.textContent = (val !== "--") ? `${val}${unit}` : "--";
}

function updateSupplyStatus(id, val) {
    const el = document.getElementById(id);
    if (!el) return;

    el.textContent = (val === 1) ? "充足" : "需補充";
    el.style.color = (val === 1) ? "#059669" : "#dc2626";
}

function updateDistStatus(id, val) {
    const el = document.getElementById(id);
    if (!el) return;

    if (val === undefined || val === null || Number(val) === 255) {
        el.textContent = "異常";
        el.style.color = "#dc2626";
        return;
    }

    el.textContent = (Number(val) > 15) ? "缺紙" : "充足";
    el.style.color = (Number(val) > 15) ? "#dc2626" : "#059669";
}

// ==========================================
// 5. 側邊欄帳號顯示與登出
// ==========================================
function initSidebarUserProfile() {
    const logoutBtn = document.querySelector(".logout");
    if (!logoutBtn) return;

    const container = logoutBtn.parentElement;
    if (!container) return;

    // 避免同一頁重複插入帳號卡片
    if (container.querySelector(".user-profile")) return;

    const username = localStorage.getItem("username") || "管理員";
    const role = localStorage.getItem("role") || "admin";

    const userDiv = document.createElement("div");
    userDiv.className = "user-profile";
    userDiv.innerHTML = `
        <div class="user-icon">👤</div>
        <div class="user-text">
            <div class="user-name">${username}</div>
            ${role === "admin" ? '<span class="badge-admin">ADMIN</span>' : ""}
        </div>
    `;

    container.insertBefore(userDiv, logoutBtn);

    // 避免重複綁定登出事件
    if (!logoutBtn.dataset.logoutBound) {
        logoutBtn.dataset.logoutBound = "true";
        logoutBtn.addEventListener("click", () => {
            if (confirm("確定要登出系統嗎？")) {
                localStorage.setItem("isLoggedIn", "false");
                location.href = "login.html";
            }
        });
    }
}

// ==========================================
// 6. 側邊欄連結同步 node_id
// ==========================================
function syncSidebarLinks() {
    document.querySelectorAll(".menu-item").forEach((link) => {
        const href = link.getAttribute("href");
        if (!href) return;

        // 主畫面通常不需要帶 node_id
        if (href.includes("select_node.html")) return;

        // 已經有 node_id 就不重複加
        if (href.includes("node_id=")) return;

        const separator = href.includes("?") ? "&" : "?";
        link.setAttribute("href", `${href}${separator}node_id=${NODE_ID}`);
    });
}

// ==========================================
// 7. 系統啟動與初始化
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initSidebarUserProfile();
    syncSidebarLinks();

    // 只有頁面有對應元素時，才啟動 dashboard 輪詢
    const hasDashboardUI = document.getElementById("val-temp") ||
                           document.getElementById("val-hum") ||
                           document.getElementById("val-ppm") ||
                           document.getElementById("val-paper") ||
                           document.getElementById("val-liquid") ||
                           document.getElementById("btn-fan");

    // index.html 可能會定義 checkOccupancyAlert；其他有 stall-0/stall-1 的頁面也可以共用
    const hasOccupancyUI = (typeof checkOccupancyAlert === "function") ||
                           document.querySelector("[id^='stall-']");

    if (hasDashboardUI) {
        refreshDashboard();
        setInterval(refreshDashboard, 2000);
    }

    if (hasOccupancyUI) {
        refreshOccupancy();
        setInterval(refreshOccupancy, 2000);
    }
});