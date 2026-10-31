// A small local stand-in for the Supabase HTTP APIs, for end-to-end tests.
// It implements the parts of Auth (GoTrue), the REST API (PostgREST) and
// Edge Functions that this site uses — and runs every request against the
// REAL migration in PGlite, as the right role with the caller's JWT claims,
// so row-level security is exercised exactly as on Supabase.
import http from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { createDatabase } from '../support/pg.mjs';
import { handleBook } from '../../supabase/functions/_shared/booking.mjs';

const TABLES = new Set(['profiles', 'studios', 'instruments', 'testimonials', 'bookings', 'feedbacks', 'payment_issues']);
const RPCS = new Set(['get_booked_hours', 'quote_booking', 'cancel_booking', 'get_featured_reviews', 'is_admin', 'create_booking']);
const IDENT = /^[a-z_][a-z0-9_]*$/;

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const makeJwt = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.${randomBytes(16).toString('base64url')}`;

export const ANON_KEY = makeJwt({ role: 'anon', iss: 'fake-supabase', exp: 4102444800 });

export async function startFakeSupabase({ port = 54321 } = {}) {
    const db = await createDatabase();
    const sessions = new Map();       // access token → user id
    const refreshTokens = new Map();  // refresh token → user id
    const paystack = new Map();       // reference → simulated Paystack transaction
    const env = { PAYSTACK_SECRET_KEY: 'sk_test_fake', PAYSTACK_CURRENCY: 'GHS', ALLOW_DEMO_PAYMENTS: '' };
    const stats = { requests: 0 };

    // ---------------- helpers ----------------
    async function getUser(id) {
        const { rows } = await db.superuser(d => d.query(
            `select u.id, u.email, u.raw_user_meta_data, u.created_at, u.encrypted_password from auth.users u where u.id = $1`, [id]));
        return rows[0] || null;
    }

    function userJson(u) {
        return {
            id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
            email_confirmed_at: u.created_at, confirmed_at: u.created_at,
            user_metadata: u.raw_user_meta_data || {}, app_metadata: { provider: 'email', providers: ['email'] },
            identities: [{ id: u.id, user_id: u.id, provider: 'email', identity_data: { email: u.email, sub: u.id } }],
            created_at: u.created_at, updated_at: u.created_at
        };
    }

    function issueSession(u) {
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const access = makeJwt({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp, session_id: randomUUID() });
        const refresh = randomBytes(24).toString('hex');
        sessions.set(access, u.id);
        refreshTokens.set(refresh, u.id);
        return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: refresh, user: userJson(u) };
    }

    function callerFromHeaders(req) {
        const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        if (token && sessions.has(token)) return { role: 'authenticated', userId: sessions.get(token) };
        return { role: 'anon', userId: null };
    }

    function send(res, status, body, headers = {}) {
        res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
        res.end(body === undefined ? '' : JSON.stringify(body));
    }

    function pgError(res, err) {
        const code = err.code || '';
        const status = code === '42501' ? 403 : (code === '23505' || code === '23P01' || code === '23503') ? 409 : code === 'P0001' ? 400 : 400;
        send(res, status, { code, message: err.message, details: err.detail || null, hint: err.hint || null });
    }

    async function readBody(req) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw) return null;
        try { return JSON.parse(raw); } catch { return raw; }
    }

    // ---------------- PostgREST ----------------
    function parseQuery(url) {
        const filters = [];
        let columns = '*';
        let order = [];
        let limit = null;
        for (const [key, value] of url.searchParams) {
            if (key === 'select') {
                columns = value.split(',').map(c => c.trim()).filter(Boolean);
                if (columns.length === 1 && columns[0] === '*') columns = '*';
                else if (!columns.every(c => IDENT.test(c))) throw Object.assign(new Error('Unsupported select'), { code: 'PGRST100' });
            } else if (key === 'order') {
                order = value.split(',').map(part => {
                    const [col, dir = 'asc'] = part.split('.');
                    if (!IDENT.test(col)) throw Object.assign(new Error('Bad order'), { code: 'PGRST100' });
                    return `"${col}" ${dir === 'desc' ? 'desc' : 'asc'}`;
                });
            } else if (key === 'limit') {
                limit = parseInt(value, 10);
            } else if (key === 'columns' || key === 'on_conflict' || key === 'offset') {
                // not used by this site
            } else {
                if (!IDENT.test(key)) throw Object.assign(new Error('Bad filter'), { code: 'PGRST100' });
                const m = value.match(/^(eq|neq|is)\.(.*)$/);
                if (!m) throw Object.assign(new Error('Unsupported filter ' + value), { code: 'PGRST100' });
                filters.push({ col: key, op: m[1], val: m[2] });
            }
        }
        return { filters, columns, order, limit };
    }

    function whereClause(filters, params) {
        if (!filters.length) return '';
        return ' where ' + filters.map(f => {
            if (f.op === 'is') return `"${f.col}" is ${f.val === 'null' ? 'null' : f.val === 'true' ? 'true' : 'false'}`;
            params.push(f.val);
            return `"${f.col}"::text ${f.op === 'eq' ? '=' : '<>'} $${params.length}`;
        }).join(' and ');
    }

    function selectList(columns) {
        return columns === '*' ? '*' : columns.map(c => `"${c}"`).join(', ');
    }

    async function handleRest(req, res, url, caller) {
        const table = url.pathname.replace('/rest/v1/', '');
        const accept = String(req.headers.accept || '');
        const prefer = String(req.headers.prefer || '');
        const wantsObject = accept.includes('vnd.pgrst.object+json');
        const representation = prefer.includes('return=representation');

        if (table.startsWith('rpc/')) return handleRpc(req, res, table.slice(4), caller);
        if (!TABLES.has(table)) return send(res, 404, { code: '42P01', message: `relation "public.${table}" does not exist` });

        let q;
        try { q = parseQuery(url); } catch (err) { return send(res, 400, { code: err.code, message: err.message }); }
        const params = [];
        let sql;
        if (req.method === 'GET') {
            sql = `select ${selectList(q.columns)} from public."${table}"${whereClause(q.filters, params)}`
                + (q.order.length ? ` order by ${q.order.join(', ')}` : '') + (q.limit ? ` limit ${q.limit}` : '');
        } else if (req.method === 'POST') {
            const body = await readBody(req);
            const rows = Array.isArray(body) ? body : [body];
            const cols = Object.keys(rows[0] || {});
            if (!cols.every(c => IDENT.test(c))) return send(res, 400, { code: 'PGRST204', message: 'Bad column' });
            const values = rows.map(r => '(' + cols.map(c => {
                const v = r[c];
                params.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
                return `$${params.length}`;
            }).join(', ') + ')').join(', ');
            sql = `insert into public."${table}" (${cols.map(c => `"${c}"`).join(', ')}) values ${values} returning ${selectList(q.columns)}`;
        } else if (req.method === 'PATCH') {
            const body = await readBody(req);
            const cols = Object.keys(body || {});
            if (!cols.length || !cols.every(c => IDENT.test(c))) return send(res, 400, { code: 'PGRST204', message: 'Bad column' });
            const sets = cols.map(c => {
                const v = body[c];
                params.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
                return `"${c}" = $${params.length}`;
            }).join(', ');
            sql = `update public."${table}" set ${sets}${whereClause(q.filters, params)} returning ${selectList(q.columns)}`;
        } else if (req.method === 'DELETE') {
            sql = `delete from public."${table}"${whereClause(q.filters, params)} returning ${selectList(q.columns)}`;
        } else {
            return send(res, 405, { message: 'Method not allowed' });
        }

        let rows;
        try {
            rows = (await db.as(caller.role, caller.userId, tx => tx.query(sql, params))).rows;
        } catch (err) {
            return pgError(res, err);
        }

        if (req.method !== 'GET' && !representation) return send(res, req.method === 'POST' ? 201 : 204);
        if (wantsObject) {
            if (rows.length !== 1) {
                return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows`, hint: null });
            }
            return send(res, req.method === 'POST' ? 201 : 200, rows[0]);
        }
        return send(res, req.method === 'POST' ? 201 : 200, rows);
    }

    async function handleRpc(req, res, fn, caller) {
        if (!RPCS.has(fn)) return send(res, 404, { code: 'PGRST202', message: `Could not find the function public.${fn}` });
        const args = (await readBody(req)) || {};
        const names = Object.keys(args);
        if (!names.every(n => IDENT.test(n))) return send(res, 400, { message: 'Bad argument' });
        const params = names.map(n => args[n]);
        const argSql = names.map((n, i) => `${n} => $${i + 1}`).join(', ');
        try {
            const result = await db.as(caller.role, caller.userId, async tx => {
                const meta = (await tx.query(
                    `select p.proretset as set, t.typtype as kind from pg_proc p join pg_type t on t.oid = p.prorettype
                     where p.proname = $1 and p.pronamespace = 'public'::regnamespace`, [fn])).rows[0];
                const { rows } = await tx.query(`select * from public.${fn}(${argSql})`, params);
                if (meta.set) return rows;
                if (meta.kind === 'c') return rows[0] && Object.values(rows[0]).some(v => v !== null) ? rows[0] : null;
                return rows[0] ? rows[0][fn] : null;
            });
            return send(res, 200, result);
        } catch (err) {
            return pgError(res, err);
        }
    }

    // ---------------- Auth ----------------
    async function handleAuth(req, res, url) {
        const path = url.pathname.replace('/auth/v1', '');
        const body = req.method === 'GET' ? null : await readBody(req);

        if (path === '/signup' && req.method === 'POST') {
            const email = String(body.email || '').toLowerCase();
            if (!email || !body.password) return send(res, 400, { code: 400, error_code: 'validation_failed', msg: 'Signup requires a valid password' });
            if (body.password.length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
            const exists = await db.superuser(d => d.query('select 1 from auth.users where email = $1', [email]));
            if (exists.rows.length) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
            const id = await db.createUser({ email, name: body.data && body.data.name, password: body.password });
            return send(res, 200, issueSession(await getUser(id)));
        }

        if (path === '/token' && req.method === 'POST') {
            const grant = url.searchParams.get('grant_type');
            if (grant === 'password') {
                const { rows } = await db.superuser(d => d.query(
                    'select id from auth.users where email = $1 and encrypted_password = $2', [String(body.email || '').toLowerCase(), body.password]));
                if (!rows.length) return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
                return send(res, 200, issueSession(await getUser(rows[0].id)));
            }
            if (grant === 'refresh_token') {
                const id = refreshTokens.get(body.refresh_token);
                if (!id) return send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
                refreshTokens.delete(body.refresh_token);
                return send(res, 200, issueSession(await getUser(id)));
            }
        }

        const caller = callerFromHeaders(req);
        if (path === '/user' && req.method === 'GET') {
            if (!caller.userId) return send(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
            return send(res, 200, userJson(await getUser(caller.userId)));
        }
        if (path === '/user' && req.method === 'PUT') {
            if (!caller.userId) return send(res, 401, { code: 401, msg: 'invalid JWT' });
            if (body.password) {
                await db.superuser(d => d.query('update auth.users set encrypted_password = $1 where id = $2', [body.password, caller.userId]));
            }
            return send(res, 200, userJson(await getUser(caller.userId)));
        }
        if (path === '/logout') {
            const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
            sessions.delete(token);
            return send(res, 204);
        }
        if (path === '/recover') return send(res, 200, {});
        return send(res, 404, { msg: 'Not found: ' + path });
    }

    // ---------------- Edge Function: book ----------------
    async function handleFunction(req, res, url, caller) {
        if (url.pathname !== '/functions/v1/book') return send(res, 404, { error: 'Function not found' });
        const body = await readBody(req);
        const user = caller.userId ? await getUser(caller.userId) : null;
        const result = await handleBook(body, {
            user: user && { id: user.id, email: user.email },
            env,
            verifyPayment: async (ref) => {
                const t = paystack.get(ref);
                if (!t) return { ok: false, error: 'Transaction reference not found' };
                return { ok: true, amount: t.amount / 100, currency: t.currency, email: t.email, reference: ref };
            },
            createBooking: async (p) => {
                const names = Object.keys(p);
                const { rows } = await db.service(tx => tx.query(
                    `select * from public.create_booking(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')})`,
                    names.map(n => p[n])));
                return rows[0];
            },
            logIssue: (i) => db.service(tx => tx.query(
                `insert into public.payment_issues (user_id, payment_ref, amount, reason, payload) values ($1, $2, $3, $4, $5)`,
                [i.user_id, i.payment_ref, i.amount, i.reason, JSON.stringify(i.payload)]))
        });
        return send(res, result.status, result.body);
    }

    // ---------------- Test controls ----------------
    async function handleTestControl(req, res, url) {
        const body = (await readBody(req)) || {};
        if (url.pathname === '/__test/paystack') {
            // Simulates a completed Paystack checkout for a reference
            paystack.set(body.reference, { amount: body.amount, currency: body.currency, email: String(body.email || '').toLowerCase() });
            return send(res, 200, { ok: true });
        }
        if (url.pathname === '/__test/make-admin') {
            await db.superuser(d => d.query('update public.profiles set is_admin = true where email = $1', [String(body.email).toLowerCase()]));
            return send(res, 200, { ok: true });
        }
        if (url.pathname === '/__test/env') {
            Object.assign(env, body);
            return send(res, 200, env);
        }
        if (url.pathname === '/__test/sql') {
            const { rows } = await db.superuser(d => d.query(body.sql, body.params || []));
            return send(res, 200, rows);
        }
        return send(res, 404, {});
    }

    const server = http.createServer(async (req, res) => {
        stats.requests++;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info, prefer, accept, accept-profile, content-profile, x-supabase-api-version, x-region');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Expose-Headers', 'content-range, x-supabase-api-version');
        if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

        const url = new URL(req.url, `http://127.0.0.1:${port}`);
        try {
            if (url.pathname.startsWith('/__test/')) return await handleTestControl(req, res, url);
            if (req.headers.apikey !== ANON_KEY) return send(res, 401, { message: 'Invalid API key' });
            if (url.pathname.startsWith('/auth/v1/')) return await handleAuth(req, res, url);
            const caller = callerFromHeaders(req);
            if (url.pathname.startsWith('/rest/v1/')) return await handleRest(req, res, url, caller);
            if (url.pathname.startsWith('/functions/v1/')) return await handleFunction(req, res, url, caller);
            send(res, 404, { message: 'Not found' });
        } catch (err) {
            console.error('[fake-supabase]', err);
            send(res, 500, { message: String(err.message || err) });
        }
    });

    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
    return {
        url: `http://127.0.0.1:${port}`,
        anonKey: ANON_KEY,
        db,
        env,
        stats,
        close: () => new Promise(resolve => server.close(() => db.close().then(resolve, resolve)))
    };
}
