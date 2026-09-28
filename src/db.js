import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://travel:travel@127.0.0.1:5432/travel',
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000
});

const MIGRATIONS = [
  {
    version: 1,
    name: 'baseline_20260928',
    sql: `
      CREATE TABLE IF NOT EXISTS trips (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        destination TEXT NOT NULL DEFAULT '',
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        budget_total NUMERIC(14,2) NOT NULL DEFAULT 0,
        currency VARCHAR(3) NOT NULL DEFAULT 'CNY',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK (end_date >= start_date)
      );

      ALTER TABLE trips ADD COLUMN IF NOT EXISTS budget_total NUMERIC(14,2) NOT NULL DEFAULT 0;
      ALTER TABLE trips ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'CNY';

      CREATE TABLE IF NOT EXISTS trip_days (
        id BIGSERIAL PRIMARY KEY,
        trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        day_date DATE NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        route_mode VARCHAR(12) NOT NULL DEFAULT 'driving',
        position INTEGER NOT NULL DEFAULT 0,
        UNIQUE (trip_id, day_date)
      );

      ALTER TABLE trip_days ADD COLUMN IF NOT EXISTS route_mode VARCHAR(12) NOT NULL DEFAULT 'driving';

      CREATE TABLE IF NOT EXISTS itinerary_items (
        id BIGSERIAL PRIMARY KEY,
        day_id BIGINT NOT NULL REFERENCES trip_days(id) ON DELETE CASCADE,
        item_time VARCHAR(5) NOT NULL DEFAULT '',
        start_time VARCHAR(5) NOT NULL DEFAULT '',
        end_time VARCHAR(5) NOT NULL DEFAULT '',
        category VARCHAR(20) NOT NULL DEFAULT '其他',
        title TEXT NOT NULL,
        location_name TEXT NOT NULL DEFAULT '',
        location_uid TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        coord_type VARCHAR(10) NOT NULL DEFAULT 'bd09ll',
        notes TEXT NOT NULL DEFAULT '',
        xhs_url TEXT NOT NULL DEFAULT '',
        dianping_url TEXT NOT NULL DEFAULT '',
        links JSONB NOT NULL DEFAULT '[]'::jsonb,
        image_urls TEXT[] NOT NULL DEFAULT '{}',
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS location_name TEXT NOT NULL DEFAULT '';
      ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS location_uid TEXT NOT NULL DEFAULT '';
      ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';
      ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS start_time VARCHAR(5) NOT NULL DEFAULT '';
      ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS end_time VARCHAR(5) NOT NULL DEFAULT '';
      ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
      ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
      ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS coord_type VARCHAR(10) NOT NULL DEFAULT 'bd09ll';
      ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'::jsonb;
      ALTER TABLE itinerary_items ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb;

      UPDATE itinerary_items
         SET start_time = item_time
       WHERE start_time = '' AND item_time <> '';

      UPDATE itinerary_items
         SET links =
           (CASE WHEN xhs_url <> '' THEN jsonb_build_array(jsonb_build_object('url', xhs_url, 'title', '小红书')) ELSE '[]'::jsonb END)
           ||
           (CASE WHEN dianping_url <> '' THEN jsonb_build_array(jsonb_build_object('url', dianping_url, 'title', '大众点评')) ELSE '[]'::jsonb END)
       WHERE links = '[]'::jsonb
         AND (xhs_url <> '' OR dianping_url <> '');

      CREATE TABLE IF NOT EXISTS todos (
        id BIGSERIAL PRIMARY KEY,
        trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        due_date DATE,
        done BOOLEAN NOT NULL DEFAULT false,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id BIGSERIAL PRIMARY KEY,
        trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        item_id BIGINT REFERENCES itinerary_items(id) ON DELETE SET NULL,
        expense_date DATE,
        category VARCHAR(30) NOT NULL DEFAULT '其他',
        title TEXT NOT NULL,
        amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
        paid BOOLEAN NOT NULL DEFAULT false,
        notes TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_trip_days_trip_date ON trip_days(trip_id, day_date);
      CREATE INDEX IF NOT EXISTS idx_items_day_position ON itinerary_items(day_id, position, start_time, item_time);
      CREATE INDEX IF NOT EXISTS idx_todos_trip_done_position ON todos(trip_id, done, position);
      CREATE INDEX IF NOT EXISTS idx_expenses_trip_date_position ON expenses(trip_id, expense_date, position, id);
    `
  },
  {
    version: 2,
    name: 'leg_modes_and_readonly_shares',
    sql: `
      ALTER TABLE trip_days ADD COLUMN IF NOT EXISTS leg_modes JSONB NOT NULL DEFAULT '{}'::jsonb;

      CREATE TABLE IF NOT EXISTS trip_shares (
        id BIGSERIAL PRIMARY KEY,
        trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        token_hash CHAR(64) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        revoked_at TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_trip_shares_trip_active
        ON trip_shares(trip_id, created_at DESC)
        WHERE revoked_at IS NULL;
    `
  }
];

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const appliedResult = await client.query('SELECT version FROM schema_migrations ORDER BY version');
    const applied = new Set(appliedResult.rows.map(row => Number(row.version)));

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      await client.query('BEGIN');
      try {
        console.log(`[travel] applying migration ${migration.version}: ${migration.name}`);
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
          [migration.version, migration.name]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

export async function migrationStatus() {
  const result = await pool.query(
    'SELECT version, name, applied_at FROM schema_migrations ORDER BY version'
  );
  return {
    currentVersion: result.rows.length ? Number(result.rows[result.rows.length - 1].version) : 0,
    latestVersion: MIGRATIONS[MIGRATIONS.length - 1]?.version || 0,
    applied: result.rows
  };
}

export async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
