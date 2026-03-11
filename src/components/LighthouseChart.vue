<template>
    <div>
        <div class="chart-wrapper" :class="{ loading: loading }">
            <Line :data="chartData" :options="chartOptions" />
        </div>
    </div>
</template>

<script lang="js">
import {
    Chart,
    Filler,
    LinearScale,
    LineController,
    LineElement,
    PointElement,
    TimeScale,
    Tooltip,
    Legend,
} from "chart.js";
import "chartjs-adapter-dayjs-4";
import { Line } from "vue-chartjs";

Chart.register(
    LineController,
    LineElement,
    PointElement,
    TimeScale,
    LinearScale,
    Tooltip,
    Filler,
    Legend
);

export default {
    components: { Line },
    props: {
        monitorId: {
            type: Number,
            required: true,
        },
    },
    data() {
        return {
            loading: false,
        };
    },
    computed: {
        lighthouseData() {
            return this.$root.lighthouseData?.[this.monitorId] || [];
        },
        chartOptions() {
            return {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        left: 10,
                        right: 30,
                        top: 30,
                        bottom: 10,
                    },
                },
                elements: {
                    point: {
                        radius: 3,
                        hitRadius: 20,
                    },
                },
                scales: {
                    x: {
                        type: "time",
                        time: {
                            minUnit: "hour",
                            round: "minute",
                            tooltipFormat: "YYYY-MM-DD HH:mm",
                            displayFormats: {
                                hour: "MM-DD HH:mm",
                                day: "MM-DD",
                            },
                        },
                        ticks: {
                            sampleSize: 3,
                            maxRotation: 0,
                            autoSkipPadding: 30,
                        },
                        grid: {
                            color: this.$root.theme === "light" ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)",
                        },
                    },
                    y: {
                        min: 0,
                        max: 100,
                        title: {
                            display: true,
                            text: this.$t("Score"),
                        },
                        grid: {
                            color: this.$root.theme === "light" ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)",
                        },
                    },
                },
                plugins: {
                    tooltip: {
                        mode: "index",
                        intersect: false,
                        padding: 10,
                        backgroundColor: this.$root.theme === "light" ? "rgba(255,255,255,0.95)" : "rgba(32,42,38,0.95)",
                        bodyColor: this.$root.theme === "light" ? "#333" : "#ddd",
                        titleColor: this.$root.theme === "light" ? "#333" : "#ddd",
                        borderColor: this.$root.theme === "light" ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.1)",
                        borderWidth: 1,
                    },
                    legend: {
                        display: true,
                        position: "top",
                        align: "start",
                        labels: {
                            color: this.$root.theme === "light" ? "#333" : "#ddd",
                            usePointStyle: true,
                            pointStyle: "circle",
                        },
                    },
                },
            };
        },
        chartData() {
            const sorted = [...this.lighthouseData].sort((a, b) => new Date(a.time) - new Date(b.time));

            const perfData = [];
            const a11yData = [];
            const bpData = [];
            const seoData = [];

            for (const row of sorted) {
                const x = row.time;
                perfData.push({ x, y: row.performance });
                a11yData.push({ x, y: row.accessibility });
                bpData.push({ x, y: row.best_practices ?? row.bestPractices });
                seoData.push({ x, y: row.seo });
            }

            return {
                datasets: [
                    {
                        label: this.$t("Performance"),
                        data: perfData,
                        borderColor: "#0cce6b",
                        backgroundColor: "#0cce6b22",
                        fill: false,
                        tension: 0.3,
                    },
                    {
                        label: this.$t("Accessibility"),
                        data: a11yData,
                        borderColor: "#4a90d9",
                        backgroundColor: "#4a90d922",
                        fill: false,
                        tension: 0.3,
                    },
                    {
                        label: this.$t("Best Practices"),
                        data: bpData,
                        borderColor: "#ffa400",
                        backgroundColor: "#ffa40022",
                        fill: false,
                        tension: 0.3,
                    },
                    {
                        label: this.$t("SEO"),
                        data: seoData,
                        borderColor: "#ff4e42",
                        backgroundColor: "#ff4e4222",
                        fill: false,
                        tension: 0.3,
                    },
                ],
            };
        },
    },
    created() {
        this.loading = true;
        this.$root.getSocket().emit("getLighthouseResults", this.monitorId, (res) => {
            if (!res.ok) {
                this.$root.toastError(res.msg);
            }
            this.loading = false;
        });
    },
};
</script>

<style lang="scss" scoped>
.chart-wrapper {
    position: relative;
    height: 250px;
    margin-bottom: 0.5em;

    &.loading {
        filter: blur(10px);
    }
}
</style>
