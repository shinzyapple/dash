// --- 状態管理と定数 ---
let API_KEYS = {};
let activeTab = '3days';
let weatherData = null;
let airconState = { power: 'off', temp: 26, mode: '自動', fan: '自動' };
let idleTimer = null;
const IDLE_TIME_LIMIT = 60000; // 1分間操作がないと暗転 / エアコン画面を閉じる

// 背景グラデーションの定義群
const BACKGROUNDS = {
    morning: 'linear-gradient(135deg, #FF9933, #66B2FF)',
    day: 'linear-gradient(135deg, #2980B9, #6DD5FA, #FFFFFF)',
    evening: 'linear-gradient(135deg, #f12711, #f5af19)',
    night: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
    rainy: 'linear-gradient(135deg, #3a7bd5, #3a6073)'
};

// --- 初期化処理 ---
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

// --- APIキー永続化 ---
document.getElementById("save-keys-btn").addEventListener("click", () => {
    API_KEYS = {
        switchbot: document.getElementById("key-switchbot").value,
        switchbotSecret: document.getElementById("key-switchbot-secret").value,
        switchbotDevice: document.getElementById("key-switchbot-device").value,
        openweather: document.getElementById("key-openweather").value,
        // key-news は不要になったため削除（またはHTMLに存在しない場合はここに書かない）
        gemini: document.getElementById("key-gemini").value,
    };
    localStorage.setItem("smart_dashboard_keys", JSON.stringify(API_KEYS));
    document.getElementById("api-setup").classList.add("hidden");
    startFetchingData();
});

// --- 時計機能 ---
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

        // 背景の自動更新（1時間ごと）
        if (minutes === "00") updateBackground(now.getHours());
    }, 1000);
    updateBackground(new Date().getHours());
}

// 動的背景切り替え
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

// --- データ取得コントロール ---
function startFetchingData() {
    fetchWeatherAndAdvice();
    fetchNews();
    // 1時間ごとに情報更新
    setInterval(fetchWeatherAndAdvice, 3600000);
    setInterval(fetchNews, 3600000);
}

