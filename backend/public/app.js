// Toggle password visibility
document.getElementById('togglePw')?.addEventListener('click', () => {
  const pw = document.getElementById('password');
  if (pw.type === 'password') { pw.type = 'text'; event.target.textContent = 'Hide'; }
  else { pw.type = 'password'; event.target.textContent = 'Show'; }
});

// Sign in
const form = document.getElementById('signForm');
const msg  = document.getElementById('msg');
const authCard = document.getElementById('authCard');
const roleCard = document.getElementById('roleCard');
const helloName = document.getElementById('helloName');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  msg.textContent = 'Signing in…';

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try{
    const res = await fetch('/api/signin', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!data.ok) { msg.textContent = data.error || 'Sign in failed.'; return; }

    localStorage.setItem('didou_user', JSON.stringify(data.user));
    msg.textContent = '';
    authCard.classList.add('hidden');
    roleCard.classList.remove('hidden');
    helloName.textContent = data.user.name;
  }catch{
    msg.textContent = 'Network error. Is the API running?';
  }
});

// Role buttons → pages
document.getElementById('btnLeader')?.addEventListener('click', ()=>{
  location.href = 'LeaderPage.html';
});
document.getElementById('btnMember')?.addEventListener('click', ()=>{
  const me = JSON.parse(localStorage.getItem('didou_user') || '{}');
  const q = new URLSearchParams({ userId: me.id || '', name: me.name || '' }).toString();
  location.href = `MemberJoin.html?${q}`;
});