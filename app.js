// Appointment Scheduler - plain JavaScript, data saved in the browser (localStorage).
const KEY = 'sched_db', SES = 'sched_session';
const FLOW = { pending: ['confirmed', 'cancelled'], confirmed: ['completed', 'cancelled'], completed: [], cancelled: [] };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const toHM = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const fdate = d => new Date(d + 'T00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const ftime = t => { const h = +t.slice(0, 2); return `${h % 12 || 12}:${t.slice(3)} ${h < 12 ? 'AM' : 'PM'}`; };
const stamp = () => new Date().toLocaleString('en-PH');

// ---------- data ----------
function makeSlots(db, svcId, from, days, ranges) {
  for (let i = 0; i < days; i++) {
    const d = new Date(from); d.setDate(d.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    for (const [a, b] of ranges) for (let m = a; m + 60 <= b; m += 60)
      db.slots.push({ id: db.n++, svcId, date: iso(d), start: toHM(m), end: toHM(m + 60) });
  }
}
function seed() {
  const db = { n: 1, users: [], services: [], slots: [], appts: [], notes: [] };
  db.users.push({ id: db.n++, name: 'Administrator', email: 'admin@example.com', password: 'admin123', role: 'admin', phone: '' });
  for (const name of ['General Consultation', 'Follow-up Session', 'Extended Session']) db.services.push({ id: db.n++, name, active: true });
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  db.services.forEach(s => makeSlots(db, s.id, tomorrow, 14, [[540, 720], [780, 960]]));
  return db;
}
let saveFailed = false;
const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return d && Array.isArray(d.slots) && Array.isArray(d.appts) ? d : null; } catch { return null; } };
let db = load() || seed();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); saveFailed = false; } catch { saveFailed = true; } };
let me = null;
// Always work on the newest saved data (protects against several tabs / stale screens overwriting each other)
function sync() {
  const fresh = load(); if (fresh) db = fresh;
  me = db.users.find(u => u.id === +localStorage.getItem(SES)) || null;
}

const userOf = id => db.users.find(u => u.id === id) || { name: '(deleted user)', email: '', phone: '' };
const slotOf = id => db.slots.find(s => s.id === id);
const svcOf = id => db.services.find(s => s.id === id) || { name: '(removed service)', active: false };
const isActive = a => a.status === 'pending' || a.status === 'confirmed';
const isBooked = s => db.appts.some(a => a.slotId === s.id && isActive(a));
// Details of an appointment's slot. Finished (cancelled/completed) appointments keep their own copy,
// so editing or deleting the slot later never breaks the record.
const info = a => {
  const s = a.snap || slotOf(a.slotId);
  if (!s) return { date: '1970-01-01', start: '00:00', end: '00:00', svc: '(removed slot)' };
  return { date: s.date, start: s.start, end: s.end, svc: s.svc || svcOf(s.svcId).name };
};
const freeze = a => { const s = slotOf(a.slotId); if (s && !a.snap) a.snap = { date: s.date, start: s.start, end: s.end, svc: svcOf(s.svcId).name }; };
const overlaps = (svcId, date, start, end, ignoreId) => db.slots.some(x => x.id !== ignoreId && x.svcId === svcId && x.date === date && toMin(x.start) < toMin(end) && toMin(start) < toMin(x.end));
// fix records created before this version
db.appts.forEach(a => { if (!isActive(a)) freeze(a); });
save();
sync();
const isFuture = s => s.date + ' ' + s.start > iso(new Date()) + ' ' + toHM(new Date().getHours() * 60 + new Date().getMinutes());
const notify = (uid, text) => db.notes.push({ id: db.n++, uid, text, read: false, at: stamp() });
function resolveService(name, fallback) {
  name = (name || '').trim().slice(0, 80);
  if (!name) return fallback;
  let sv = db.services.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!sv) { sv = { id: db.n++, name, active: true }; db.services.push(sv); }
  sv.active = true; return sv.id;
}
const purposeOf = a => esc(a.purpose) + (a.custom ? `<div class="muted">Service: ${esc(a.custom)}</div>` : '');
const badge = s => `<span class="badge ${s}">${s}</span>`;