// --- 天気 & Gemini API連携 ---
async function fetchWeatherAndAdvice() {
    try {
        // OpenWeatherMap (例として東京: 緯度35.6895, 経度139.6917)
        const lat = 35.6895, lon = 139.6917;
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
    
    // 今日の天気
    document.getElementById("today-date").textContent = `${new Date().getMonth()+1}/${new Date().getDate()}`;
    document.getElementById("today-icon").textContent = getWeatherEmoji(current.weather[0].main);
    document.getElementById("today-max-temp").textContent = `${Math.round(current.main.temp_max)}°`;
    document.getElementById("today-min-temp").textContent = `${Math.round(current.main.temp_min)}°`;
    document.getElementById("current-status").textContent = `現在: ${Math.round(current.main.temp)}°C ${current.main.humidity}%`;

    // 雨天なら背景を変える
    if (current.weather[0].main.includes("Rain")) updateBackground(new Date().getHours(), true);

    renderForecastList();
}

function renderForecastList() {
    const listContainer = document.getElementById("forecast-list");
    listContainer.innerHTML = "";

    if (activeTab === '3days' || activeTab === 'weekly') {
        // 日ごとのデータにパース
        const dailyData = filterDailyData(weatherData.list);
        const limit = activeTab === '3days' ? 3 : 7;

        for(let i=1; i<=limit && i<dailyData.length; i++) {
            const d = dailyData[i];
            listContainer.innerHTML += `
                <div class="forecast-item">
                    <span>${d.date}</span>
                    <span>${getWeatherEmoji(d.main)}</span>
                    <span class="temp-max">${d.max}°</span>
                    <span class="temp-min">${d.min}°</span>
                    <span style="color:#66B2FF">${d.pop}%</span>
                </div>`;
        }
    } else if (activeTab === '3hours') {
        // 3時間ごとのデータ
        for(let i=1; i<=4; i++) {
            const d = weatherData.list[i];
            const time = new Date(d.dt * 1000).getHours() + "時";
            listContainer.innerHTML += `
                <div class="forecast-item">
                    <span>${time}</span>
                    <span>${getWeatherEmoji(d.weather[0].main)}</span>
                    <span class="temp-max">${Math.round(d.main.temp)}°</span>
                    <span></span>
                    <span style="color:#66B2FF">${Math.round(d.pop * 100)}%</span>
                </div>`;
        }
    }
}

// 簡易版Gemini APIによる生活アドバイス生成
async function fetchGeminiAdvice(todayWeather) {
    try {
        const prompt = `今日の天気は「${todayWeather.weather[0].description}」、気温は${todayWeather.main.temp}度、湿度は${todayWeather.main.humidity}%です。この条件に合わせて、熱中症対策や服装、傘の必要性などを含めた日常生活の短いアドバイス（100文字程度）を1文で生成してください。タイトルは不要です。`;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEYS.gemini}`;
        
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        const text = data.candidates[0].content.parts[0].text;
        document.getElementById("ai-advice").textContent = text;
    } catch (e) {
        document.getElementById("ai-advice").textContent = "外出の際は体調管理にお気をつけください。";
    }
}

// --- ニュース API連携（CORSエラー対策強化版） ---
async function fetchNews() {
    try {
        const yahooRssUrl = "https://news.yahoo.co.jp/rss/topics/top-picks.xml";
        const proxyUrl = `https://api.yacdn.org/proxy?url=${encodeURIComponent(yahooRssUrl)}`;
        
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error("プロキシサーバーのエラー");
        
        const xmlString = await res.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, "text/xml");
        
        if (xmlDoc.getElementsByTagName("parsererror").length > 0) {
            throw new Error("XMLパースエラー");
        }

        const items = xmlDoc.getElementsByTagName("item");
        const list = document.getElementById("news-list");
        list.innerHTML = "";

        const maxItems = Math.min(4, items.length);
        for (let i = 0; i < maxItems; i++) {
            const title = items[i].getElementsByTagName("title")[0].textContent;
            
            // 日付・時間の取得と整形
            const pubDateStr = items[i].getElementsByTagName("pubDate")[0].textContent;
            const pubDate = new Date(pubDateStr);
            const month = String(pubDate.getMonth() + 1).padStart(2, '0');
            const date = String(pubDate.getDate()).padStart(2, '0');
            const hours = String(pubDate.getHours()).padStart(2, '0');
            const minutes = String(pubDate.getMinutes()).padStart(2, '0');
            const timeHTML = `<span class="news-time">${month}/${date} ${hours}:${minutes}</span>`;

            // [主要] の前に日時を挿入
            list.innerHTML += `<li>${timeHTML}[主要] ${title}</li>`;
        }
    } catch (e) {
        console.error("ニュース取得エラー:", e);
        fetchFallbackNews();
    }
}

// 完全にCORSフリーで取得できる代替ニュース（フォールバック用）
async function fetchFallbackNews() {
    const list = document.getElementById("news-list");
    try {
        // 例: CORS制限のないパブリックなJSONニュースデータや、Qiita/Zenn等のトレンド（動けば何でも可）
        // ここでは、常設端末が完全に無表示になるのを防ぐため、スッキリとしたモック（またはご自身の別RSS）を表示します
        const res = await fetch("https://api.github.com/zen"); // 接続テスト用
        const text = await res.text();
        
        list.innerHTML = `
            <li>[主要] Yahoo!ニュースの取得に一時的なCORS制限が発生中</li>
            <li>[経済] システムは正常に稼働しています (1時間後に自動再試行)</li>
            <li>[時計] 現在時刻や天気予報、エアコン操作は正常です</li>
            <li>[INFO] "${text}"</li>`;
    } catch(err) {
        list.innerHTML = `
            <li>[エラー] ニュースを読み込めませんでした</li>
            <li>[対策] 端末のネットワーク接続を確認してください</li>
            <li>--</li>
            <li>--</li>`;
    }
}

