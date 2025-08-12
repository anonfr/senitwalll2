const wall = document.getElementById('wall');
const msg  = document.getElementById('msg');
const btn  = document.getElementById('submitBtn');

/* API */
async function fetchList(){
  const r = await fetch('/api/list', { cache:'no-store' });
  if (!r.ok) throw new Error('list failed');
  return r.json();
}

async function submitHandle(handle){
  const r = await fetch('/api/submit', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ handle })
  });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j?.error || 'submit failed');
  return j.item;
}

/* UI helpers */
function card(item){
  const url = item.twitter_url || `https://twitter.com/${item.handle}`;
  const pfp = item.pfp_url || '';
  const handle = item.handle ? '@'+item.handle : '';
  return `
    <a class="card" href="${url}" target="_blank" rel="noopener">
      <div class="pfp"><img src="${pfp}" alt="${handle}'s avatar" loading="lazy"></div>
      <div class="caption"><span class="handle">${handle}</span></div>
    </a>
  `;
}

// Fisher–Yates
function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Rotate across refreshes so first row changes each time
function rotate(arr){
  if (!arr.length) return arr;
  const key = 'aztec_pfp_wall_rot';
  const prev = parseInt(sessionStorage.getItem(key) || '0', 10) || 0;
  const off = (prev + 3) % arr.length; // rotate by +3 each render
  sessionStorage.setItem(key, String(off));
  return arr.slice(off).concat(arr.slice(0, off));
}

/* Apply per-card drift with unique direction/timing/rotation */
function personalizeDrift(){
  const cards = wall.querySelectorAll('.card');
  cards.forEach((el) => {
    // Random direction & magnitude
    const dx = (Math.random() * 28 - 14).toFixed(1);  // -14..14px
    const dy = (Math.random() * 36 - 18).toFixed(1);  // -18..18px
    // Sometimes swap axes for variety
    const swap = Math.random() < 0.2;
    const DX = swap ? dy : dx;
    const DY = swap ? dx : dy;
    // Speed & phase
    const dur   = (7 + Math.random() * 7).toFixed(2); // 7..14s
    const delay = (Math.random() * 3).toFixed(2);     // 0..3s
    // Tiny rotation wobble
    const r0 = ((Math.random() * 1.5) - 0.75).toFixed(2) + 'deg'; // -0.75..0.75
    const r1 = ((Math.random() * 2.0) - 1.0).toFixed(2) + 'deg';  // -1..1

    el.style.setProperty('--dx', `${DX}px`);
    el.style.setProperty('--dy', `${DY}px`);
    el.style.setProperty('--dur', `${dur}s`);
    el.style.setProperty('--delay', `${delay}s`);
    el.style.setProperty('--r0', r0);
    el.style.setProperty('--r1', r1);
  });
}

/* Render pipeline */
async function render(){
  msg.textContent = '';
  try{
    let data = await fetchList();
    if (!Array.isArray(data) || !data.length){
      wall.innerHTML = '<div style="color:#9aa4d6">No cards yet. Be the first!</div>';
      return;
    }
    // fresh order each time
    data = rotate(shuffle(data));
    wall.innerHTML = data.map(card).join('');
    personalizeDrift(); // make each card float differently
  }catch(e){
    msg.textContent = 'Failed to load. Refresh to try again.';
  }
}

/* Form submit */
document.getElementById('form').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const raw = document.getElementById('handle').value;
  const handle = String(raw).trim().replace(/^@+/, '');
  if (!handle){ msg.textContent = 'Enter a handle'; return; }

  btn.disabled = true; btn.textContent = 'Submitting…'; msg.textContent = '';
  try{
    await submitHandle(handle);
    document.getElementById('form').reset();
    await render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }catch(err){
    msg.textContent = err.message || 'Could not fetch PFP';
  }finally{
    btn.disabled = false; btn.textContent = 'Submit';
  }
});

/* boot */
render();