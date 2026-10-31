// Boots an in-process Postgres (PGlite) shaped like a Supabase project:
// auth schema + auth.uid(), the anon/authenticated/service_role roles and
// Supabase's default grants — then applies our real migration and seed.
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SUPABASE_BOOTSTRAP = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
    id uuid primary key,
    email text unique not null,
    encrypted_password text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

// Return dates/timestamps as the strings Postgres prints (like PostgREST does)
// and numerics as numbers — avoids local-timezone shifts in JS Date parsing.
const PARSERS = {
    1082: (v) => v,           // date
    1114: (v) => v,           // timestamp
    1184: (v) => v,           // timestamptz
    1700: (v) => Number(v)    // numeric
};

export async function createDatabase({ seed = true } = {}) {
    const db = new PGlite({ extensions: { btree_gist }, parsers: PARSERS });
    await db.exec(SUPABASE_BOOTSTRAP);
    const migrations = readdirSync(join(ROOT, 'supabase', 'migrations')).filter(f => f.endsWith('.sql')).sort();
    for (const file of migrations) {
        await db.exec(readFileSync(join(ROOT, 'supabase', 'migrations', file), 'utf8'));
    }
    if (seed) await db.exec(readFileSync(join(ROOT, 'supabase', 'seed.sql'), 'utf8'));
    return wrap(db);
}

function wrap(db) {
    // Serialise access — PGlite is a single connection
    let queue = Promise.resolve();
    const exclusive = (fn) => {
        const run = queue.then(fn, fn);
        queue = run.catch(() => {});
        return run;
    };

    /** Run `fn(tx)` as a given Supabase role, like PostgREST does per request. */
    function as(role, userId, fn) {
        return exclusive(() => db.transaction(async (tx) => {
            const claims = userId ? JSON.stringify({ sub: userId, role }) : JSON.stringify({ role });
            await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
            await tx.exec(`set local role ${role}`);
            return fn(tx);
        }));
    }

    return {
        raw: db,
        as,
        anon: (fn) => as('anon', null, fn),
        user: (id, fn) => as('authenticated', id, fn),
        service: (fn) => as('service_role', null, fn),
        superuser: (fn) => exclusive(() => fn(db)),

        /** Create an auth user (what Supabase Auth's sign-up does). */
        async createUser({ email, name = '', password = 'password123', id = randomUUID() }) {
            await exclusive(() => db.query(
                `insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values ($1, $2, $3, $4)`,
                [id, email.toLowerCase(), password, JSON.stringify({ name })]
            ));
            return id;
        },

        async makeAdmin(id) {
            await exclusive(() => db.query(`update public.profiles set is_admin = true where id = $1`, [id]));
        },

        close: () => db.close()
    };
}
