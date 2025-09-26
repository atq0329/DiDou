// === config & helpers ===
const API = 'http://localhost:4000/api';
const $ = (sel) => document.querySelector(sel);
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// views
const authCard = $('#authCard');
const resetCard = $('#resetCard');
const dash = $('#dashboard');

// sign-in elements
const form = $('#signForm');
const nameInput = $('#name');
const emailInput = $('#email');
const pw1 = $('#password');
const pw2 = $('#password2');
const togglePw = $('#togglePw');
const msg = $('#msg');
const forgotLink = $('#forgotLink');

// reset elements
const resetForm = $('#resetForm');
const resetName = $('#resetName');
const resetEmail = $('#resetEmail');
const newPw = $('#newPw');
const newPw2 = $('#newPw2');
const resetMsg = $('#resetMsg');
const cancelReset = $('#cancelReset');

// dashboard
const userNameEl = $('#userName');
const logoutBtn = $('#logoutBtn');

// ui helpers
function setErr(el, t){ el.className='msg err'; el.textContent=t; }
function setOk(el, t){ el.className='msg ok'; el.textContent=t; }
function clearMsg(el){ el.className='msg'; el.textContent=''; }
function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }
function showSignIn(){ show(authCard); hide(resetCard); hide(dash); }
function showReset(){ hide(authCard); show(resetCard); hide(dash); }
function showDash(name){ hide(authCard); hide(resetCard); show(dash); userNameEl.textContent=name; }

// === sign-in (create if new) ===
form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  clearMsg(msg);

  const name = nameInput.value.trim();
  const email = emailInput.value.trim().toLowerCase();
  const password = pw1.value;

  if (!name) return setErr(msg, 'Please enter your name.');
  if (!emailRe.test(email)) return setErr(msg, 'Please enter a valid email.');
  if (!password) return setErr(msg, 'Please enter a password.');
  if (pw1.value !== pw2.value) return setErr(msg, 'Passwords do not match.');

  try{
    const r = await fetch(`${API}/signin`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name, email, password })
    });
    const data = await r.json();
    if (!data.ok) return setErr(msg, data.error || 'Sign in failed.');
    setOk(msg, 'Signed in!');
    showDash(data.user.name);
  }catch(err){
    setErr(msg, 'Network error. Is the API running on port 4000?');
  }
});

// toggle password visibility
togglePw.addEventListener('click', ()=>{
  pw1.type = pw1.type === 'password' ? 'text' : 'password';
  togglePw.textContent = pw1.type === 'password' ? 'Show' : 'Hide';
});

// === forgot/reset flow (inline screen) ===
forgotLink.addEventListener('click', (e)=>{
  e.preventDefault();
  resetName.value = nameInput.value.trim();
  resetEmail.value = emailInput.value.trim().toLowerCase();
  newPw.value = ''; newPw2.value = '';
  clearMsg(resetMsg);
  showReset();
});

cancelReset.addEventListener('click', ()=>{
  clearMsg(resetMsg);
  showSignIn();
});

resetForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  clearMsg(resetMsg);

  const name  = resetName.value.trim();
  const email = resetEmail.value.trim().toLowerCase();
  const p1 = newPw.value;
  const p2 = newPw2.value;

  if (!name) return setErr(resetMsg, 'Enter your name.');
  if (!emailRe.test(email)) return setErr(resetMsg, 'Enter a valid email.');
  if (p1.length < 6) return setErr(resetMsg, 'Password must be at least 6 characters.');
  if (p1 !== p2) return setErr(resetMsg, 'Passwords do not match.');

  try{
    const r = await fetch(`${API}/reset`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name, email, newPassword: p1 })
    });
    const data = await r.json();
    if (!data.ok) return setErr(resetMsg, data.error || 'Reset failed.');

    setOk(resetMsg, 'Password updated! You can now sign in.');
    // Prefill sign-in and go back
    nameInput.value = name;
    emailInput.value = email;
    pw1.value = ''; pw2.value = '';
    showSignIn();
  }catch(err){
    setErr(resetMsg, 'Network error. Is the API running on port 4000?');
  }
});

// logout
logoutBtn.addEventListener('click', ()=> showSignIn());

// init
(function init(){ showSignIn(); })();
