const BODY_PARTS = {
    // 曜日ごとのトレーニング部位
    0: { label: '日曜日', parts: [], status: '休み' },
    1: { label: '月曜日', parts: ['chest', 'shoulder', 'triceps'], status: '胸メイン' },
    2: { label: '火曜日', parts: ['back', 'biceps'], status: '広がりメイン' },
    3: { label: '水曜日', parts: ['leg', 'abs'], status: '脚・腹筋' },
    4: { label: '木曜日', parts: [], status: '休み' },
    5: { label: '金曜日', parts: ['shoulder', 'chest', 'triceps'], status: '肩メイン' },
    6: { label: '土曜日', parts: ['back', 'biceps'], status: '厚みメイン' }
};

class BodyMap {
    constructor() {
        this.colors = {
            chest: '#FF6B6B',
            back: '#4ECDC4',
            shoulder: '#FFD93D',
            biceps: '#6BCB77',
            triceps: '#4D96FF',
            leg: '#FF8B94',
            abs: '#FFA07A',
            default: '#E0E0E0'
        };
    }

    generateBodySVG(dayIndex) {
        const bodyParts = BODY_PARTS[dayIndex];
        const activeParts = bodyParts.parts || [];

        const svg = `
            <svg viewBox="0 0 200 400" xmlns="http://www.w3.org/2000/svg" class="body-map-svg">
                <!-- 頭 -->
                <circle cx="100" cy="40" r="25" fill="${this.getPartColor('head', activeParts)}" stroke="#333" stroke-width="2"/>

                <!-- 胸・背中 -->
                <ellipse cx="100" cy="100" rx="35" ry="50" fill="${this.getPartColor('chest', activeParts)}" stroke="#333" stroke-width="2"/>

                <!-- 腹筋 -->
                <rect x="80" y="145" width="40" height="35" fill="${this.getPartColor('abs', activeParts)}" stroke="#333" stroke-width="2" rx="5"/>

                <!-- 肩 -->
                <circle cx="65" cy="85" r="18" fill="${this.getPartColor('shoulder', activeParts)}" stroke="#333" stroke-width="2"/>
                <circle cx="135" cy="85" r="18" fill="${this.getPartColor('shoulder', activeParts)}" stroke="#333" stroke-width="2"/>

                <!-- 上腕二頭筋 -->
                <rect x="45" y="100" width="15" height="40" fill="${this.getPartColor('biceps', activeParts)}" stroke="#333" stroke-width="2" rx="7"/>
                <rect x="140" y="100" width="15" height="40" fill="${this.getPartColor('biceps', activeParts)}" stroke="#333" stroke-width="2" rx="7"/>

                <!-- 上腕三頭筋 -->
                <rect x="30" y="105" width="12" height="35" fill="${this.getPartColor('triceps', activeParts)}" stroke="#333" stroke-width="2" rx="5"/>
                <rect x="158" y="105" width="12" height="35" fill="${this.getPartColor('triceps', activeParts)}" stroke="#333" stroke-width="2" rx="5"/>

                <!-- 脚 -->
                <rect x="75" y="185" width="20" height="70" fill="${this.getPartColor('leg', activeParts)}" stroke="#333" stroke-width="2" rx="5"/>
                <rect x="105" y="185" width="20" height="70" fill="${this.getPartColor('leg', activeParts)}" stroke="#333" stroke-width="2" rx="5"/>

                <!-- テキスト -->
                <text x="100" y="380" font-size="14" font-weight="bold" text-anchor="middle" fill="#333">
                    ${BODY_PARTS[dayIndex].label}
                </text>
            </svg>
        `;

        return svg;
    }

    getPartColor(part, activeParts) {
        if (part === 'head') return this.colors.default;
        if (activeParts.includes(part)) {
            return this.colors[part] || this.colors.default;
        }
        return this.colors.default;
    }

    displayBodyMap(dayIndex) {
        const container = document.getElementById('bodyMapContainer');
        if (!container) return;

        const svg = this.generateBodySVG(dayIndex);
        container.innerHTML = svg;
    }
}

const bodyMap = new BodyMap();