// --- SwitchBot API連携 (エアコン操作) ---
// SwitchBot API v1.1 認証ヘッダーの生成とコマンド送信
async function sendAirconCommand() {
    const statusText = document.getElementById("aircon-status-text");
    statusText.textContent = `送信中... (${airconState.power.toUpperCase()} / ${airconState.temp}°C / ${airconState.mode})`;

    // APIキーが入力されていない場合はモック動作にする
    if (!API_KEYS.switchbot || !API_KEYS.switchbotSecret || !API_KEYS.switchbotDevice) {
        setTimeout(() => {
            statusText.textContent = `運転状態: ${airconState.power === 'on' ? '運転中' : '停止中'} (デモモード)`;
        }, 1000);
        return;
    }

    try {
        const token = API_KEYS.switchbot;
        const secret = API_KEYS.switchbotSecret;
        const deviceId = API_KEYS.switchbotDevice;
        const t = Date.now();
        const nonce = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);

        // SwitchBot認証用の署名(Sign)作成
        const data = token + t + nonce;
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        const msgData = encoder.encode(data);

        const cryptoKey = await crypto.subtle.importKey(
            "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        );
        const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
        const sign = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

        // コマンドパラメータの組み立て
        const modeMap = { '冷房': 2, '暖房': 5, '除湿': 3, '自動': 1 };
        const fanMap = { '自動': 'auto', '1': 1, '2': 2, '3': 3 };
        
        const body = JSON.stringify({
            "command": "setAll",
            "parameter": `${airconState.temp},${modeMap[airconState.mode] || 1},${fanMap[airconState.fan] || 'auto'},${airconState.power === 'on' ? 'on' : 'off'}`,
            "commandType": "custom"
        });

        // SwitchBot APIへのリクエスト送信 (CORS回避のためプロキシを経由させるのが安全です)
        const targetUrl = `https://api.switch-bot.com/v1.1/devices/${deviceId}/commands`;
        const proxyUrl = `https://api.yacdn.org/proxy?url=${encodeURIComponent(targetUrl)}`;

        const response = await fetch(proxyUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": token,
                "sign": sign,
                "nonce": nonce,
                "t": t.toString()
            },
            body: body
        });

        if (!response.ok) throw new Error("APIリクエストに失敗しました");
        const resData = await response.json();

        // 送信成功時の表示更新
        statusText.textContent = `運転状態: ${airconState.power === 'on' ? '運転中' : '停止中'} (${airconState.mode} ${airconState.temp}°C)`;

    } catch (error) {
        console.error("SwitchBot通信エラー:", error);
        statusText.textContent = "❌ 送信失敗 (設定または認証エラー)";
        
        // 3秒後に元の表示に戻す
        setTimeout(() => {
            statusText.textContent = `運転状態: --`;
        }, 3000);
    }
}
// --- 画面焼け対策（スクリーンセーバー） ---
function resetIdleTimer() {
    clearTimeout(idleTimer);
    hideScreensaver();
    idleTimer = setTimeout(showScreensaver, IDLE_TIME_LIMIT);
}

function showScreensaver() {
    // エアコン画面が開いていたら閉じる
    document.getElementById("aircon-screen").classList.add("hidden");
    
    const saver = document.getElementById("screensaver");
    saver.classList.remove("hidden");
    moveSaverClock();
}

function hideScreensaver() {
    document.getElementById("screensaver").classList.add("hidden");
}

// 画面焼けを防ぐため、暗転中の時計を1分ごとに画面内のランダムな位置へ移動させる
function moveSaverClock() {
    const clock = document.getElementById("saver-clock");
    const maxX = window.innerWidth - clock.clientWidth - 50;
    const maxY = window.innerHeight - clock.clientHeight - 50;
    
    const randomX = Math.max(20, Math.floor(Math.random() * maxX));
    const randomY = Math.max(20, Math.floor(Math.random() * maxY));
    
    clock.style.left = `${randomX}px`;
    clock.style.top = `${randomY}px`;
}
// 暗転中も時計が移動するようにフック
setInterval(() => {
    if(!document.getElementById("screensaver").classList.contains("hidden")) {
        moveSaverClock();
    }
}, 60000);

