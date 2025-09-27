// app.js — Sign-in + Role selection

// Always start fresh so reload shows Sign-in
localStorage.removeItem('didou_user');
sessionStorage.clear();

const $ = s => document.querySelector(s);
const authCard = $('#authCard');
const roleCard = $('#roleCard');
const resetCard = $('#resetCard');

function show(id) {
  [authCard, roleCard, resetCard].forEach(el => el.classList.add('hidden'));
  id.classList.remove('hidden');
}

/* ---------- Sign-in ---------- */
$('#togglePw').onclick = () => {
  const pw = $('#password');
  pw.type = pw.type === 'password' ? 'text' : 'password';
  $('#togglePw').textContent = pw.type === 'password' ? 'Show' : 'Hide';
};

$('#signForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#msg'); msg.className = 'msg'; msg.textContent = '';

  const name = $('#name').value.trim();
  const email = $('#email').value.trim();
  const password = $('#password').value;

  if (!name || !email || password.length < 6) {
    msg.textContent = 'Please fill all fields (password ≥ 6).';
    msg.classList.add('err');
    return;
  }

  try {
    console.log('POST to:', new URL('/api/signin', location.href).toString());

    const r = await fetch('/api/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // add this if your API sets a cookie/session:
      // credentials: 'include',
      body: JSON.stringify({ name, email, password })
    });

    // Try to parse JSON only if it is JSON
    let data = null;
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      data = await r.json();
    }

    if (!r.ok) {
      const serverMsg = data && (data.error || data.message);
      throw new Error(serverMsg || `HTTP ${r.status} ${r.statusText}`);
    }
    if (!data || data.ok !== true) {
      throw new Error((data && data.error) || 'Sign-in failed.');
    }

    localStorage.setItem('didou_user', JSON.stringify(data.user));
    $('#helloName').textContent = data.user.name || '';
    show(roleCard);

  } catch (err) {
    msg.textContent = `Sign-in error: ${err.message || 'Network error.'}`;
    msg.classList.add('err');
  }
});


/* ---------- Forgot / Reset ---------- */
$('#forgotLink').onclick = (e) => {
  e.preventDefault();
  $('#resetName').value = $('#name').value;
  $('#resetEmail').value = $('#email').value;
  $('#resetMsg').textContent = '';
  show(resetCard);
};
$('#cancelReset').onclick = () => show(authCard);

$('#resetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#resetMsg'); msg.className = 'msg'; msg.textContent = '';
  const name = $('#resetName').value.trim();
  const email = $('#resetEmail').value.trim();
  const newPassword = $('#newPw').value;
  if (!name || !email || newPassword.length < 6) {
    msg.textContent = 'Please provide name, email, and a 6+ char password.';
    msg.classList.add('err'); return;
  }
  try {
    const r = await fetch('/api/reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, newPassword })
    });
    const data = await r.json();
    if (!data.ok) { msg.textContent = data.error || 'Reset failed.'; msg.classList.add('err'); return; }
    msg.textContent = 'Password updated. Please sign in.'; msg.classList.add('ok');
    setTimeout(() => show(authCard), 900);
  } catch {
    msg.textContent = 'Network error.'; msg.classList.add('err');
  }
});

/* ---------- Role pick ---------- */
$('#btnLeader').onclick = () => {
  // take user to Leader page to create a trip
  window.location.href = '/FindRoom.html';
};
$('#btnMember').onclick = () => {
  const id = prompt('Enter Trip ID (ask your leader):');
  if (!id) return;
  const user = JSON.parse(localStorage.getItem('didou_user') || '{}');
  window.location.href = `/MemberAvailability.html?tripId=${encodeURIComponent(id)}&userId=${encodeURIComponent(user.id || '')}`;
};