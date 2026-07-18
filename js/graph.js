class Graph {
    constructor() {
        this.chart = null;
        this.loadChartLibrary();
    }

    loadChartLibrary() {
        if (!window.Chart) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.onload = () => {
                console.log('Chart.js loaded');
            };
            document.head.appendChild(script);
        }
    }

    displayVolumeChart() {
        const canvas = document.getElementById('volumeChart');
        if (!canvas) return;

        // データ取得
        const records = storage.getRecords();
        const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
        const volumeData = [0, 0, 0, 0, 0, 0, 0];
        const countData = [0, 0, 0, 0, 0, 0, 0];

        for (const dateStr in records) {
            const date = new Date(dateStr);
            const dayOfWeek = date.getDay();

            for (const dayIndex in records[dateStr]) {
                const dayRecords = records[dateStr][dayIndex];
                if (dayRecords) {
                    for (const exerciseName in dayRecords) {
                        const sets = dayRecords[exerciseName].sets || [];
                        const totalReps = sets.reduce((sum, reps) => sum + parseInt(reps || 0), 0);
                        volumeData[dayOfWeek] += totalReps;
                        countData[dayOfWeek]++;
                    }
                }
            }
        }

        // 平均を計算
        const avgData = volumeData.map((vol, idx) => countData[idx] > 0 ? Math.round(vol / countData[idx]) : 0);

        // Chart.jsが読み込まれるまで待機
        const waitForChart = setInterval(() => {
            if (window.Chart) {
                clearInterval(waitForChart);

                if (this.chart) {
                    this.chart.destroy();
                }

                this.chart = new Chart(canvas, {
                    type: 'bar',
                    data: {
                        labels: dayNames,
                        datasets: [{
                            label: '総回数',
                            data: volumeData,
                            backgroundColor: 'rgba(102, 126, 234, 0.7)',
                            borderColor: 'rgba(102, 126, 234, 1)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        indexAxis: 'x',
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top'
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: Math.max(...volumeData, 100)
                            }
                        }
                    }
                });
            }
        }, 100);

        // タイムアウト設定（最大5秒待機）
        setTimeout(() => clearInterval(waitForChart), 5000);
    }
}

const graph = new Graph();
