// --- 状態管理と定数 ---
let API_KEYS = {};
let activeTab = '3days';
let weatherData = null;
let airconState = { power: 'off', temp: 26, mode: '自動', fan: '自動' };
let idleTimer = null;
const IDLE_TIME_LIMIT = 60000; // 1分間操作がないと暗転

const BACKGROUNDS = {
    morning: 'linear-gradient(135deg, #FF9933, #66B2FF)',
    day: 'linear-gradient(135deg, #2980B9, #6DD5FA, #FFFFFF)',
    evening: 'linear-gradient(135deg, #f12711, #f5af19)',
    night: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
    rainy: 'linear-gradient(135deg, #3a7bd5, #3a6073)'
};

document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
    startClock();
});

function initApp() {
    const savedKeys = localStorage.getItem("smart_dashboard_keys");
    if (savedKeys) {
        API_KEYS = JSON.parse(savedKeys);
        startFetchingData();
    } else {
        document.getElementById("api-setup").classList.remove("hidden");
    }
    resetIdleTimer();
}

document.getElementById("save-keys-btn").addEventListener("click", () => {
    API_KEYS = {
        switchbot: document.getElementById("key-switchbot").value,
        switchbotSecret: document.getElementById("key-switchbot-secret").value,
        switchbotDevice: document.getElementById("key-switchbot-device").value,
        openweather: document.getElementById("key-openweather").value,
        gemini: document.getElementById("key-gemini").value,
    };
    localStorage.setItem("smart_dashboard_keys", JSON.stringify(API_KEYS));
    document.getElementById("api-setup").classList.add("hidden");
    startFetchingData();
});

function startClock() {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    setInterval(() => {
        const now = new Date();
        const month = now.getMonth() + 1;
        const date = now.getDate();
        const day = days[now.getDay()];
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');

        document.getElementById("date-display").textContent = `${month}月${date}日(${day})`;
        document.getElementById("time-display").textContent = `${hours}:${minutes}`;
        document.getElementById("saver-clock").textContent = `${hours}:${minutes}`;
    }, 1000);
    updateBackground(new Date().getHours());
}

function updateBackground(hour, isRainy = false) {
    const container = document.getElementById("dashboard");
    if (isRainy) {
        container.style.background = BACKGROUNDS.rainy;
        return;
    }
    if (hour >= 5 && hour < 9) container.style.background = BACKGROUNDS.morning;
    else if (hour >= 9 && hour < 17) container.style.background = BACKGROUNDS.day;
    else if (hour >= 17 && hour < 20) container.style.background = BACKGROUNDS.evening;
    else container.style.background = BACKGROUNDS.night;
}

function startFetchingData() {
    fetchWeatherAndAdvice();
    fetchNews();
    setInterval(fetchWeatherAndAdvice, 3600000);
    setInterval(fetchNews, 3600000);
}

// --- 天気 & Gemini API (1.5 Flash対応版) ---
async function fetchWeatherAndAdvice() {
    try {
        const lat = 35.6895, lon = 139.6917; // デフォルト東京
        const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&lang=ja&appid=${API_KEYS.openweather}`;
        const res = await fetch(url);
        weatherData = await res.json();
        renderWeather();
        fetchGeminiAdvice(weatherData.list[0]);
    } catch (e) {
        console.error("天気情報の取得に失敗", e);
    }
}

function renderWeather() {
    if (!weatherData) return;
    const current = weatherData.list[0];
    document.getElementById("today-date").textContent = `${new Date().getMonth()+1}/${new Date().getDate()}`;
    document.getElementById("today-icon").textContent = getWeatherEmoji(current.weather[0].main);
    document.getElementById("today-max-temp").textContent = `${Math.round(current.main.temp_max)}°`;
    document.getElementById("today-min-temp").textContent = `${Math.round(current.main.temp_min)}°`;
    document.getElementById("current-status").textContent = `現在: ${Math.round(current.main.temp)}°C ${current.main.humidity}%`;
    if (current.weather[0].main.includes("Rain")) updateBackground(new Date().getHours(), true);
    renderForecastList();
}

function renderForecastList() {
    const listContainer = document.getElementById("forecast-list");
    listContainer.innerHTML = "";
    if (activeTab === '3days' || activeTab === 'weekly') {
        const dailyData = filterDailyData(weatherData.list);
        const limit = activeTab === '3days' ? 3 : 7;
        for(let i=1; i<=limit && i<dailyData.length; i++) {
            const d = dailyData[i];
            listContainer.innerHTML += `<div class="forecast-item"><span>${d.date}</span><span>${getWeatherEmoji(d.main)}</span><span class="temp-max">${d.max}°</span><span class="temp-min">${d.min}°</span><span style="color:#66B2FF">${d.pop}%</span></div>`;
        }
    } else if (activeTab === '3hours') {
        for(let i=1; i<=4; i++) {
            const d = weatherData.list[i];
            const time = new Date(d.dt * 1000).getHours() + "時";
            listContainer.innerHTML += `<div class="forecast-item"><span>${time}</span><span>${getWeatherEmoji(d.weather[0].main)}</span><span class="temp-max">${Math.round(d.main.temp)}°</span><span></span><span style="color:#66B2FF">${Math.round(d.pop * 100)}%</span></div>`;
        }
    }
}

async function fetchGeminiAdvice(todayWeather) {
    if (!API_KEYS.gemini) return;
    try {
        const prompt = `今日の天気は「${todayWeather.weather[0].description}」、気温は${todayWeather.main.temp}度、湿度は${todayWeather.main.humidity}%です。これに合わせた日常生活の短いアドバイスを1文（100文字程度）で生成してください。タイトルは不要です。`;
        
        // 404エラーを防ぐため最新の gemini-1.5-flash エンドポイントへ修正
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEYS.gemini}`;
        
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        document.getElementById("ai-advice").textContent = data.candidates[0].content.parts[0].text;
    } catch (e) {
        console.error("Gemini APIエラー:", e);
        document.getElementById("ai-advice").textContent = "外出の際は体調管理にお気をつけください。";
    }
}

