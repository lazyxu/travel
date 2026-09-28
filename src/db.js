import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://travel:travel@127.0.0.1:5432/travel',
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000
});

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS trips (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        destination TEXT NOT NULL DEFAULT '',
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK (end_date >= start_date)
      );

      CREATE TABLE IF NOT EXISTS trip_days (
        id BIGSERIAL PRIMARY KEY,
        trip_id BIGINT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        day_date DATE NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        UNIQUE (trip_id, day_date)
      );

      CREATE TABLE IF NOT EXISTS itinerary_items (
        id BIGSERIAL PRIMARY KEY,
        day_id BIGINT NOT NULL REFERENCES trip_days(id) ON DELETE CASCADE,
        item_time VARCHAR(5) NOT NULL DEFAULT '',
        category VARCHAR(20) NOT NULL DEFAULT '其他',
        title TEXT NOT NULL,
        location TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        xhs_url TEXT NOT NULL DEFAULT '',
        dianping_url TEXT NOT NULL DEFAULT '',
        image_urls TEXT[] NOT NULL DEFAULT '{}',
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      ALTER TABLE itinerary_items
        ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';

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

      CREATE INDEX IF NOT EXISTS idx_trip_days_trip_date ON trip_days(trip_id, day_date);
      CREATE INDEX IF NOT EXISTS idx_items_day_position ON itinerary_items(day_id, position, item_time);
      CREATE INDEX IF NOT EXISTS idx_todos_trip_done_position ON todos(trip_id, done, position);
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
