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
let db = JSON.parse(localStorage.getItem(KEY) || 'null') || seed();
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
save();
let me = db.users.find(u => u.id === +localStorage.getItem(SES)) || null;

const userOf = id => db.users.find(u => u.id === id);
const slotOf = id => db.slots.find(s => s.id === id);
const svcOf = id => db.services.find(s => s.id === id);
const isActive = a => a.status === 'pending' || a.status === 'confirmed';
const isBooked = s => db.appts.some(a => a.slotId === s.id && isActive(a));
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
let f = { service: '', date: '', q: '', status: '' };
const flash = (m, t = 'ok') => { msg = { m, t }; };
function go(v, id = null) { view = v; sel = id; render(); window.scrollTo(0, 0); }

// ---------- views ----------
const views = {
  login: () => `<div class="hero"><h1>Book appointments, <span>effortlessly.</span></h1><p>Pick a time, send your request, and track its status in one place.</p></div>
    <div class="card narrow auth"><h2>Sign in</h2>
    <form data-form="login"><label>Email<input name="email" type="email" required></label>
    <label>Password<input name="password" type="password" required></label><button>Sign in</button></form>
    <p>No account? <a data-act="go" data-id="register">Register</a></p>
    </p></div>`,

  register: () => `<div class="card narrow auth"><h2>Create account</h2>
    <form data-form="register"><label>Full name<input name="name" required minlength="2" maxlength="100"></label>
    <label>Email<input name="email" type="email" required></label>
    <label>Phone (optional)<input name="phone"></label>
    <label>Password (min 8)<input name="password" type="password" required minlength="8"></label>
    <label>Confirm password<input name="confirm" type="password" required></label><button>Register</button></form>
    <p>Already registered? <a data-act="go" data-id="login">Sign in</a></p></div>`,

  slots() {
    const rows = db.slots.filter(s => svcOf(s.svcId).active && isFuture(s) && !isBooked(s) &&
      (!f.service || s.svcId === +f.service) && (!f.date || s.date === f.date))
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 200);
    return `<h2>Available slots</h2><form class="row card" data-form="filter">
      <label>Service<select name="service"><option value="">All</option>${db.services.filter(s => s.active).map(s => `<option value="${s.id}" ${f.service == s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label>Date<input type="date" name="date" min="${iso(new Date())}" value="${f.date}"></label><button>Filter</button>
      <button type="button" class="grey" data-act="resetFilter">Reset</button></form>
      <div class="card wrap">${rows.length ? `<table><tr><th>Date</th><th>Time</th><th>Service</th><th></th></tr>${rows.map(s =>
        `<tr><td>${fdate(s.date)}</td><td>${ftime(s.start)} – ${ftime(s.end)}</td><td>${esc(svcOf(s.svcId).name)}</td>
        <td><button class="sm" data-act="book" data-id="${s.id}">Book</button></td></tr>`).join('')}</table>` : '<p>No available slots match.</p>'}</div>`;
  },

  book() {
    const s = slotOf(sel);
    return `<div class="card narrow"><h2>Confirm booking</h2><p>${esc(svcOf(s.svcId).name)}<br>${fdate(s.date)}, ${ftime(s.start)} – ${ftime(s.end)}</p>
    <form data-form="book"><label>Specific service (optional, type it if not listed)<input name="custom" maxlength="100" placeholder="e.g. Dental cleaning"></label>
    <label>Purpose<input name="purpose" required minlength="3" maxlength="200"></label>
    <label>Notes (optional)<textarea name="notes" rows="3" maxlength="500"></textarea></label>
    <button>Submit request</button> <button type="button" class="grey" data-act="go" data-id="slots">Back</button></form></div>`;
  },

  my() {
    const rows = db.appts.filter(a => a.uid === me.id).sort((a, b) => b.id - a.id);
    return `<h2>My appointments</h2><div class="card wrap">${rows.length ? `<table><tr><th>Date</th><th>Time</th><th>Service</th><th>Purpose</th><th>Status</th><th></th></tr>${rows.map(a => {
      const s = slotOf(a.slotId);
      return `<tr><td>${fdate(s.date)}</td><td>${ftime(s.start)}</td><td>${esc(svcOf(s.svcId).name)}</td>
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
    const today = db.appts.filter(a => isActive(a) && slotOf(a.slotId).date === iso(new Date()));
    const pend = db.appts.filter(a => a.status === 'pending').slice(0, 8);
    const li = a => { const s = slotOf(a.slotId); return `<p>${fdate(s.date)} ${ftime(s.start)} · ${esc(userOf(a.uid).name)} ${badge(a.status)} <button class="sm" data-act="open" data-id="${a.id}">Open</button></p>`; };
    return `<h2>Dashboard</h2><div class="stats">
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
      .sort((a, b) => (slotOf(b.slotId).date + slotOf(b.slotId).start).localeCompare(slotOf(a.slotId).date + slotOf(a.slotId).start));
    return `<h2>Appointment records (${rows.length})</h2><form class="row card" data-form="apptFilter">
      <label>Search<input name="q" placeholder="Name, email or purpose" value="${esc(f.q)}"></label>
      <label>Status<select name="status"><option value="">Any</option>${Object.keys(FLOW).map(s => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <button>Search</button><button type="button" class="grey" data-act="resetFilter">Reset</button></form>
      <div class="card wrap">${rows.length ? `<table><tr><th>Date</th><th>Time</th><th>Customer</th><th>Service</th><th>Purpose</th><th>Status</th><th></th></tr>${rows.map(a => {
        const s = slotOf(a.slotId), u = userOf(a.uid);
        return `<tr><td>${fdate(s.date)}</td><td>${ftime(s.start)}</td><td>${esc(u.name)}<div class="muted">${esc(u.email)}</div></td>
        <td>${esc(svcOf(s.svcId).name)}</td><td>${purposeOf(a)}</td><td>${badge(a.status)}</td>
        <td><button class="sm" data-act="open" data-id="${a.id}">Open</button></td></tr>`;
      }).join('')}</table>` : '<p>No records found.</p>'}</div>`;
  },

  appt() {
    const a = db.appts.find(x => x.id === +sel), s = slotOf(a.slotId), u = userOf(a.uid), opts = FLOW[a.status];
    return `<p><a data-act="go" data-id="appts">← Back to records</a></p><div class="card"><h2>Appointment #${a.id} ${badge(a.status)}</h2>
      <p><b>Customer:</b> ${esc(u.name)} (${esc(u.email)}${u.phone ? ', ' + esc(u.phone) : ''})<br>
      <b>Service:</b> ${esc(svcOf(s.svcId).name)}<br><b>Schedule:</b> ${fdate(s.date)}, ${ftime(s.start)} – ${ftime(s.end)}<br>
      <b>Purpose:</b> ${purposeOf(a)}<br><b>Notes:</b> ${esc(a.notes) || '—'}<br><b>Requested:</b> ${a.at}</p></div>
      <div class="card narrow" style="margin:0"><h3>Update</h3><form data-form="update">
      <label>Change status<select name="status"><option value="">Keep as ${a.status}</option>${opts.map(o => `<option>${o}</option>`).join('')}</select></label>
      <label>Note to customer<textarea name="note" rows="3" maxlength="500">${esc(a.note || '')}</textarea></label><button>Save</button></form></div>`;
  },

  adminSlots() {
    const rows = db.slots.filter(s => s.date >= iso(new Date())).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 300);
    const t = iso(new Date());
    return `<h2>Manage availability</h2><form class="card" data-form="genSlots"><h3>Generate time slots</h3><div class="row">
      <label>Service<select name="svc">${db.services.filter(s => s.active).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
      <label>Or type a service<input name="svcNew" maxlength="80" placeholder="New or existing name"></label>
      <label>From<input type="date" name="d1" min="${t}" value="${t}" required></label><label>To (max 31 days)<input type="date" name="d2" min="${t}" value="${t}" required></label></div><br><div class="row">
      <label>Start<input type="time" name="t1" value="09:00" required></label><label>End<input type="time" name="t2" value="17:00" required></label>
      <label>Length (min)<input type="number" name="len" value="60" min="5" max="240" required></label>
      <label style="flex:0"><input type="checkbox" name="wk" style="display:inline;width:auto" checked> Skip weekends</label><button>Create</button></div></form>
      <div class="card wrap"><table><tr><th>Date</th><th>Time</th><th>Service</th><th>Availability</th><th></th></tr>${rows.map(s => {
        const b = db.appts.find(a => a.slotId === s.id && isActive(a)), hist = db.appts.some(a => a.slotId === s.id);
        return `<tr><td>${fdate(s.date)}</td><td>${ftime(s.start)} – ${ftime(s.end)}</td><td>${esc(svcOf(s.svcId).name)}</td>
        <td>${b ? badge(b.status) : '<span class="badge completed">open</span>'}</td>
        <td><button class="sm" data-act="editSlot" data-id="${s.id}">Edit</button> ${hist ? '' : `<button class="sm red" data-act="delSlot" data-id="${s.id}">Delete</button>`}</td></tr>`;
      }).join('') || '<tr><td colspan="5">No slots yet.</td></tr>'}</table></div>`;
  },

  editSlot() {
    const s = slotOf(sel);
    if (!s) return views.adminSlots();
    const bk = db.appts.find(a => a.slotId === s.id && isActive(a));
    return `<p><a data-act="go" data-id="adminSlots">← Back to schedules</a></p><div class="card narrow" style="margin:0 auto"><h2>Edit slot</h2>
      ${bk ? `<div class="alert info">Booked by ${esc(userOf(bk.uid).name)}. They will be notified of any change.</div>` : ''}
      <form data-form="editSlot"><label>Service<select name="svc">${db.services.map(x => `<option value="${x.id}" ${x.id === s.svcId ? 'selected' : ''}>${esc(x.name)}${x.active ? '' : ' (hidden)'}</option>`).join('')}</select></label>
      <label>Or type a service<input name="svcNew" maxlength="80" placeholder="New or existing name"></label>
      <label>Date<input type="date" name="date" value="${s.date}" min="${iso(new Date())}" required></label>
      <label>Start<input type="time" name="t1" value="${s.start}" required></label>
      <label>End<input type="time" name="t2" value="${s.end}" required></label>
      <button>Save changes</button> <button type="button" class="grey" data-act="go" data-id="adminSlots">Cancel</button></form></div>`;
  },

  services: () => `<h2>Services</h2><form class="card row" data-form="addSvc"><label>New service name<input name="name" required minlength="2" maxlength="80"></label><button>Add</button></form>
    <div class="card wrap"><table><tr><th>Name</th><th>Status</th><th></th></tr>${db.services.map(s => `<tr><td>${esc(s.name)}</td>
    <td>${s.active ? '<span class="badge completed">active</span>' : '<span class="badge cancelled">hidden</span>'}</td>
    <td><button class="sm grey" data-act="toggleSvc" data-id="${s.id}">${s.active ? 'Hide' : 'Activate'}</button></td></tr>`).join('')}</table></div>
    <p><button class="red sm" data-act="reset">Reset all demo data</button></p>`,
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
  filter(d) { f.service = d.service; f.date = d.date; render(); },
  apptFilter(d) { f.q = d.q.trim(); f.status = d.status; render(); },
  book(d) {
    const s = slotOf(sel);
    if (!s || isBooked(s) || !isFuture(s)) { flash('That slot is no longer available.', 'err'); return go('slots'); }
    if (d.purpose.trim().length < 3) { flash('Please enter a purpose.', 'err'); return render(); }
    db.appts.push({ id: db.n++, uid: me.id, slotId: s.id, purpose: d.purpose.trim(), custom: (d.custom || '').trim(), notes: d.notes.trim(), status: 'pending', note: '', at: stamp() });
    save(); flash('Appointment requested! You will be notified once it is reviewed.'); go('my');
  },
  update(d) {
    const a = db.appts.find(x => x.id === +sel), s = slotOf(a.slotId);
    if (d.status) {
      if (!FLOW[a.status].includes(d.status)) { flash('Invalid status change.', 'err'); return render(); }
      a.status = d.status;
      notify(a.uid, `Your ${svcOf(s.svcId).name} appointment on ${fdate(s.date)} at ${ftime(s.start)} is now ${d.status}.${d.note ? ' Note: ' + d.note : ''}`);
    }
    a.note = d.note.trim(); save(); flash('Saved.'); render();
  },
  genSlots(d) {
    const [d1, d2] = [new Date(d.d1 + 'T00:00'), new Date(d.d2 + 'T00:00')], len = +d.len, a = toMin(d.t1), b = toMin(d.t2);
    if (d2 < d1 || d.d1 < iso(new Date()) || (d2 - d1) / 864e5 > 31 || b <= a || len < 5 || len > 240) { flash('Check your dates (max 31 days, not in the past), times and length.', 'err'); return render(); }
    let n = 0;
    const svc = resolveService(d.svcNew, +d.svc);
    for (let day = new Date(d1); day <= d2; day.setDate(day.getDate() + 1)) {
      if (d.wk && (day.getDay() === 0 || day.getDay() === 6)) continue;
      for (let m = a; m + len <= b; m += len) {
        if (db.slots.some(s => s.svcId === svc && s.date === iso(day) && s.start === toHM(m))) continue;
        db.slots.push({ id: db.n++, svcId: svc, date: iso(day), start: toHM(m), end: toHM(m + len) }); n++;
      }
    }
    save(); flash(`${n} new slot(s) created.`); render();
  },
  editSlot(d) {
    const s = slotOf(sel), a = toMin(d.t1), b = toMin(d.t2);
    if (b <= a || d.date < iso(new Date())) { flash('End must be after start, and the date cannot be in the past.', 'err'); return render(); }
    const svcId = resolveService(d.svcNew, +d.svc);
    if (db.slots.some(x => x.id !== s.id && x.svcId === svcId && x.date === d.date && x.start === d.t1)) { flash('Another slot already exists for that service, date and start time.', 'err'); return render(); }
    const old = `${fdate(s.date)} at ${ftime(s.start)}`;
    Object.assign(s, { svcId, date: d.date, start: d.t1, end: d.t2 });
    const bk = db.appts.find(x => x.slotId === s.id && isActive(x));
    if (bk) notify(bk.uid, `Your appointment on ${old} was rescheduled to ${fdate(s.date)}, ${ftime(s.start)} – ${ftime(s.end)} (${svcOf(svcId).name}).`);
    save(); flash('Slot updated.' + (bk ? ' The customer was notified.' : '')); go('adminSlots');
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
  open: id => go('appt', +id),
  editSlot: id => go('editSlot', +id),
  resetFilter: () => { f = { service: '', date: '', q: '', status: '' }; render(); },
  cancel(id) {
    if (!confirm('Cancel this appointment?')) return;
    db.appts.find(a => a.id === +id).status = 'cancelled'; save(); flash('Appointment cancelled.', 'info'); render();
  },
  delSlot(id) { db.slots = db.slots.filter(s => s.id !== +id); save(); flash('Slot removed.', 'info'); render(); },
  toggleSvc(id) { const s = svcOf(+id); s.active = !s.active; save(); render(); },
  reset() { if (confirm('Erase everything and restore the demo data?')) { db = seed(); save(); me = null; localStorage.removeItem(SES); go('login'); } },
  logout() { me = null; localStorage.removeItem(SES); flash('You have been signed out.', 'info'); go('login'); },
};
document.addEventListener('submit', e => { e.preventDefault(); const fn = forms[e.target.dataset.form]; if (fn) fn(Object.fromEntries(new FormData(e.target))); });
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) { e.preventDefault(); clicks[b.dataset.act](b.dataset.id); } });

// ---------- render ----------
function renderNav() {
  const tab = (v, label) => `<button class="${view === v ? 'on' : ''}" data-act="go" data-id="${v}">${label}</button>`;
  const unread = me ? db.notes.filter(n => n.uid === me.id && !n.read).length : 0;
  $('#nav').innerHTML = !me ? tab('login', 'Sign in') + tab('register', 'Register')
    : (me.role === 'admin' ? tab('dash', 'Dashboard') + tab('appts', 'Appointments') + tab('adminSlots', 'Schedules') + tab('services', 'Services')
      : tab('slots', 'Book') + tab('my', 'My Appointments') + tab('notes', 'Notifications' + (unread ? ` (${unread})` : '')))
      + `<div class="account"><span class="avatar">${esc(me.name.trim().charAt(0).toUpperCase())}</span>
        <span class="uinfo"><b>${esc(me.name)}</b><small>${me.role === 'admin' ? 'Admin account' : 'Customer account'}</small></span>
        <button class="sm signout" data-act="logout" title="Sign out">Sign out</button></div>`;
}
function render() {
  const adminViews = ['dash', 'appts', 'appt', 'adminSlots', 'editSlot', 'services'], publicViews = ['login', 'register'];
  if (!me && !publicViews.includes(view)) view = 'login';
  if (me && publicViews.includes(view)) view = me.role === 'admin' ? 'dash' : 'slots';
  if (me && (me.role === 'admin') !== adminViews.includes(view) && !publicViews.includes(view)) view = me.role === 'admin' ? 'dash' : 'slots';
  const html = views[view]();
  renderNav();
  $('#app').innerHTML = (msg ? `<div class="alert ${msg.t}">${esc(msg.m)}</div>` : '') + html;
  msg = null;
  labelTables();
}
// Mobile: copy each column header onto its cells so CSS can show them as stacked cards.
function labelTables() {
  document.querySelectorAll('#app table').forEach(t => {
    const head = t.querySelector('tr');
    if (!head || !head.querySelector('th')) return;
    head.classList.add('thead');
    const labels = [...head.children].map(h => h.textContent.trim());
    t.querySelectorAll('tr:not(.thead)').forEach(r => [...r.children].forEach((td, i) => {
      td.dataset.label = td.colSpan > 1 ? '' : (labels[i] || '');
    }));
  });
}
if (me) view = me.role === 'admin' ? 'dash' : 'slots';
render();