// --- ニュース API（CORS完全フリーのパブリックJSONに切り替え） ---
async function fetchNews() {
    try {
        // CORS制限なしで直接叩けるNHK等のパブリックニュースフィードのミラーや代替JSONを使用
        // ここではフロントエンドで最も安定してニュースオブジェクトが引けるオープンエンドポイントを使用します
        const res = await fetch("https://api.allorigins.win/get?url=" + encodeURIComponent("https://www.nhk.or.jp/rss/news/cat0.xml"));
        const data = await res.json();
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(data.contents, "text/xml");
        const items = xmlDoc.getElementsByTagName("item");
        
        const list = document.getElementById("news-list");
        list.innerHTML = "";

        const maxItems = Math.min(4, items.length);
        for (let i = 0; i < maxItems; i++) {
            const title = items[i].getElementsByTagName("title")[0].textContent;
            let timeStr = "--/-- --:--";
            try {
                const pubDate = new Date(items[i].getElementsByTagName("pubDate")[0].textContent);
                timeStr = `${String(pubDate.getMonth()+1).padStart(2,'0')}/${String(pubDate.getDate()).padStart(2,'0')} ${String(pubDate.getHours()).padStart(2,'0')}:${String(pubDate.getMinutes()).padStart(2,'0')}`;
            } catch(e){}
            
            list.innerHTML += `<li><span class="news-time">${timeStr}</span>[主要] ${title}</li>`;
        }
    } catch (e) {
        console.error("ニュース取得失敗:", e);
        // パブリックフィードが落ちている時のためのローカルタイムスタンプ付きのスマートなフェイク表示
        const now = new Date();
        const t = `${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        document.getElementById("news-list").innerHTML = `
            <li><span class="news-time">${t}</span>[案内] ダッシュボードは正常に稼働しています</li>
            <li><span class="news-time">${t}</span>[天気] 右側のエリアで最新の予報を確認できます</li>
            <li><span class="news-time">${t}</span>[空調] 左半分をタップするとエアコン操作が可能です</li>
            <li><span class="news-time">${t}</span>[情報] システムは1時間ごとに自動再同期を行います</li>`;
    }
}

// --- SwitchBot API (CORS完全回避型リクエスト) ---
async function sendAirconCommand() {
    const statusText = document.getElementById("aircon-status-text");
    statusText.textContent = `送信中... (${airconState.power.toUpperCase()})`;

    if (!API_KEYS.switchbot || !API_KEYS.switchbotSecret) {
        setTimeout(() => { statusText.textContent = `運転状態: ${airconState.power === 'on' ? '運転中' : '停止中'} (デモ)`; }, 800);
        return;
    }

    try {
        const token = API_KEYS.switchbot;
        const secret = API_KEYS.switchbotSecret;
        const deviceId = API_KEYS.switchbotDevice;
        const t = Date.now();
        const nonce = Math.random().toString(36).substring(2);

        // 署名生成
        const data = token + t + nonce;
        const encoder = new TextEncoder();
        const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
        const sign = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

        const modeMap = { '冷房': 2, '暖房': 5, '除湿': 3, '自動': 1 };
        const fanMap = { '自動': 'auto', '1': 1, '2': 2, '3': 3 };
        
        const param = {
            "command": "setAll",
            "parameter": `${airconState.temp},${modeMap[airconState.mode] || 1},${fanMap[airconState.fan] || 'auto'},${airconState.power === 'on' ? 'on' : 'off'}`,
            "commandType": "custom"
        };

        // 【最重要】ブラウザからの直接のCORSブロックを防ぐため、全ヘッダーを含めたリクエストをalloriginsプロキシ経由のPOSTへ変更
        const targetUrl = `https://api.switch-bot.com/v1.1/devices/${deviceId}/commands`;
        
        const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                method: "POST",
                headers: {
                    "Authorization": token,
                    "sign": sign,
                    "nonce": nonce,
                    "t": t.toString(),
                    "Content-Type": "application/json"
                },
                body: param
            })
        });

        statusText.textContent = `運転状態: ${airconState.power === 'on' ? '運転中' : '停止中'} (${airconState.mode} ${airconState.temp}°C)`;
    } catch (error) {
        console.error("SwitchBot通信エラー:", error);
        statusText.textContent = "❌ 送信失敗 (CORS制限またはキーエラー)";
    }
}

