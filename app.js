const stage = document.getElementById('stage');
    const msg   = document.getElementById('msg');
    const btn   = document.getElementById('submitBtn');

    const cssNum = (el, prop) => parseFloat(getComputedStyle(el).getPropertyValue(prop));
    const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    async function fetchList(){
      const r = await fetch('/api/list', { cache:'no-store' });
      if(!r.ok) throw new Error('list failed');
      return r.json();
    }

    async function submitHandle(handle){
      const r = await fetch('/api/submit', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ handle })
      });
      const j = await r.json();
      if(!r.ok || !j.ok) throw new Error(j?.error || 'submit failed');
      return j.item;
    }

    function cardHtml(item){
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

    // Position cards randomly within stage
    function scatterCards(){
      const cards = stage.querySelectorAll('.card');
      if (!cards.length) return;

      const pad = 10;
      const W = stage.clientWidth;
      const H = stage.clientHeight;

      const cw = cssNum(document.documentElement, '--card-w') || 110;
      const ch = cssNum(document.documentElement, '--card-h') || 140;

      cards.forEach((el) => {
        const left = Math.random() * (W - cw - 2*pad) + pad;
        const top  = Math.random() * (H - ch - 2*pad) + pad;
        el.style.left = `${clamp(left, pad, W - cw - pad)}px`;
        el.style.top  = `${clamp(top , pad, H - ch - pad)}px`;

        // Clear any ongoing transform so we start from anchor
        el.style.transform = 'translate3d(0,0,0)';
      });
    }

    // Pick a new target offset and animate there via CSS transitions.
    // When the transition ends, pick a new target (so directions keep changing).
    function startWander(){
      const cards = stage.querySelectorAll('.card');
      if (!cards.length) return;

      const pad = 10;
      const W = stage.clientWidth;
      const H = stage.clientHeight;

      const cw = cssNum(document.documentElement, '--card-w') || 110;
      const ch = cssNum(document.documentElement, '--card-h') || 140;

      cards.forEach((el, idx) => {
        // Keep a per-card wander loop
        const wander = () => {
          const left = parseFloat(el.style.left || '0');
          const top  = parseFloat(el.style.top  || '0');

          const maxRight = (W - pad) - (left + cw);
          const maxLeft  = (left - pad);
          const maxDown  = (H - pad) - (top + ch);
          const maxUp    = (top - pad);

          // Pick a random target offset within 35–65% of available space
         // Pick a random target offset within 35–60% of available space
const pick = (negRoom, posRoom) => {
  const goNeg = Math.random() < 0.5;
  const room  = goNeg ? negRoom : posRoom;
  const frac  = 0.35 + Math.random()*0.25; // 35..60%
  let delta   = room * frac;
  if (goNeg) delta = -delta;
  if (Math.abs(delta) < 8) delta = -delta; // avoid tiny steps
  return delta;
};

const dx = pick(maxLeft, maxRight);
const dy = pick(maxUp,   maxDown);

// Calmer speed: 4.5–8.0s, tiny delay 0–0.6s
const dur   = (4.5 + Math.random() * 3.5).toFixed(2); // 4.5..8.0s
const delay = (Math.random() * 0.6).toFixed(2);       // 0..0.6s

const r = ((Math.random() * 2.0) - 1.0).toFixed(2);   // -1..1deg wobble

el.style.setProperty('--dur', `${dur}s`);
el.style.transitionDuration = `${dur}s`;
el.style.transitionDelay = `${delay}s`;
el.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) rotate(${r}deg)`;
        };

        // Kick off with slight stagger so not all move at once
        setTimeout(wander, Math.random()*800);

        // On every transition end, choose a new target
        el.addEventListener('transitionend', (ev) => {
  if (ev.propertyName !== 'transform') return;

  const pad = 10;
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  const cw = cssNum(document.documentElement, '--card-w') || 110;
  const ch = cssNum(document.documentElement, '--card-h') || 140;

  // Parse current transform deltas
  const m = el.style.transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/);
  const dx = m ? parseFloat(m[1]) : 0;
  const dy = m ? parseFloat(m[2]) : 0;

  // Compute new anchor (base) position
  const left = parseFloat(el.style.left || '0');
  const top  = parseFloat(el.style.top  || '0');
  const nextLeft = clamp(left + dx, pad, W - cw - pad);
  const nextTop  = clamp(top  + dy, pad, H - ch - pad);

  // --- Teleport-free snap: disable transition → snap → reflow → restore ---
  const oldTransition = el.style.transition;
  el.style.transition = 'none';                  // disable animations
  el.style.left = `${nextLeft}px`;
  el.style.top  = `${nextTop}px`;
  el.style.transform = 'translate3d(0,0,0) rotate(0deg)';  // reset transform
  void el.offsetHeight;                          // force reflow
  el.style.transition = oldTransition || 'transform var(--dur,5s) ease-in-out';

  // Next leg
  requestAnimationFrame(() => wander());
}, { passive: true });
      });
    }

    function shuffle(arr){
      for(let i=arr.length-1;i>0;i--){
        const j = Math.floor(Math.random()*(i+1));
        [arr[i],arr[j]] = [arr[j],arr[i]];
      }
      return arr;
    }
    function rotate(arr){
      if(!arr.length) return arr;
      const key = 'aztec_pfp_wall_rot';
      const prev = parseInt(sessionStorage.getItem(key) || '0', 10) || 0;
      const off = (prev + 3) % arr.length;
      sessionStorage.setItem(key, String(off));
      return arr.slice(off).concat(arr.slice(0, off));
    }

    async function render(){
      msg.textContent = '';
      try{
        let data = await fetchList();
        if(!Array.isArray(data) || !data.length){
          stage.innerHTML = '<div style="color:#9aa4d6; padding:14px">No cards yet. Be the first!</div>';
          return;
        }
        data = rotate(shuffle(data));
        stage.innerHTML = data.map(cardHtml).join('');
        scatterCards();   // random anchors
        startWander();    // continuous direction changes
      }catch(e){
        msg.textContent = 'Failed to load. Refresh to try again.';
      }
    }

    // Re-scatter and keep wandering on resize/orientation change
    let resizeTimer = null;
    window.addEventListener('resize', ()=>{
      if(resizeTimer) cancelAnimationFrame(resizeTimer);
      resizeTimer = requestAnimationFrame(()=>{
        scatterCards();
        // no need to rebind listeners; cards keep wandering from new anchors
      });
    });

    document.getElementById('form').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const raw = document.getElementById('handle').value;
      const handle = String(raw).trim().replace(/^@+/, '');
      if(!handle){ msg.textContent = 'Enter a handle'; return; }
      btn.disabled = true; btn.textContent = 'Submitting…'; msg.textContent = '';
      try{
        await submitHandle(handle);
        document.getElementById('form').reset();
        await render();
        window.scrollTo({ top:0, behavior:'smooth' });
      }catch(err){
        msg.textContent = err.message || 'Could not fetch PFP';
      }finally{
        btn.disabled = false; btn.textContent = 'Submit';
      }
    });

    render();
  