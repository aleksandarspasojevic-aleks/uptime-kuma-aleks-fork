exports.up = function (knex) {
    return knex.schema
        .alterTable("monitor", function (table) {
            table.boolean("lighthouse_enabled").notNullable().defaultTo(false);
            table.integer("lighthouse_interval").notNullable().defaultTo(3600);
        })
        .then(() => {
            return knex.schema.createTable("lighthouse_result", function (table) {
                table.increments("id").primary();
                table.integer("monitor_id").unsigned().notNullable()
                    .references("id").inTable("monitor")
                    .onDelete("CASCADE")
                    .onUpdate("CASCADE");
                table.datetime("time").notNullable();
                table.integer("performance").nullable();
                table.integer("accessibility").nullable();
                table.integer("best_practices").nullable();
                table.integer("seo").nullable();
                table.index(["monitor_id", "time"], "lighthouse_result_monitor_time");
            });
        });
};

exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists("lighthouse_result")
        .then(() => {
            return knex.schema.alterTable("monitor", function (table) {
                table.dropColumn("lighthouse_enabled");
                table.dropColumn("lighthouse_interval");
            });
        });
};
