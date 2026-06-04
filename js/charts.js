window.ChartsEngine = {
    trendChartInst: null,
    doughnutChartInst: null,
    barChartInst: null,

    getColors: () => {
        const isDark = document.body.classList.contains('dark-theme');
        return {
            text: isDark ? '#FFFFFF' : '#111111',
            grid: isDark ? '#2C2C2C' : '#ECECEC',
            green: '#00D26A',
            red: isDark ? '#FF6B6B' : '#FF4A4A',
            palette: ['#FF4A4A', '#FFA800', '#FFCD00', '#3A5DFF', '#6E4BFF', '#26D9B0', '#9FA1A6']
        };
    },

    render: (filteredData, allDataBeforeStart, startDate) => {
        if (typeof Chart === 'undefined') {
            setTimeout(() => window.ChartsEngine.render(filteredData, allDataBeforeStart, startDate), 500);
            return;
        }

        const colors = window.ChartsEngine.getColors();
        
        // 1. BREAKDOWN CHART (Now a Horizontal Bar Graph)
        const pieMetric = document.getElementById('chart-pie-metric')?.value || 'expense';
        const pieDataMap = {};
        
        filteredData.forEach(e => {
            if (pieMetric === 'expense' && e.amount < 0) {
                const cat = e.category || 'Uncategorized';
                pieDataMap[cat] = (pieDataMap[cat] || 0) + Math.abs(e.amount);
            } else if (pieMetric === 'income' && e.amount > 0) {
                const cat = e.category || 'Income';
                pieDataMap[cat] = (pieDataMap[cat] || 0) + e.amount;
            }
        });

        const ctxPie = document.getElementById('doughnutChart');
        if (ctxPie) {
            if (window.ChartsEngine.doughnutChartInst) window.ChartsEngine.doughnutChartInst.destroy();
            
            // Sort by amount descending
            const sortedKeys = Object.keys(pieDataMap).sort((a,b) => pieDataMap[b] - pieDataMap[a]);
            const sortedData = sortedKeys.map(k => pieDataMap[k]);

            window.ChartsEngine.doughnutChartInst = new Chart(ctxPie, {
                type: 'bar', // Changed to Bar
                data: {
                    labels: sortedKeys.length ? sortedKeys : ['No Data'],
                    datasets: [{
                        label: 'Amount',
                        data: sortedData.length ? sortedData : [0],
                        backgroundColor: sortedData.length ? colors.palette : [colors.grid],
                        borderRadius: 4
                    }]
                },
                options: {
                    indexAxis: 'y', // Makes it horizontal
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                        x: { ticks: { color: colors.text }, grid: { color: colors.grid } },
                        y: { ticks: { color: colors.text }, grid: { display: false } }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: function(c) { return ` ${window.formatMoney(c.raw)}`; } } }
                    }
                }
            });
        }

        let sumInc = 0; let sumExp = 0;
        filteredData.forEach(e => { if (e.amount > 0) sumInc += e.amount; else if (e.amount < 0) sumExp += Math.abs(e.amount); });

        const ctxBar = document.getElementById('barChart');
        if (ctxBar) {
            if (window.ChartsEngine.barChartInst) window.ChartsEngine.barChartInst.destroy();
            window.ChartsEngine.barChartInst = new Chart(ctxBar, {
                type: 'bar',
                data: {
                    labels: ['Cash Flow'],
                    datasets: [
                        { label: 'Income', data: [sumInc], backgroundColor: colors.green, borderRadius: 8 },
                        { label: 'Expenses', data: [sumExp], backgroundColor: colors.red, borderRadius: 8 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: { y: { ticks: { color: colors.text }, grid: { color: colors.grid } }, x: { ticks: { color: colors.text }, grid: { display: false } } },
                    plugins: { legend: { labels: { color: colors.text, font: { family: "'DM Sans', sans-serif" } } }, tooltip: { callbacks: { label: function(c) { return ` ${window.formatMoney(c.raw)}`; } } } }
                }
            });
        }

        const tMetric = document.getElementById('chart-metric')?.value || 'net_balance';
        const tGran = document.getElementById('chart-granularity')?.value || 'daily';
        
        let tLabels = []; let tData = [];
        const chronoData = [...filteredData].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        if (tGran === 'transaction') {
            let runningBal = parseFloat(window.userSettings.balance) || 0;
            allDataBeforeStart.forEach(e => runningBal += e.amount);

            chronoData.forEach(e => {
                tLabels.push(e.name || window.formatListDate(e.timestamp));
                if (tMetric === 'net_balance') { runningBal += e.amount; tData.push(runningBal); }
                else if (tMetric === 'net_income') { tData.push(e.amount); }
                else if (tMetric === 'income' && e.amount > 0) { tData.push(e.amount); }
                else if (tMetric === 'expenses' && e.amount < 0) { tData.push(Math.abs(e.amount)); }
                else if (tMetric === 'tx_count') { tData.push(1); }
            });
        } else {
            const grouped = {};
            let runningBal = parseFloat(window.userSettings.balance) || 0;
            allDataBeforeStart.forEach(e => runningBal += e.amount);

            chronoData.forEach(e => {
                const day = window.formatListDate(e.timestamp);
                if (!grouped[day]) grouped[day] = { inc: 0, exp: 0, net: 0, tx: 0 };
                grouped[day].net += e.amount; grouped[day].tx += 1;
                if (e.amount > 0) grouped[day].inc += e.amount; else grouped[day].exp += Math.abs(e.amount);
            });

            Object.keys(grouped).forEach(day => {
                tLabels.push(day);
                if (tMetric === 'net_balance') { runningBal += grouped[day].net; tData.push(runningBal); }
                else if (tMetric === 'net_income') { tData.push(grouped[day].net); }
                else if (tMetric === 'income') { tData.push(grouped[day].inc); }
                else if (tMetric === 'expenses') { tData.push(grouped[day].exp); }
                else if (tMetric === 'tx_count') { tData.push(grouped[day].tx); }
            });
        }

        const ctxTrend = document.getElementById('trendChart');
        if (ctxTrend) {
            if (window.ChartsEngine.trendChartInst) window.ChartsEngine.trendChartInst.destroy();
            const isBar = tMetric === 'tx_count';
            window.ChartsEngine.trendChartInst = new Chart(ctxTrend, {
                type: isBar ? 'bar' : 'line',
                data: {
                    labels: tLabels.length ? tLabels : ['No Data'],
                    datasets: [{
                        label: 'Trend',
                        data: tData.length ? tData : [0],
                        borderColor: colors.green,
                        backgroundColor: isBar ? colors.green : 'rgba(0, 210, 106, 0.1)',
                        fill: !isBar, tension: 0.3, pointRadius: tGran === 'transaction' ? 2 : 4, borderRadius: isBar ? 4 : 0
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: { y: { ticks: { color: colors.text }, grid: { color: colors.grid } }, x: { ticks: { color: colors.text }, grid: { display: false } } },
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return tMetric === 'tx_count' ? ` ${c.raw} tx` : ` ${window.formatMoney(c.raw)}`; } } } }
                }
            });
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ['chart-metric', 'chart-granularity', 'chart-pie-metric'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => { if(window.renderStatistics) window.renderStatistics(window.currentStatRange || '30'); });
    });
});