const TOSHIMA_LAT = 35.7313;
const TOSHIMA_LNG = 139.7107;

const WEATHER_ICON_MAP = {
    0: '🌤️',      // Clear sky
    1: '🌤️',      // Mainly clear
    2: '⛅',      // Partly cloudy
    3: '☁️',      // Overcast
    45: '🌫️',     // Foggy
    48: '🌫️',     // Depositing rime fog
    51: '🌧️',     // Light drizzle
    53: '🌧️',     // Moderate drizzle
    55: '🌧️',     // Dense drizzle
    61: '🌧️',     // Slight rain
    63: '🌧️',     // Moderate rain
    65: '⛈️',     // Heavy rain
    71: '❄️',      // Slight snow
    73: '❄️',      // Moderate snow
    75: '❄️',      // Heavy snow
    77: '❄️',      // Snow grains
    80: '🌧️',     // Slight rain showers
    81: '⛈️',     // Moderate rain showers
    82: '⛈️',     // Violent rain showers
    85: '❄️',      // Slight snow showers
    86: '❄️',      // Heavy snow showers
    95: '⛈️',     // Thunderstorm
    96: '⛈️',     // Thunderstorm with slight hail
    97: '⛈️'      // Thunderstorm with heavy hail
};

class Weather {
    constructor() {
        this.cacheTime = null;
        this.cachedWeather = null;
        this.cachedForecast = null;
        this.cacheExpiry = 60 * 60 * 1000; // 1時間
    }

    async fetchWeather() {
        // キャッシュをチェック
        if (this.cachedWeather && this.cacheTime && Date.now() - this.cacheTime < this.cacheExpiry) {
            return this.cachedWeather;
        }

        try {
            const response = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${TOSHIMA_LAT}&longitude=${TOSHIMA_LNG}&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&timezone=Asia/Tokyo`
            );

            if (!response.ok) throw new Error('Weather API error');

            const data = await response.json();
            const current = data.current;

            this.cachedWeather = {
                temperature: Math.round(current.temperature_2m),
                code: current.weather_code,
                icon: WEATHER_ICON_MAP[current.weather_code] || '🌤️'
            };

            // 一日の天気予報も保存
            this.cachedForecast = this.processDailyForecast(data.hourly);

            this.cacheTime = Date.now();
            return this.cachedWeather;
        } catch (error) {
            console.error('Failed to fetch weather:', error);
            return {
                temperature: '--',
                icon: '❌'
            };
        }
    }

    processDailyForecast(hourly) {
        const times = hourly.time;
        const codes = hourly.weather_code;
        const temps = hourly.temperature_2m;

        const today = new Date().toISOString().split('T')[0];
        const forecast = [];

        for (let i = 0; i < times.length; i++) {
            const time = times[i];
            if (time.startsWith(today)) {
                const hour = parseInt(time.split('T')[1].split(':')[0]);
                forecast.push({
                    hour,
                    time: time.split('T')[1].substring(0, 5),
                    temp: Math.round(temps[i]),
                    code: codes[i],
                    icon: WEATHER_ICON_MAP[codes[i]] || '🌤️'
                });
            }
        }

        return forecast;
    }

    getDailyForecast() {
        return this.cachedForecast || [];
    }

    async updateWeatherDisplay() {
        const weather = await this.fetchWeather();
        const tempEl = document.getElementById('weatherTemp');
        const iconEl = document.getElementById('weatherIcon');

        if (tempEl) tempEl.textContent = `${weather.temperature}°C`;
        if (iconEl) iconEl.textContent = weather.icon;

        // 一日の天気を表示
        this.displayDailyForecast();
    }

    displayDailyForecast() {
        const forecastContainer = document.getElementById('dailyForecast');
        if (!forecastContainer) return;

        const forecast = this.getDailyForecast();
        if (forecast.length === 0) return;

        // 6時間ごとに表示（6, 12, 18, 21時）
        const selectedTimes = [6, 9, 12, 15, 18, 21];
        const html = selectedTimes
            .map(hour => {
                const data = forecast.find(f => f.hour === hour);
                if (!data) return '';
                return `
                    <div class="forecast-item">
                        <div class="forecast-time">${data.time}</div>
                        <div class="forecast-icon">${data.icon}</div>
                        <div class="forecast-temp">${data.temp}°C</div>
                    </div>
                `;
            })
            .join('');

        forecastContainer.innerHTML = html;
    }
}

const weather = new Weather();
