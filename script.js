(() => {
  const STORAGE_KEY = 'petalMoodDiary_v1';
  const ACCOUNTS_KEY = 'petalAccounts_v1';
  const SESSION_KEY = 'petalSession_v1';
  let currentUser = null;
  const MOODS = {
    Awful: { emoji: '😢', score: 1, color: '#9f8cce' },
    Low:   { emoji: '😕', score: 2, color: '#b5a1db' },
    Okay:  { emoji: '😐', score: 3, color: '#e8b7a5' },
    Good:  { emoji: '🙂', score: 4, color: '#e38eb5' },
    Great: { emoji: '😄', score: 5, color: '#d96b9d' }
  };
  let entries = [];
  let selectedMood = '';
  let editingId = null;
  let toastTimer;
  const $ = id => document.getElementById(id);
  const todayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const dateFromISO = value => {
    const [y,m,d] = value.split('-').map(Number);
    return new Date(y, m-1, d, 12);
  };
  const fmtDate = value => dateFromISO(value).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  const fmtShort = value => dateFromISO(value).toLocaleDateString(undefined, { weekday:'short' });
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function loadEntries() {
    try {
      const userKey = currentUser ? `${STORAGE_KEY}:${encodeURIComponent(currentUser.email)}` : STORAGE_KEY;
      let stored = localStorage.getItem(userKey);
      // Migrate diary entries created by an older version into the first account that signs in.
      if (stored === null && currentUser) {
        const legacy = localStorage.getItem(STORAGE_KEY);
        if (legacy !== null) { stored = legacy; localStorage.setItem(userKey, legacy); localStorage.removeItem(STORAGE_KEY); }
      }
      const value = JSON.parse(stored || '[]');
      if (!Array.isArray(value)) return [];
      return value.filter(e => e && typeof e.id === 'string' && MOODS[e.mood] && /^\d{4}-\d{2}-\d{2}$/.test(e.date)).map(e => ({
        id:e.id, date:e.date, mood:e.mood, title:String(e.title || ''), note:String(e.note || ''),
        tags:Array.isArray(e.tags) ? e.tags.filter(t=>typeof t==='string').slice(0,10) : [],
        createdAt:Number(e.createdAt)||Date.now(), updatedAt:Number(e.updatedAt)||Number(e.createdAt)||Date.now()
      }));
    } catch { return []; }
  }
  function persist() {
    try {
      if (!currentUser) { showToast('Please sign in before saving your diary.'); return false; }
      const userKey = `${STORAGE_KEY}:${encodeURIComponent(currentUser.email)}`;
      localStorage.setItem(userKey, JSON.stringify(entries)); return true;
    }
    catch { showToast('Could not save. Your browser storage may be full or disabled.'); return false; }
  }
  function showToast(message) {
    const el = $('toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }
  function selectMood(mood) {
    selectedMood = mood;
    document.querySelectorAll('.mood-btn').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.mood === mood)));
  }
  function resetForm() {
    editingId = null; selectedMood = '';
    $('moodForm').reset(); $('entryDate').value = todayLocal(); $('charCount').textContent = '0'; $('saveBtn').textContent = 'Save my check-in ♥';
    document.querySelectorAll('.mood-btn').forEach(btn => btn.setAttribute('aria-pressed','false'));
  }
  function summarize() {
    $('totalEntries').textContent = entries.length;
    const counts = {};
    entries.forEach(e => counts[e.mood] = (counts[e.mood] || 0) + 1);
    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
    $('commonMood').textContent = sorted.length ? `${MOODS[sorted[0][0]].emoji} ${sorted[0][0]}` : '—';
    $('commonMoodNote').textContent = sorted.length ? `${sorted[0][1]} ${sorted[0][1] === 1 ? 'check-in' : 'check-ins'} with this mood` : 'your mood story so far';
    const cutoff = dateFromISO(todayLocal()); cutoff.setDate(cutoff.getDate()-6); cutoff.setHours(0,0,0,0);
    const days = new Set(entries.filter(e => dateFromISO(e.date) >= cutoff && dateFromISO(e.date) <= dateFromISO(todayLocal())).map(e=>e.date));
    $('weekCount').textContent = `${days.size} ${days.size === 1 ? 'day' : 'days'}`;
    $('historyCount').textContent = `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`;
  }
  function renderHistory() {
    const q = $('searchEntries').value.trim().toLowerCase();
    const filter = $('filterMood').value;
    const list = entries.filter(e => (filter === 'all' || e.mood === filter) && (!q || [e.title,e.note,e.mood,...e.tags].join(' ').toLowerCase().includes(q)))
      .sort((a,b) => b.date.localeCompare(a.date) || b.updatedAt-a.updatedAt);
    const container = $('historyList');
    if (!list.length) {
      container.innerHTML = `<div class="empty"><span>${entries.length ? '🔎' : '🌼'}</span>${entries.length ? 'No entries match your search yet.' : 'Your first check-in is waiting here.<br>Choose a mood and save a few words about your day.'}</div>`;
      $('historyFootNote').textContent = entries.length ? 'Try another search or mood filter.' : 'Your saved entries will appear here.';
      return;
    }
    container.innerHTML = list.map(e => {
      const mood = MOODS[e.mood];
      const title = e.title.trim() || `${e.mood} day`;
      const note = e.note.trim() ? `<p class="entry-note">${escapeHTML(e.note)}</p>` : '';
      const tags = e.tags.length ? `<div class="entry-tags">${e.tags.map(t=>`<span class="tag">#${escapeHTML(t)}</span>`).join('')}</div>` : '';
      return `<article class="entry"><div class="entry-top"><div class="entry-emoji" style="background:${mood.color}22">${mood.emoji}</div><div class="entry-main"><p class="entry-title">${escapeHTML(title)}</p><div class="entry-date">${escapeHTML(fmtDate(e.date))} · Feeling ${escapeHTML(e.mood.toLowerCase())}</div></div><div class="entry-actions"><button class="icon-btn" type="button" title="Edit entry" aria-label="Edit entry" data-action="edit" data-id="${escapeHTML(e.id)}">✎</button><button class="icon-btn" type="button" title="Delete entry" aria-label="Delete entry" data-action="delete" data-id="${escapeHTML(e.id)}">×</button></div></div>${note}${tags}</article>`;
    }).join('');
    $('historyFootNote').textContent = `Showing ${list.length} of ${entries.length} saved ${entries.length === 1 ? 'entry' : 'entries'}.`;
  }
  function renderChart() {
    const canvas = $('moodChart');
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(rect.width*dpr); canvas.height = Math.floor(rect.height*dpr);
    const ctx = canvas.getContext('2d'); ctx.scale(dpr,dpr);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0,0,w,h);
    const left=30, right=12, top=14, bottom=31, cw=w-left-right, ch=h-top-bottom;
    const labels=['1','2','3','4','5'];
    ctx.font='10px system-ui'; ctx.textAlign='right'; ctx.textBaseline='middle';
    [1,2,3,4,5].forEach(score => {
      const y=top+ch-(score-1)*(ch/4);
      ctx.strokeStyle='#f2eaf0'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(w-right,y); ctx.stroke();
      ctx.fillStyle='#ad9eaf'; ctx.fillText(labels[score-1],left-10,y);
    });
    const days=[]; const today=dateFromISO(todayLocal());
    for(let i=6;i>=0;i--){const d=new Date(today);d.setDate(d.getDate()-i);const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;const dayEntries=entries.filter(e=>e.date===iso);let avg=null;if(dayEntries.length)avg=dayEntries.reduce((s,e)=>s+MOODS[e.mood].score,0)/dayEntries.length;days.push({iso,label:fmtShort(iso),score:avg,count:dayEntries.length});}
    ctx.textAlign='center';ctx.textBaseline='top';ctx.font='10px system-ui';
    const points=days.map((d,i)=>({x:left+(days.length===1?cw/2:i*cw/(days.length-1)),y:d.score===null?null:top+ch-(d.score-1)*(ch/4),...d}));
    // Connect only consecutive days that have a mood value.
    ctx.lineWidth=2.5;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#d96b9d';ctx.beginPath();let drawing=false;
    points.forEach(p=>{if(p.y===null){drawing=false;return;}if(!drawing){ctx.moveTo(p.x,p.y);drawing=true;}else ctx.lineTo(p.x,p.y);});ctx.stroke();
    points.forEach(p=>{
      ctx.fillStyle='#fff';ctx.strokeStyle=p.y===null?'#eaddE6':'#d96b9d';ctx.lineWidth=2;
      if(p.y!==null){ctx.beginPath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);ctx.fill();ctx.stroke();}
      ctx.fillStyle='#a394a5';ctx.fillText(p.label,p.x,h-bottom+10);
      if(p.y===null){ctx.fillStyle='#c4b7c4';ctx.beginPath();ctx.arc(p.x,top+ch/2,2.5,0,Math.PI*2);ctx.fill();}
    });
    canvas.setAttribute('aria-label','Mood chart for the last seven days: '+days.map(d=>`${d.label} ${d.score===null?'no entry':`average mood ${d.score.toFixed(1)} out of 5`}`).join(', '));
  }
  function renderAll(){summarize();renderHistory();renderChart();}

  document.querySelectorAll('.mood-btn').forEach(btn => btn.addEventListener('click',()=>selectMood(btn.dataset.mood)));
  let authMode = 'login';
  const readAccounts = () => {
    try { const list = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); return Array.isArray(list) ? list : []; }
    catch { return []; }
  };
  const writeAccounts = list => localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  async function hashPassword(password) {
    // Hash the demo password before storing it. Client-only authentication is still not production security.
    try {
      if (window.crypto && window.crypto.subtle && window.TextEncoder) {
        const bytes = new TextEncoder().encode(password);
        const digest = await window.crypto.subtle.digest('SHA-256', bytes);
        return 'sha256:' + Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
    } catch {}
    // Fallback for browsers without Web Crypto; use Live Server for the best compatibility.
    return 'demo:' + btoa(unescape(encodeURIComponent(password)));
  }
  function setAuthMode(mode) {
    authMode = mode;
    const creating = mode === 'register';
    $('authTitle').textContent = creating ? 'Create your little space 🌷' : 'Welcome back 💗';
    $('authDescription').textContent = creating ? 'Create a profile to keep your moods and journal entries together.' : 'Sign in to open your personal mood garden and diary. First time here? Create an account below.';
    $('authNameWrap').hidden = !creating;
    $('authName').required = creating;
    $('authPassword').autocomplete = creating ? 'new-password' : 'current-password';
    $('authSubmit').textContent = creating ? 'Create my account ♥' : 'Sign in to Petal ♥';
    $('authSwitchText').textContent = creating ? 'Already have an account?' : 'New to Petal?';
    $('authSwitch').textContent = creating ? 'Sign in' : 'Create an account';
    $('authMessage').textContent = '';
  }
  function showApp(user) {
    currentUser = user;
    // Session storage can be restricted in some browser/file contexts; never let that disable login.
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email: user.email })); } catch {}
    entries = loadEntries();
    $('authScreen').style.display = 'none';
    $('appShell').style.display = 'block';
    $('headerUserName').textContent = user.name;
    $('headerInitial').textContent = initials(user.name);
    updateProfileView();
    renderAll();
  }
  function initials(name) {
    return String(name || 'P').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'P';
  }
  function updateProfileView() {
    if (!currentUser) return;
    $('profileName').textContent = currentUser.name;
    $('profileEmail').textContent = currentUser.email;
    $('profileInitial').textContent = initials(currentUser.name);
    $('profileNameInput').value = currentUser.name;
    $('profileEntryCount').textContent = entries.length;
    $('headerUserName').textContent = currentUser.name;
    $('headerInitial').textContent = initials(currentUser.name);
  }
  function openProfile() { updateProfileView(); $('profileOverlay').hidden = false; $('profileNameInput').focus(); }
  function closeProfile() { $('profileOverlay').hidden = true; }
  function logout() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    // Clear any unsaved form text before another account can open this page.
    resetForm(); $('searchEntries').value = ''; $('filterMood').value = 'all';
    currentUser = null; entries = []; editingId = null; selectedMood = '';
    closeProfile(); $('appShell').style.display = 'none'; $('authScreen').style.display = 'grid';
    $('authForm').reset(); $('authEmail').value = ''; $('authPassword').value = ''; setAuthMode('login');
    $('authMessage').textContent = 'You have logged out. Sign in again whenever you are ready.';
  }
  $('authSwitch').addEventListener('click', () => {
    const nextMode = authMode === 'login' ? 'register' : 'login';
    setAuthMode(nextMode);
    (nextMode === 'register' ? $('authName') : $('authEmail')).focus();
  });
  let authSubmitting = false;
  $('authForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (authSubmitting) return;
    authSubmitting = true;
    const submitButton = $('authSubmit');
    submitButton.disabled = true;
    submitButton.textContent = authMode === 'register' ? 'Creating account…' : 'Signing in…';
    const email = $('authEmail').value.trim().toLowerCase();
    const password = $('authPassword').value;
    const name = $('authName').value.trim();
    $('authMessage').textContent = '';
    try {
      const accounts = readAccounts();
      const existing = accounts.find(account => account.email === email);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        $('authMessage').textContent = 'Please enter a valid email address.';
        return;
      }
      if (password.length < 6) {
        $('authMessage').textContent = 'Your password must be at least 6 characters.';
        return;
      }
      if (authMode === 'register') {
        if (name.length < 2) {
          $('authMessage').textContent = 'Please enter your name (at least 2 characters).';
          return;
        }
        if (existing) {
          $('authMessage').textContent = 'An account with this email already exists. Please sign in.';
          return;
        }
        const account = { name, email, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() };
        accounts.push(account);
        writeAccounts(accounts);
        $('authForm').reset();
        showApp(account);
      } else {
        if (!existing) {
          $('authMessage').textContent = 'No account was found for that email. Choose “Create an account” below to register first.';
          return;
        }
        const passwordHash = await hashPassword(password);
        if (existing.passwordHash !== passwordHash) {
          $('authMessage').textContent = 'That password does not match. Please try again.';
          return;
        }
        $('authForm').reset();
        showApp(existing);
      }
    } catch (error) {
      $('authMessage').textContent = 'The browser could not save or read account information. Try opening this file with VS Code Live Server and make sure browser storage is enabled.';
    } finally {
      authSubmitting = false;
      submitButton.disabled = false;
      submitButton.textContent = authMode === 'register' ? 'Create my account ♥' : 'Sign in to Petal ♥';
    }
  });
  $('profileOpen').addEventListener('click', openProfile);
  $('profileClose').addEventListener('click', closeProfile);
  $('profileClose2').addEventListener('click', closeProfile);
  $('profileOverlay').addEventListener('click', event => { if (event.target === $('profileOverlay')) closeProfile(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeProfile(); });
  $('logoutBtn').addEventListener('click', logout);
  $('profileForm').addEventListener('submit', event => {
    event.preventDefault();
    const newName = $('profileNameInput').value.trim();
    if (newName.length < 2) { showToast('Please enter a name with at least 2 characters.'); return; }
    const accounts = readAccounts();
    const index = accounts.findIndex(account => account.email === currentUser.email);
    if (index < 0) { showToast('Could not find your account. Please sign in again.'); return; }
    accounts[index].name = newName;
    try { writeAccounts(accounts); currentUser = accounts[index]; updateProfileView(); showToast('Your profile has been updated 🌷'); }
    catch { showToast('Could not save profile changes.'); }
  });
  // Restore a session only in this browser tab/session. Otherwise, start at sign-in.
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    const account = session && readAccounts().find(item => item.email === session.email);
    if (account) showApp(account); else { sessionStorage.removeItem(SESSION_KEY); setAuthMode('login'); }
  } catch { setAuthMode('login'); }

  $('entryDate').value = todayLocal();
  $('todayChip').textContent = new Date().toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
  $('entryNote').addEventListener('input',()=> $('charCount').textContent = $('entryNote').value.length);
  $('moodForm').addEventListener('submit',event=>{
    event.preventDefault();
    if(!selectedMood){showToast('Choose the mood that feels closest to you.');return;}
    const date=$('entryDate').value;
    if(!date){showToast('Please choose a date for your check-in.');return;}
    const title=$('entryTitle').value.trim();const note=$('entryNote').value.trim();
    const tags=[...new Set($('entryTags').value.split(',').map(t=>t.trim().replace(/^#+/,'')).filter(Boolean))].slice(0,10);
    const now=Date.now();
    if(editingId){const index=entries.findIndex(e=>e.id===editingId);if(index>=0)entries[index]={...entries[index],date,mood:selectedMood,title,note,tags,updatedAt:now};showToast('Your check-in has been updated 🌷');}
    else {entries.push({id:`${now}-${Math.random().toString(36).slice(2,9)}`,date,mood:selectedMood,title,note,tags,createdAt:now,updatedAt:now});showToast('Check-in saved. Thank you for checking in ♥');}
    const saved=persist(); if(!saved) return;
    resetForm();renderAll();
  });
  $('clearBtn').addEventListener('click',()=>{resetForm();showToast('Form cleared. Take your time.');});
  $('searchEntries').addEventListener('input',renderHistory);
  $('filterMood').addEventListener('change',renderHistory);
  $('historyList').addEventListener('click',event=>{
    const btn=event.target.closest('button[data-action]');if(!btn)return;
    const entry=entries.find(e=>e.id===btn.dataset.id);if(!entry)return;
    if(btn.dataset.action==='delete'){
      if(!confirm(`Delete this ${entry.mood.toLowerCase()} check-in from ${fmtDate(entry.date)}? This cannot be undone.`))return;
      entries=entries.filter(e=>e.id!==entry.id);persist();if(editingId===entry.id)resetForm();renderAll();showToast('Entry deleted.');
    } else if(btn.dataset.action==='edit'){
      editingId=entry.id;selectMood(entry.mood);$('entryDate').value=entry.date;$('entryTitle').value=entry.title;$('entryNote').value=entry.note;$('entryTags').value=entry.tags.join(', ');$('charCount').textContent=entry.note.length;$('saveBtn').textContent='Update my check-in ♥';
      $('entryPanel').scrollIntoView({behavior:'smooth',block:'start'});showToast('You can now edit this check-in.');
    }
  });
  $('exportBtn').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({app:'Petal Mood Tracker',version:1,exportedAt:new Date().toISOString(),entries},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`petal-mood-diary-${todayLocal()}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);showToast('Your backup has been exported.');
  });
  $('importBtn').addEventListener('click',()=>$('importFile').click());
  $('importFile').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{
      const data=JSON.parse(await file.text());const incoming=Array.isArray(data)?data:data.entries;
      if(!Array.isArray(incoming))throw new Error('Invalid backup format');
      const valid=incoming.filter(e=>e&&MOODS[e.mood]&&typeof e.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)).map(e=>({id:typeof e.id==='string'?e.id:`import-${Date.now()}-${Math.random().toString(36).slice(2)}`,date:e.date,mood:e.mood,title:String(e.title||''),note:String(e.note||''),tags:Array.isArray(e.tags)?e.tags.filter(t=>typeof t==='string').slice(0,10):[],createdAt:Number(e.createdAt)||Date.now(),updatedAt:Number(e.updatedAt)||Date.now()}));
      if(!valid.length)throw new Error('No valid entries found');
      if(!confirm(`Import ${valid.length} entr${valid.length===1?'y':'ies'}? Entries with matching IDs will be replaced; other entries will be kept.`))return;
      const map=new Map(entries.map(e=>[e.id,e]));valid.forEach(e=>map.set(e.id,e));entries=[...map.values()];if(persist()){renderAll();showToast(`${valid.length} entr${valid.length===1?'y':'ies'} imported.`);}
    }catch{showToast('That file does not look like a valid Petal backup.');}
    finally{event.target.value='';}
  });
  window.addEventListener('resize',renderChart);
  if(!('localStorage' in window)) { $('authMessage').textContent = 'Browser storage is unavailable; accounts and entries may not be saved.'; }
})();