// --- イベントリスナー設定 ---
function setupEventListeners() {
    // 画面タップでアイドルタイマーリセット
    document.body.addEventListener("click", resetIdleTimer);
    document.getElementById("screensaver").addEventListener("click", hideScreensaver);

    // 画面左側タップでエアコン画面へ
    document.getElementById("left-section").addEventListener("click", () => {
        document.getElementById("aircon-screen").classList.remove("hidden");
    });
    document.getElementById("close-aircon").addEventListener("click", () => {
        document.getElementById("aircon-screen").classList.add("hidden");
    });

    // 天気タブ切り替え
    document.getElementById("tab-3days").addEventListener("click", (e) => switchTab(e, '3days'));
    document.getElementById("tab-3hours").addEventListener("click", (e) => switchTab(e, '3hours'));
    document.getElementById("tab-weekly").addEventListener("click", (e) => switchTab(e, 'weekly'));

    // エアコンUI操作
    document.getElementById("btn-power").addEventListener("click", () => {
        airconState.power = airconState.power === 'on' ? 'off' : 'on';
        const btn = document.getElementById("btn-power");
        btn.className = `ctrl-btn ${airconState.power === 'on' ? 'power-on' : 'power-off'}`;
        sendAirconCommand();
    });

    document.getElementById("btn-temp-up").addEventListener("click", () => {
        airconState.temp++;
        document.getElementById("target-temp").textContent = `${airconState.temp}°C`;
        sendAirconCommand();
    });
    document.getElementById("btn-temp-down").addEventListener("click", () => {
        airconState.temp--;
        document.getElementById("target-temp").textContent = `${airconState.temp}°C`;
        sendAirconCommand();
    });

    // ドロップダウン処理群
    setupDropdown("btn-mode-select", "mode-options", (val) => {
        airconState.mode = val;
        document.getElementById("btn-mode-select").textContent = `モード: ${val} ▾`;
        sendAirconCommand();
    });
    setupDropdown("btn-fan-select", "fan-options", (val) => {
        airconState.fan = val;
        document.getElementById("btn-fan-select").textContent = `風量: ${val} ▾`;
        sendAirconCommand();
    });
}

function switchTab(e, tabName) {
    document.querySelectorAll(".forecast-tabs button").forEach(b => b.classList.remove("active"));
    e.target.classList.add("active");
    activeTab = tabName;
    renderForecastList();
}

function setupDropdown(btnId, menuId, callback) {
    const btn = document.getElementById(btnId);
    const menu = document.getElementById(menuId);
    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.classList.toggle("hidden");
    });
    menu.querySelectorAll("div").forEach(item => {
        item.addEventListener("click", () => {
            callback(item.dataset.value);
            menu.classList.add("hidden");
        });
    });
    document.addEventListener("click", () => menu.classList.add("hidden"));
}

// ユーティリティ
function getWeatherEmoji(main) {
    if (main.includes("Clear")) return "☀️";
    if (main.includes("Clouds")) return "☁️";
    if (main.includes("Rain")) return "☔";
    if (main.includes("Snow")) return "❄️";
    return "✨";
}

function filterDailyData(list) {
    const daily = [];
    const dates = new Set();
    list.forEach(item => {
        const dStr = new Date(item.dt * 1000).toLocaleDateString('ja-JP', {month:'numeric', day:'numeric'});
        if (!dates.has(dStr)) {
            dates.add(dStr);
            daily.push({
                date: dStr,
                main: item.weather[0].main,
                max: Math.round(item.main.temp_max),
                min: Math.round(item.main.temp_min),
                pop: Math.round(item.pop * 100)
            });
        }
    });
    return daily;
}