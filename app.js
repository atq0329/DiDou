const API = 'http://localhost:4000/api';
const $ = (s)=>document.querySelector(s);
const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// views
const authCard=$('#authCard'), roleCard=$('#roleCard'), resetCard=$('#resetCard'), dash=$('#dashboard');

// sign-in
const form=$('#signForm'), nameInput=$('#name'), emailInput=$('#email'), pw=$('#password');
const togglePw=$('#togglePw'), msg=$('#msg'), forgotLink=$('#forgotLink');

// reset
const resetForm=$('#resetForm'), resetName=$('#resetName'), resetEmail=$('#resetEmail'), newPw=$('#newPw');
const resetMsg=$('#resetMsg'), cancelReset=$('#cancelReset');

// role picker
const helloName=$('#helloName'), btnLeader=$('#btnLeader'), btnMember=$('#btnMember'), roleMsg=$('#roleMsg');

// dash
const userNameEl=$('#userName'), userRoleLine=$('#userRoleLine'), logoutBtn=$('#logoutBtn');

let currentUser = null; // {name,email,role,trip_role}

function show(el){ el.classList.remove('hidden'); }
function hide(el){ el.classList.add('hidden'); }
function showSignIn(){ show(authCard); hide(roleCard); hide(resetCard); hide(dash); }
function showRole(){ hide(authCard); show(roleCard); hide(resetCard); hide(dash); }
function showReset(){ hide(authCard); hide(roleCard); show(resetCard); hide(dash); }
function showDash(){ hide(authCard); hide(roleCard); hide(resetCard); show(dash); }

function setErr(el,t){ el.className='msg err'; el.textContent=t; }
function setOk(el,t){ el.className='msg ok'; el.textContent=t; }
function clearMsg(el){ el.className='msg'; el.textContent=''; }

// sign-in (create if new)
form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  clearMsg(msg);

  const name=nameInput.value.trim();
  const email=emailInput.value.trim().toLowerCase();
  const password=pw.value;

  if(!name) return setErr(msg,'Please enter your name.');
  if(!emailRe.test(email)) return setErr(msg,'Please enter a valid email.');
  if(!password || password.length<6) return setErr(msg,'Password must be at least 6 characters.');

  try{
    const r = await fetch(`${API}/signin`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name,email,password})
    });
    const data = await r.json();
    if(!data.ok) return setErr(msg, data.error||'Sign in failed.');

    currentUser = data.user;
    helloName.textContent = currentUser.name;

    if (currentUser.trip_role) {
      userNameEl.textContent = currentUser.name;
      userRoleLine.textContent = `Your role: ${currentUser.trip_role}`;
      showDash();
    } else {
      showRole();
    }
  }catch(err){
    setErr(msg,'Network error. Is the API running on port 4000?');
  }
});

// toggle password visibility
togglePw.addEventListener('click', ()=>{
  pw.type = pw.type==='password' ? 'text' : 'password';
  togglePw.textContent = pw.type==='password' ? 'Show' : 'Hide';
});

// choose trip role
async function pickRole(role){
  clearMsg(roleMsg);
  try{
    const r = await fetch(`${API}/trip-role`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email: currentUser.email, tripRole: role })
    });
    const data = await r.json();
    if(!data.ok) return setErr(roleMsg, data.error||'Could not save role.');
    currentUser = data.user;
    userNameEl.textContent = currentUser.name;
    userRoleLine.textContent = `Your role: ${currentUser.trip_role}`;
    showDash();
  }catch(e){
    setErr(roleMsg,'Network error. Is the API running on port 4000?');
  }
}
btnLeader.addEventListener('click', ()=>pickRole('leader'));
btnMember.addEventListener('click', ()=>pickRole('member'));

// forgot/reset
forgotLink.addEventListener('click', (e)=>{
  e.preventDefault();
  resetName.value = nameInput.value.trim();
  resetEmail.value = emailInput.value.trim().toLowerCase();
  newPw.value=''; clearMsg(resetMsg);
  showReset();
});
cancelReset.addEventListener('click', ()=>{ clearMsg(resetMsg); showSignIn(); });
resetForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  clearMsg(resetMsg);
  const name=resetName.value.trim();
  const email=resetEmail.value.trim().toLowerCase();
  const p1=newPw.value;

  if(!name) return setErr(resetMsg,'Enter your name.');
  if(!emailRe.test(email)) return setErr(resetMsg,'Enter a valid email.');
  if(p1.length<6) return setErr(resetMsg,'Password must be at least 6 characters.');

  try{
    const r = await fetch(`${API}/reset`,{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name, email, newPassword: p1 })
    });
    const data = await r.json();
    if(!data.ok) return setErr(resetMsg, data.error||'Reset failed.');
    setOk(resetMsg,'Password updated! You can now sign in.');
    nameInput.value=name; emailInput.value=email; pw.value='';
    showSignIn();
  }catch(err){ setErr(resetMsg,'Network error. Is the API running on port 4000?'); }
});

// logout
logoutBtn.addEventListener('click', ()=>{ currentUser=null; showSignIn(); });

// init
(function init(){ showSignIn(); })();
