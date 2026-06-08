const API_BASE = "http://localhost:8080";

// 1. 從 URL 取得 node_id，抓不到就預設 JETSON_NANO_01
const urlParams = new URLSearchParams(window.location.search);
const NODE_ID = urlParams.get('node_id') || "JETSON_NANO_01";

console.log("當前監控節點:", NODE_ID);

// 2. 頁面初始化
document.addEventListener("DOMContentLoaded", () => {
    // 修正所有選單連結，加上 node_id
    document.querySelectorAll('.menu-item').forEach(link => {
        const href = link.getAttribute('href');
        if (href && !href.includes('node_id=')) {
            const separator = href.includes('?') ? '&' : '?';
            link.setAttribute('href', `${href}${separator}node_id=${NODE_ID}`);
        }
    });

    // 更新標題
    const elSub = document.querySelector('.status-subtext') || document.getElementById('node');
    if (elSub) {
        if (NODE_ID === "JETSON_NANO_01") elSub.textContent = "廁所 1 (JETSON_NANO_01)";
        else if (NODE_ID === "JETSON_NANO_02") elSub.textContent = "廁所 2 (JETSON_NANO_02)";
        else elSub.textContent = "節點: " + NODE_ID;
    }
});

/** 通用 Fetch 函數 */
async function fetchJSON(url) {
    try {
        const res = await fetch(url, { cache: "no-store" });
        return await res.json();
    } catch (e) {
        console.error("API 請求失敗:", url, e);
        return null;
    }
}

/** 更新 UI 數值 */
function updateUIItem(type, value, unit) {
    const elValue = document.getElementById(`value-${type}`);
    const elCircle = document.getElementById(`circle-${type}`);
    if (!elValue) return;

    if (value === undefined || value === null) {
        elValue.textContent = "--";
        return;
    }

    if (type === "soap" || type === "paper") {
        elValue.textContent = Number(value) === 1 ? "充足" : "不足";
    } else {
        elValue.textContent = `${value} ${unit || ""}`;
    }

    if (elCircle) {
        elCircle.className = "sensor-circle " + (Number(value) === 1 || type.includes('temp') ? "good" : "bad");
    }
}

/** 執行各頁面專屬更新 */
async function tick() {
    // 主畫面 index.html
    if (document.getElementById("env-index")) {
        const data = await fetchJSON(`${API_BASE}/api/node_status?node_id=${NODE_ID}`);
        if (data && data.sensors) {
            updateUIItem("temp", data.sensors.temp, "°C");
            updateUIItem("hum", data.sensors.hum, "%");
            updateUIItem("aq", data.sensors.mq135, "");
            updateUIItem("soap", data.sensors.liquid, "");
            updateUIItem("paper", data.sensors.paper, "");
            document.getElementById("last-update").textContent = "最後更新：" + (data.ts || "--");
            document.getElementById("env-index").textContent = "95";
        }
    }

    // 感測器頁面 sensors.html
    const sensorContainer = document.getElementById("sensor-cards");
    if (sensorContainer) {
        const data = await fetchJSON(`${API_BASE}/api/sensors?node_id=${NODE_ID}`);
        if (data && data.items) {
            sensorContainer.innerHTML = data.items.map(it => `
                <div class="card">
                    <div style="font-weight:bold">${it.sensor}</div>
                    <div style="font-size:24px">${it.value} ${it.unit}</div>
                    <div class="muted">${it.ts}</div>
                </div>
            `).join('');
        }
    }
}

setInterval(tick, 2000);
tick();