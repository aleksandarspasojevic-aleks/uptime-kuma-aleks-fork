<template>
    <div class="lighthouse-gauge">
        <svg viewBox="0 0 120 120" class="gauge-svg">
            <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                :stroke="trackColor"
                stroke-width="8"
            />
            <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                :stroke="scoreColor"
                stroke-width="8"
                stroke-linecap="round"
                :stroke-dasharray="circumference"
                :stroke-dashoffset="dashOffset"
                class="gauge-arc"
                transform="rotate(-90 60 60)"
            />
            <text x="60" y="55" text-anchor="middle" class="gauge-score" :fill="scoreColor">
                {{ score !== null && score !== undefined ? score : '—' }}
            </text>
            <text x="60" y="72" text-anchor="middle" class="gauge-label">
                {{ label }}
            </text>
        </svg>
    </div>
</template>

<script>
export default {
    props: {
        score: {
            type: Number,
            default: null,
        },
        label: {
            type: String,
            required: true,
        },
    },
    computed: {
        circumference() {
            return 2 * Math.PI * 54;
        },
        dashOffset() {
            if (this.score === null || this.score === undefined) {
                return this.circumference;
            }
            return this.circumference * (1 - this.score / 100);
        },
        scoreColor() {
            if (this.score === null || this.score === undefined) {
                return "var(--bs-secondary)";
            }
            if (this.score >= 90) {
                return "#0cce6b";
            }
            if (this.score >= 50) {
                return "#ffa400";
            }
            return "#ff4e42";
        },
        trackColor() {
            return "var(--bs-border-color, #dee2e6)";
        },
    },
};
</script>

<style lang="scss" scoped>
.lighthouse-gauge {
    display: inline-block;
    width: 120px;
    text-align: center;
}

.gauge-svg {
    width: 100%;
    height: auto;
}

.gauge-arc {
    transition: stroke-dashoffset 0.6s ease;
}

.gauge-score {
    font-size: 28px;
    font-weight: 700;
}

.gauge-label {
    font-size: 10px;
    fill: var(--bs-body-color, #333);
    font-weight: 500;
}
</style>
