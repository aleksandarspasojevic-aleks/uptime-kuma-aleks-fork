<template>
    <div v-if="runs.length > 0 || loading" class="playwright-results">
        <h4>{{ $t("Test Results") }}</h4>

        <div v-if="loading" class="text-center my-3">
            <div class="spinner-border spinner-border-sm" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
        </div>

        <div v-else-if="runs.length > 0" class="table-responsive">
            <table class="table table-hover table-sm">
                <thead>
                    <tr>
                        <th>{{ $t("Test Name") }}</th>
                        <th>{{ $t("Status") }}</th>
                        <th>{{ $t("Date") }}</th>
                        <th>{{ $t("Report") }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="run in runs" :key="run.id || run.time">
                        <td>{{ run.test_name }}</td>
                        <td>
                            <span :class="statusBadgeClass(run.status)">
                                {{ statusLabel(run.status) }}
                            </span>
                        </td>
                        <td>{{ formatDate(run.time) }}</td>
                        <td>
                            <a
                                v-if="run.report_path"
                                :href="reportURL(run.report_path)"
                                target="_blank"
                                class="btn btn-sm btn-outline-primary"
                            >
                                {{ $t("View Report") }}
                            </a>
                            <span v-else class="text-muted">—</span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div v-else class="text-muted my-3">
            {{ $t("No test results yet") }}
        </div>
    </div>
</template>

<script>
import dayjs from "dayjs";
import { getResBaseURL } from "../util-frontend";

export default {
    props: {
        monitorId: {
            type: Number,
            required: true,
        },
    },

    data() {
        return {
            runs: [],
            loading: true,
        };
    },

    watch: {
        monitorId: {
            handler() {
                this.fetchRuns();
            },
            immediate: true,
        },

        "$root.playwrightTestData": {
            handler(data) {
                if (data && data[this.monitorId]) {
                    this.runs = data[this.monitorId];
                    this.loading = false;
                }
            },
            deep: true,
        },
    },

    mounted() {
        this.fetchRuns();
    },

    methods: {
        fetchRuns() {
            this.loading = true;
            this.$root.getSocket().emit("getPlaywrightTestRuns", this.monitorId, (res) => {
                this.loading = false;
                if (res.ok) {
                    this.runs = res.runs;
                }
            });
        },

        statusBadgeClass(status) {
            const map = {
                passed: "badge bg-success",
                failed: "badge bg-danger",
                timedout: "badge bg-warning text-dark",
                error: "badge bg-warning text-dark",
            };
            return map[status] || "badge bg-secondary";
        },

        statusLabel(status) {
            const map = {
                passed: this.$t("Passed"),
                failed: this.$t("Failed"),
                timedout: this.$t("Timed Out"),
                error: this.$t("Error"),
            };
            return map[status] || status;
        },

        formatDate(time) {
            return dayjs(time).format("YYYY-MM-DD HH:mm:ss");
        },

        reportURL(reportPath) {
            return getResBaseURL() + "/playwright-reports/" + reportPath;
        },
    },
};
</script>

<style lang="scss" scoped>
.playwright-results {
    margin-top: 20px;

    .table {
        th {
            font-weight: 600;
            white-space: nowrap;
        }
    }

    .badge {
        font-size: 0.8em;
    }
}
</style>
