exports.up = function (knex) {
    return knex.schema
        .alterTable("monitor", function (table) {
            table.boolean("playwright_test_enabled").notNullable().defaultTo(false);
            table.integer("playwright_test_interval").notNullable().defaultTo(3600);
        })
        .then(() => {
            return knex.schema.createTable("playwright_test", function (table) {
                table.increments("id").primary();
                table.integer("monitor_id").unsigned().notNullable()
                    .references("id").inTable("monitor")
                    .onDelete("CASCADE").onUpdate("CASCADE");
                table.string("name", 255).notNullable();
                table.string("filename", 255).notNullable();
                table.boolean("active").notNullable().defaultTo(true);
                table.datetime("created_date").notNullable();
                table.index(["monitor_id"], "playwright_test_monitor_id");
            });
        })
        .then(() => {
            return knex.schema.createTable("playwright_test_run", function (table) {
                table.increments("id").primary();
                table.integer("monitor_id").unsigned().notNullable()
                    .references("id").inTable("monitor")
                    .onDelete("CASCADE").onUpdate("CASCADE");
                table.integer("playwright_test_id").unsigned().notNullable()
                    .references("id").inTable("playwright_test")
                    .onDelete("CASCADE").onUpdate("CASCADE");
                table.datetime("time").notNullable();
                table.string("status", 20).notNullable();
                table.integer("duration").notNullable().defaultTo(0);
                table.text("error_message").nullable();
                table.string("report_path", 500).nullable();
                table.index(["monitor_id", "time"], "playwright_test_run_monitor_time");
            });
        });
};

exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists("playwright_test_run")
        .then(() => knex.schema.dropTableIfExists("playwright_test"))
        .then(() => {
            return knex.schema.alterTable("monitor", function (table) {
                table.dropColumn("playwright_test_enabled");
                table.dropColumn("playwright_test_interval");
            });
        });
};
