// ==========================================
// 1. 全域設定
// ==========================================
const API_BASE = "https://api.mesh-wc.xyz";
const params = new URLSearchParams(window.location.search);
const NODE_ID = params.get("node_id") || "JETSON_NANO_01";
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

        // 更新各項感測數值
        updateValue("val-temp", s.temp ? s.temp.toFixed(1) : "--", "°C");
        updateValue("val-hum", s.hum ? s.hum.toFixed(0) : "--", "%");
        updateValue("val-ppm", s.mq135 ? s.mq135.toFixed(0) : "--", " PPM");
        
        updateSupplyStatus("val-liquid", s.liquid);
        updateDistStatus("val-paper", s.dist);

        // 更新最後更新時間
        const lastUpdateEl = document.getElementById("last-update");
        if(lastUpdateEl) lastUpdateEl.textContent = new Date().toLocaleTimeString();

        // 更新風扇按鈕 UI
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
        
        // 更新 UI 狀態與觸發 index.html 中的檢查函式
        if (data.stalls) {
            if (typeof checkOccupancyAlert === 'function') {
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
    if (!val) { el.textContent = "異常"; return; }
    el.textContent = (val > 15) ? "缺紙" : "充足";
    el.style.color = (val > 15) ? "#dc2626" : "#059669";
}

// ==========================================
// 5. 系統啟動與初始化
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // 啟動定時輪詢
    setInterval(() => {
        refreshDashboard();
        refreshOccupancy();
    }, 2000);
    
    refreshDashboard();
    refreshOccupancy();

    // 處理側邊欄連結
    document.querySelectorAll(".menu-item").forEach((link) => {
        const href = link.getAttribute("href");
        if (href && !href.includes("select_node.html") && !href.includes("node_id=")) {
            const separator = href.includes("?") ? "&" : "?";
            link.setAttribute("href", `${href}${separator}node_id=${NODE_ID}`);
        }
    });
});