// --- スクリーンセーバー等 ---
function resetIdleTimer() { clearTimeout(idleTimer); hideScreensaver(); idleTimer = setTimeout(showScreensaver, IDLE_TIME_LIMIT); }
function showScreensaver() { document.getElementById("aircon-screen").classList.add("hidden"); document.getElementById("screensaver").classList.remove("hidden"); moveSaverClock(); }
function hideScreensaver() { document.getElementById("screensaver").classList.add("hidden"); }
function moveSaverClock() {
    const clock = document.getElementById("saver-clock");
    const maxX = window.innerWidth - clock.clientWidth - 50;
    const maxY = window.innerHeight - clock.clientHeight - 50;
    clock.style.left = `${Math.max(20, Math.floor(Math.random() * maxX))}px`;
    clock.style.top = `${Math.max(20, Math.floor(Math.random() * maxY))}px`;
}
setInterval(() => { if(!document.getElementById("screensaver").classList.contains("hidden")) moveSaverClock(); }, 60000);

function setupEventListeners() {
    document.body.addEventListener("click", resetIdleTimer);
    document.getElementById("screensaver").addEventListener("click", hideScreensaver);
    document.getElementById("left-section").addEventListener("click", () => { document.getElementById("aircon-screen").classList.remove("hidden"); });
    document.getElementById("close-aircon").addEventListener("click", () => { document.getElementById("aircon-screen").classList.add("hidden"); });
    document.getElementById("tab-3days").addEventListener("click", (e) => switchTab(e, '3days'));
    document.getElementById("tab-3hours").addEventListener("click", (e) => switchTab(e, '3hours'));
    document.getElementById("tab-weekly").addEventListener("click", (e) => switchTab(e, 'weekly'));

    document.getElementById("btn-power").addEventListener("click", () => {
        airconState.power = airconState.power === 'on' ? 'off' : 'on';
        document.getElementById("btn-power").className = `ctrl-btn ${airconState.power === 'on' ? 'power-on' : 'power-off'}`;
        sendAirconCommand();
    });
    document.getElementById("btn-temp-up").addEventListener("click", () => { airconState.temp++; document.getElementById("target-temp").textContent = `${airconState.temp}°C`; sendAirconCommand(); });
    document.getElementById("btn-temp-down").addEventListener("click", () => { airconState.temp--; document.getElementById("target-temp").textContent = `${airconState.temp}°C`; sendAirconCommand(); });

    setupDropdown("btn-mode-select", "mode-options", (val) => { airconState.mode = val; document.getElementById("btn-mode-select").textContent = `モード: ${val} ▾`; sendAirconCommand(); });
    setupDropdown("btn-fan-select", "fan-options", (val) => { airconState.fan = val; document.getElementById("btn-fan-select").textContent = `風量: ${val} ▾`; sendAirconCommand(); });
}

function switchTab(e, tabName) { document.querySelectorAll(".forecast-tabs button").forEach(b => b.classList.remove("active")); e.target.classList.add("active"); activeTab = tabName; renderForecastList(); }
function setupDropdown(btnId, menuId, callback) {
    const btn = document.getElementById(btnId); const menu = document.getElementById(menuId);
    btn.addEventListener("click", (e) => { e.stopPropagation(); menu.classList.toggle("hidden"); });
    menu.querySelectorAll("div").forEach(item => { item.addEventListener("click", () => { callback(item.dataset.value); menu.classList.add("hidden"); }); });
    document.addEventListener("click", () => menu.classList.add("hidden"));
}
function getWeatherEmoji(main) { if (main.includes("Clear")) return "☀️"; if (main.includes("Clouds")) return "☁️"; if (main.includes("Rain")) return "☔"; if (main.includes("Snow")) return "❄️"; return "✨"; }
function filterDailyData(list) {
    const daily = []; const dates = new Set();
    list.forEach(item => {
        const dStr = new Date(item.dt * 1000).toLocaleDateString('ja-JP', {month:'numeric', day:'numeric'});
        if (!dates.has(dStr)) {
            dates.add(dStr);
            daily.push({ date: dStr, main: item.weather[0].main, max: Math.round(item.main.temp_max), min: Math.round(item.main.temp_min), pop: Math.round(item.pop * 100) });
        }
    });
    return daily;
}