// ---------- state ----------
let view = 'login', sel = null, msg = null;
let lim = { slots: 30, adminSlots: 30 };
const more = (key, n) => n > 0 ? `<p style="text-align:center"><button class="grey" data-act="more" data-id="${key}">Show more (${n} remaining)</button></p>` : '';
let f = { service: '', date: '', q: '', status: '' };
const flash = (m, t = 'ok') => { msg = { m, t }; };
function go(v, id = null) { view = v; sel = id; lim = { slots: 30, adminSlots: 30 }; render(); window.scrollTo(0, 0); }

// ---------- views ----------
const views = {
  login: () => `<div class="hero"><h1>Book appointments, <span>effortlessly.</span></h1><p>Pick a time, send your request, and track its status in one place.</p></div>
    <div class="card narrow auth"><center><h2>Sign in</h2></center>
    <form data-form="login"><label>Email<input name="email" type="email" required></label>
    <label>Password<input name="password" type="password" required></label><button>Sign in</button></form>
    <p>No account? <a data-act="go" data-id="register">Register</a></p>
    <p class="muted">Demo admin: admin@example.com / admin123</p></div>`,

  register: () => `<div class="card narrow auth"><h2>Create account</h2>
    <form data-form="register"><label>Full name<input name="name" required minlength="2" maxlength="100"></label>
    <label>Email<input name="email" type="email" required></label>
    <label>Phone (optional)<input name="phone"></label>
    <label>Password (min 8)<input name="password" type="password" required minlength="8"></label>
    <label>Confirm password<input name="confirm" type="password" required></label><button>Register</button></form>
    <p>Already registered? <a data-act="go" data-id="login">Sign in</a></p></div>`,

  slots() {
    const all = db.slots.filter(s => svcOf(s.svcId).active && isFuture(s) && !isBooked(s) &&
      (!f.service || s.svcId === +f.service) && (!f.date || s.date === f.date))
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const rows = all.slice(0, lim.slots);
    return `<h2>Available slots</h2><form class="row card" data-form="filter">
      <label>Service<select name="service"><option value="">All</option>${db.services.filter(s => s.active).map(s => `<option value="${s.id}" ${f.service == s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label>Date<input type="date" name="date" min="${iso(new Date())}" value="${f.date}"></label><button>Filter</button>
      <button type="button" class="grey" data-act="resetFilter">Reset</button></form>
      <div class="card wrap">${rows.length ? `<table><tr><th>Date</th><th>Time</th><th>Service</th><th></th></tr>${rows.map(s =>
        `<tr><td>${fdate(s.date)}</td><td>${ftime(s.start)} – ${ftime(s.end)}</td><td>${esc(svcOf(s.svcId).name)}</td>
        <td><button class="sm" data-act="book" data-id="${s.id}">Book</button></td></tr>`).join('')}</table>` : '<p>No available slots match.</p>'}</div>${more('slots', all.length - rows.length)}`;
  },

  book() {
    const s = slotOf(sel);
    if (!s) return views.slots();
    return `<div class="card narrow"><h2>Confirm booking</h2><p>${esc(svcOf(s.svcId).name)}<br>${fdate(s.date)}, ${ftime(s.start)} – ${ftime(s.end)}</p>
    <form data-form="book"><label>Specific service (optional, type it if not listed)<input name="custom" maxlength="100" placeholder="e.g. Dental cleaning"></label>
    <label>Purpose<input name="purpose" required minlength="3" maxlength="200"></label>
    <label>Notes (optional)<textarea name="notes" rows="3" maxlength="500"></textarea></label>
    <button>Submit request</button> <button type="button" class="grey" data-act="go" data-id="slots">Back</button></form></div>`;
  },

  my() {
    const rows = db.appts.filter(a => a.uid === me.id).sort((a, b) => b.id - a.id);
    return `<h2>My appointments</h2><div class="card wrap">${rows.length ? `<table><tr><th>Date</th><th>Time</th><th>Service</th><th>Purpose</th><th>Status</th><th></th></tr>${rows.map(a => {
      const s = info(a);
      return `<tr><td>${fdate(s.date)}</td><td>${ftime(s.start)}</td><td>${esc(s.svc)}</td>
      <td>${purposeOf(a)}${a.note ? `<div class="muted">Note: ${esc(a.note)}</div>` : ''}</td><td>${badge(a.status)}</td>
      <td>${isActive(a) ? `<button class="sm red" data-act="cancel" data-id="${a.id}">Cancel</button>` : ''}</td></tr>`;
    }).join('')}</table>` : '<p>No appointments yet.</p>'}</div>`;
  },

  notes() {
    const rows = db.notes.filter(n => n.uid === me.id).sort((a, b) => b.id - a.id);
    rows.forEach(n => n.read = true); save(); renderNav();
    return `<h2>Notifications</h2><div class="card">${rows.length ? rows.map(n => `<p>${esc(n.text)}<br><span class="muted">${n.at}</span></p>`).join('') : '<p>No notifications.</p>'}</div>`;
  },

  dash() {
    const c = s => db.appts.filter(a => a.status === s).length;
    const today = db.appts.filter(a => isActive(a) && info(a).date === iso(new Date()));
    const pend = db.appts.filter(a => a.status === 'pending').slice(0, 8);
    const li = a => { const s = info(a); return `<div class="item"><div>${esc(userOf(a.uid).name)}<small>${fdate(s.date)}, ${ftime(s.start)} · ${esc(s.svc)}</small></div><div class="actions">${badge(a.status)}<button class="sm" data-act="open" data-id="${a.id}">Open</button></div></div>`; };
    return `<h2><center>Dashboard</center></h2><div class="stats">
      ${[['Pending', c('pending')], ['Confirmed', c('confirmed')], ['Completed', c('completed')], ['Cancelled', c('cancelled')],
        ['Open slots', db.slots.filter(s => isFuture(s) && !isBooked(s)).length], ['Customers', db.users.filter(u => u.role === 'customer').length]]
        .map(([l, v]) => `<div class="stat"><b>${v}</b>${l}</div>`).join('')}</div>
      <div class="card"><h3>Today's appointments</h3>${today.map(li).join('') || '<p class="muted">Nothing today.</p>'}</div>
      <div class="card"><h3>Awaiting review</h3>${pend.map(li).join('') || '<p class="muted">No pending requests.</p>'}</div>`;
  },

  appts() {
    const q = f.q.toLowerCase();
    const rows = db.appts.filter(a => (!f.status || a.status === f.status) &&
      (!q || (userOf(a.uid).name + userOf(a.uid).email + a.purpose + (a.custom || '')).toLowerCase().includes(q)))
      .sort((a, b) => (info(b).date + info(b).start).localeCompare(info(a).date + info(a).start));
    return `<h2><center>Appointment records (${rows.length})</center></h2><form class="row card" data-form="apptFilter">
      <label>Search<input name="q" placeholder="Name, email or purpose" value="${esc(f.q)}"></label>
      <label>Status<select name="status"><option value="">Any</option>${Object.keys(FLOW).map(s => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <button>Search</button><button type="button" class="grey" data-act="resetFilter">Reset</button></form>
      <div class="card wrap">${rows.length ? `<table><tr><th>Date</th><th>Time</th><th>Customer</th><th>Service</th><th>Purpose</th><th>Status</th><th></th></tr>${rows.map(a => {
        const s = info(a), u = userOf(a.uid);
        return `<tr><td>${fdate(s.date)}</td><td>${ftime(s.start)}</td><td>${esc(u.name)}<div class="muted">${esc(u.email)}</div></td>
        <td>${esc(s.svc)}</td><td>${purposeOf(a)}</td><td>${badge(a.status)}</td>
        <td><button class="sm" data-act="open" data-id="${a.id}">Open</button></td></tr>`;
      }).join('')}</table>` : '<p>No records found.</p>'}</div>`;
  },

  appt() {
    const a = db.appts.find(x => x.id === +sel);
    if (!a) return views.appts();
    const s = info(a), u = userOf(a.uid), opts = FLOW[a.status];
    return `<p><a class="back" data-act="go" data-id="appts">← Back to records</a></p><div class="card"><h2>Appointment #${a.id} ${badge(a.status)}</h2>
      <p><b>Customer:</b> ${esc(u.name)} (${esc(u.email)}${u.phone ? ', ' + esc(u.phone) : ''})<br>
      <b>Service:</b> ${esc(s.svc)}<br><b>Schedule:</b> ${fdate(s.date)}, ${ftime(s.start)} – ${ftime(s.end)}<br>
      <b>Purpose:</b> ${purposeOf(a)}<br><b>Notes:</b> ${esc(a.notes) || '—'}<br><b>Requested:</b> ${a.at}</p></div>
      <div class="card narrow" style="margin:0"><h3>Update</h3><form data-form="update">
      <label>Change status<select name="status"><option value="">Keep as ${a.status}</option>${opts.map(o => `<option>${o}</option>`).join('')}</select></label>
      <label>Note to customer<textarea name="note" rows="3" maxlength="500">${esc(a.note || '')}</textarea></label><button>Save</button></form></div>`;
  },

  adminSlots() {
    const all = db.slots.filter(s => s.date >= iso(new Date())).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const rows = all.slice(0, lim.adminSlots);
    const t = iso(new Date());
    return `<h2><center>Manage availability</center></h2><form class="card" data-form="genSlots"><h3>Generate time slots</h3><div class="row">
      <label>Service<select name="svc">${db.services.filter(s => s.active).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
      <label>Or type a service<input name="svcNew" maxlength="80" placeholder="New or existing name"></label>
      <label>From<input type="date" name="d1" min="${t}" value="${t}" required></label><label>To (max 31 days)<input type="date" name="d2" min="${t}" value="${t}" required></label></div><br><div class="row">
      <label>Start<input type="time" name="t1" value="09:00" required></label><label>End<input type="time" name="t2" value="17:00" required></label>
      <label>Length (min)<input type="number" name="len" value="60" min="5" max="240" required></label>
      <label class="check"><input type="checkbox" name="wk" checked> Skip weekends</label><button>Create</button></div></form>
      <div class="card wrap"><table><tr><th>Date</th><th>Time</th><th>Service</th><th>Status</th><th></th></tr>${rows.map(s => {
        const b = db.appts.find(a => a.slotId === s.id && isActive(a));
        return `<tr><td>${fdate(s.date)}</td><td>${ftime(s.start)} – ${ftime(s.end)}</td><td>${esc(svcOf(s.svcId).name)}</td>
        <td>${b ? badge(b.status) : '<span class="badge completed">open</span>'}</td>
        <td><button class="sm" data-act="editSlot" data-id="${s.id}">Edit</button> ${b ? '' : `<button class="sm red" data-act="delSlot" data-id="${s.id}">Delete</button>`}</td></tr>`;
      }).join('') || '<tr><td colspan="5">No slots yet.</td></tr>'}</table></div>${more('adminSlots', all.length - rows.length)}`;
  },

  editSlot() {
    const s = slotOf(sel);
    if (!s) return views.adminSlots();
    const bk = db.appts.find(a => a.slotId === s.id && isActive(a));
    return `<p><a class="back" data-act="go" data-id="adminSlots">← Back to schedules</a></p><div class="card narrow" style="margin:0 auto"><h2>Edit slot</h2>
      ${bk ? `<div class="alert info">Booked by ${esc(userOf(bk.uid).name)}. They will be notified of any change.</div>` : ''}
      <form data-form="editSlot"><label>Service<select name="svc">${db.services.map(x => `<option value="${x.id}" ${x.id === s.svcId ? 'selected' : ''}>${esc(x.name)}${x.active ? '' : ' (hidden)'}</option>`).join('')}</select></label>
      <label>Or type a service<input name="svcNew" maxlength="80" placeholder="New or existing name"></label>
      <label>Date<input type="date" name="date" value="${s.date}" min="${iso(new Date())}" required></label>
      <label>Start<input type="time" name="t1" value="${s.start}" required></label>
      <label>End<input type="time" name="t2" value="${s.end}" required></label>
      <button>Save changes</button> <button type="button" class="grey" data-act="go" data-id="adminSlots">Cancel</button></form></div>`;
  },

  services: () => `<h2><center>Services</center></h2><form class="card row" data-form="addSvc"><label>New service name<input name="name" required minlength="2" maxlength="80"></label><button>Add</button></form>
    <div class="card wrap"><table><tr><th>Name</th><th>Status</th><th></th></tr>${db.services.map(s => `<tr><td>${esc(s.name)}</td>
    <td>${s.active ? '<span class="badge completed">active</span>' : '<span class="badge cancelled">hidden</span>'}</td>
    <td><button class="sm" data-act="editSvc" data-id="${s.id}">Edit</button> <button class="sm grey" data-act="toggleSvc" data-id="${s.id}">${s.active ? 'Hide' : 'Activate'}</button> <button class="sm red" data-act="delSvc" data-id="${s.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="3">No services yet.</td></tr>'}</table></div>
    <p><button class="red sm" data-act="reset">Reset all demo data</button></p>`,

  editSvc() {
    const s = db.services.find(x => x.id === sel);
    if (!s) return views.services();
    return `<p><a class="back" data-act="go" data-id="services">← Back to services</a></p><div class="card narrow" style="margin:0 auto"><h2>Edit service</h2>
      <form data-form="editSvc"><label>Service name<input name="name" required minlength="2" maxlength="80" value="${esc(s.name)}"></label>
      <label class="check" style="display:flex;align-items:center;gap:8px"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> Active (visible to customers)</label>
      <button>Save changes</button> <button type="button" class="grey" data-act="go" data-id="services">Cancel</button></form></div>`;
  },
};

// ---------- actions ----------
const forms = {
  login(d) {
    const u = db.users.find(x => x.email === d.email.trim().toLowerCase() && x.password === d.password);
    if (!u) { flash('Incorrect email or password.', 'err'); return render(); }
    me = u; localStorage.setItem(SES, u.id); go(u.role === 'admin' ? 'dash' : 'slots');
  },
  register(d) {
    const email = d.email.trim().toLowerCase(), err = [];
    if (d.name.trim().length < 2) err.push('Enter your name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) err.push('Enter a valid email.');
    if (d.phone && !/^[0-9+\-()\s]{7,20}$/.test(d.phone)) err.push('Enter a valid phone number.');
    if (d.password.length < 8) err.push('Password must be at least 8 characters.');
    if (d.password !== d.confirm) err.push('Passwords do not match.');
    if (db.users.some(u => u.email === email)) err.push('That email is already registered.');
    if (err.length) { flash(err.join(' '), 'err'); return render(); }
    me = { id: db.n++, name: d.name.trim(), email, phone: d.phone.trim(), password: d.password, role: 'customer' };
    db.users.push(me); save(); localStorage.setItem(SES, me.id); flash('Welcome! Account created.'); go('slots');
  },
  filter(d) { f.service = d.service; f.date = d.date; lim.slots = 30; render(); },
  apptFilter(d) { f.q = d.q.trim(); f.status = d.status; render(); },
  book(d) {
    const s = slotOf(sel);
    if (!s || !svcOf(s.svcId).active || isBooked(s) || !isFuture(s)) { flash('That slot is no longer available.', 'err'); return go('slots'); }
    if (d.purpose.trim().length < 3) { flash('Please enter a purpose.', 'err'); return render(); }
    const clash = db.appts.find(x => x.uid === me.id && isActive(x) && info(x).date === s.date && toMin(info(x).start) < toMin(s.end) && toMin(s.start) < toMin(info(x).end));
    if (clash) { flash('You already have an appointment that overlaps this time.', 'err'); return go('slots'); }
    db.appts.push({ id: db.n++, uid: me.id, slotId: s.id, purpose: d.purpose.trim(), custom: (d.custom || '').trim(), notes: d.notes.trim(), status: 'pending', note: '', at: stamp() });
    save(); flash('Appointment requested! You will be notified once it is reviewed.'); go('my');
  },
  update(d) {
    const a = db.appts.find(x => x.id === +sel);
    if (!a) { flash('Appointment not found.', 'err'); return go('appts'); }
    const s = info(a), note = (d.note || '').trim(), noteChanged = note !== (a.note || '');
    if (d.status) {
      if (!FLOW[a.status].includes(d.status)) { flash('That appointment was already updated. Status change not applied.', 'err'); return render(); }
      if (d.status === 'cancelled' || d.status === 'completed') freeze(a);
      a.status = d.status;
      notify(a.uid, `Your ${s.svc} appointment on ${fdate(s.date)} at ${ftime(s.start)} is now ${d.status}.${note ? ' Note: ' + note : ''}`);
    } else if (noteChanged && note) {
      notify(a.uid, `New note on your ${s.svc} appointment on ${fdate(s.date)} at ${ftime(s.start)}: ${note}`);
    }
    a.note = note; save(); flash('Saved.'); render();
  },
  genSlots(d) {
    const [d1, d2] = [new Date(d.d1 + 'T00:00'), new Date(d.d2 + 'T00:00')], len = +d.len, a = toMin(d.t1), b = toMin(d.t2);
    if (d2 < d1 || d.d1 < iso(new Date()) || (d2 - d1) / 864e5 > 31 || b <= a || len < 5 || len > 240) { flash('Check your dates (max 31 days, not in the past), times and length.', 'err'); return render(); }
    let n = 0;
    const svc = resolveService(d.svcNew, +d.svc);
    for (let day = new Date(d1); day <= d2; day.setDate(day.getDate() + 1)) {
      if (d.wk && (day.getDay() === 0 || day.getDay() === 6)) continue;
      for (let m = a; m + len <= b; m += len) {
        if (!isFuture({ date: iso(day), start: toHM(m) }) || overlaps(svc, iso(day), toHM(m), toHM(m + len))) continue;
        db.slots.push({ id: db.n++, svcId: svc, date: iso(day), start: toHM(m), end: toHM(m + len) }); n++;
      }
    }
    save(); flash(`${n} new slot(s) created.`); render();
  },
  editSlot(d) {
    const s = slotOf(sel), a = toMin(d.t1), b = toMin(d.t2);
    if (!s) { flash('That slot no longer exists.', 'err'); return go('adminSlots'); }
    if (b <= a || !isFuture({ date: d.date, start: d.t1 })) { flash('End must be after start, and the slot must be in the future.', 'err'); return render(); }
    const svcId = resolveService(d.svcNew, +d.svc);
    if (overlaps(svcId, d.date, d.t1, d.t2, s.id)) { flash('Another slot for that service overlaps this date and time.', 'err'); return render(); }
    const old = `${fdate(s.date)} at ${ftime(s.start)}`;
    Object.assign(s, { svcId, date: d.date, start: d.t1, end: d.t2 });
    const bk = db.appts.find(x => x.slotId === s.id && isActive(x));
    if (bk) notify(bk.uid, `Your appointment on ${old} was rescheduled to ${fdate(s.date)}, ${ftime(s.start)} – ${ftime(s.end)} (${svcOf(svcId).name}).`);
    save(); flash('Slot updated.' + (bk ? ' The customer was notified.' : '')); go('adminSlots');
  },
  editSvc(d) {
    const s = db.services.find(x => x.id === sel);
    if (!s) { flash('That service no longer exists.', 'err'); return go('services'); }
    const name = (d.name || '').trim();
    if (name.length < 2) { flash('Enter a service name (at least 2 characters).', 'err'); return render(); }
    if (db.services.some(x => x.id !== s.id && x.name.toLowerCase() === name.toLowerCase())) { flash('Another service already has that name.', 'err'); return render(); }
    const active = !!d.active;
    s.name = name; s.active = active; save(); flash('Service updated.'); go('services');
  },
  addSvc(d) {
    const name = d.name.trim();
    if (db.services.some(s => s.name.toLowerCase() === name.toLowerCase())) flash('That service already exists.', 'err');
    else { db.services.push({ id: db.n++, name, active: true }); save(); flash('Service added.'); }
    render();
  },
};
const clicks = {
  go: id => go(id),
  book: id => go('book', +id),
  more: key => { lim[key] += 30; render(); },
  open: id => go('appt', +id),
  editSlot: id => go('editSlot', +id),
  resetFilter: () => { f = { service: '', date: '', q: '', status: '' }; render(); },
  cancel(id) {
    const a = db.appts.find(x => x.id === +id);
    if (!a || a.uid !== me.id) return;
    if (!isActive(a)) { flash('This appointment is already ' + a.status + '.', 'err'); return render(); }
    if (!confirm('Cancel this appointment?')) return;
    sync();
    const b = db.appts.find(x => x.id === +id);
    if (!b || !isActive(b)) { flash('This appointment was just updated and can no longer be cancelled.', 'err'); return render(); }
    freeze(b); b.status = 'cancelled'; save(); flash('Appointment cancelled.', 'info'); render();
  },
  delSlot(id) {
    const s = slotOf(+id);
    if (!s) { flash('That slot no longer exists.', 'err'); return render(); }
    if (isBooked(s)) { flash('This slot has an active booking. Cancel the appointment first.', 'err'); return render(); }
    if (!confirm('Delete this slot?')) return;
    db.appts.forEach(a => { if (a.slotId === s.id) freeze(a); });
    db.slots = db.slots.filter(x => x.id !== s.id); save(); flash('Slot removed.', 'info'); render();
  },
  editSvc: id => go('editSvc', +id),
  delSvc(id) {
    const s = db.services.find(x => x.id === +id);
    if (!s) { flash('That service no longer exists.', 'err'); return render(); }
    const slotIds = db.slots.filter(x => x.svcId === s.id).map(x => x.id);
    const live = db.appts.filter(a => slotIds.includes(a.slotId) && isActive(a)).length;
    if (live) { flash(`Cannot delete "${s.name}": ${live} active appointment(s) use it. Cancel or complete them first (or just hide the service).`, 'err'); return render(); }
    if (!confirm(`Delete "${s.name}" and its ${slotIds.length} time slot(s)? Past appointment records are kept.`)) return;
    db.appts.forEach(a => { if (slotIds.includes(a.slotId)) freeze(a); });
    db.slots = db.slots.filter(x => x.svcId !== s.id);
    db.services = db.services.filter(x => x.id !== s.id);
    save(); flash('Service deleted.', 'info'); render();
  },
  toggleSvc(id) { const s = svcOf(+id); s.active = !s.active; save(); render(); },
  reset() { if (confirm('Erase everything and restore the demo data?')) { db = seed(); save(); me = null; localStorage.removeItem(SES); go('login'); } },
  logout() { me = null; localStorage.removeItem(SES); flash('You have been signed out.', 'info'); go('login'); },
};
const isAdmin = () => !!me && me.role === 'admin';
const ADMIN_FORMS = ['update', 'genSlots', 'editSlot', 'addSvc', 'editSvc', 'apptFilter'], USER_FORMS = ['book', 'filter'];
const ADMIN_ACTS = ['open', 'editSlot', 'delSlot', 'toggleSvc', 'editSvc', 'delSvc', 'reset'], USER_ACTS = ['book', 'cancel'];
document.addEventListener('submit', e => {
  e.preventDefault(); sync();
  const name = e.target.dataset.form, fn = forms[name];
  if (!fn) return;
  if ((ADMIN_FORMS.includes(name) && !isAdmin()) || (USER_FORMS.includes(name) && !me)) return render();
  fn(Object.fromEntries(new FormData(e.target)));
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  e.preventDefault(); sync();
  const act = b.dataset.act;
  if (!clicks[act]) return;
  if ((ADMIN_ACTS.includes(act) && !isAdmin()) || (USER_ACTS.includes(act) && !me)) return render();
  clicks[act](b.dataset.id);
});
// another tab changed the data: refresh this screen (not while the person is typing in a form)
window.addEventListener('storage', e => {
  if (e.key !== KEY && e.key !== SES) return;
  sync();
  if (!document.activeElement || !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) render();
});

// ---------- render ----------
function renderNav() {
  const cur = { appt: 'appts', editSlot: 'adminSlots', editSvc: 'services', book: 'slots' }[view] || view;
  const tab = (v, label) => `<button class="${cur === v ? 'on' : ''}" data-act="go" data-id="${v}">${label}</button>`;
  const unread = me ? db.notes.filter(n => n.uid === me.id && !n.read).length : 0;
  $('#nav').className = me ? '' : 'auth-nav';
  $('#nav').innerHTML = !me ? tab('login', 'Sign in') + tab('register', 'Register')
    : me.role === 'admin' ? tab('dash', 'Dashboard') + tab('appts', 'Appointments') + tab('adminSlots', 'Schedules') + tab('services', 'Services')
    : tab('slots', 'Book') + tab('my', 'My Appointments') + tab('notes', 'Notifications' + (unread ? ` (${unread})` : ''));
  const nv = $('#nav'), on = nv.querySelector && nv.querySelector('.on');
  if (on && nv.scrollWidth > nv.clientWidth) nv.scrollLeft = on.offsetLeft - (nv.clientWidth - on.offsetWidth) / 2;
  $('#acct').innerHTML = me ? `<div class="account"><span class="avatar">${esc(me.name.trim().charAt(0).toUpperCase())}</span>
    <span class="uinfo"><b>${esc(me.name)}</b><small>${me.role === 'admin' ? 'Admin account' : 'Customer account'}</small></span>
    <button class="sm signout" data-act="logout" title="Sign out">Sign out</button></div>` : '';
}
// label every table cell with its column name so tables can stack into cards on phones
function labelTables() {
  document.querySelectorAll('#app table').forEach(t => {
    const heads = [...t.rows[0].cells].map(c => c.textContent.trim());
    [...t.rows].slice(1).forEach(r => [...r.cells].forEach((c, i) => { if (heads[i] && c.colSpan === 1) c.dataset.label = heads[i]; }));
  });
}
function render() {
  const adminViews = ['dash', 'appts', 'appt', 'adminSlots', 'editSlot', 'services', 'editSvc'], publicViews = ['login', 'register'];
  if (!me && !publicViews.includes(view)) view = 'login';
  if (me && publicViews.includes(view)) view = me.role === 'admin' ? 'dash' : 'slots';
  if (me && (me.role === 'admin') !== adminViews.includes(view) && !publicViews.includes(view)) view = me.role === 'admin' ? 'dash' : 'slots';
  const html = views[view]();
  renderNav();
  $('#app').innerHTML = (saveFailed ? '<div class="alert err">Could not save data in this browser (storage is full or blocked). Changes will be lost on refresh.</div>' : '') +
    (msg ? `<div class="alert ${msg.t}">${esc(msg.m)}</div>` : '') + html;
  msg = null;
  labelTables();
}
if (me) view = me.role === 'admin' ? 'dash' : 'slots';
render();
