
    const stage = document.getElementById('stage');
    const msg   = document.getElementById('msg');
    const btn   = document.getElementById('submitBtn');

    /* Helpers */
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

    // Place each card absolutely within the stage and give it its own drift
    function layoutFreeFloat(){
      const cards = stage.querySelectorAll('.card');
      if (!cards.length) return;

      const pad = 10;
      const W = stage.clientWidth;
      const H = stage.clientHeight;

      const cw = cssNum(document.documentElement, '--card-w') || 110;
      const ch = cssNum(document.documentElement, '--card-h') || 140;

      cards.forEach((el, i) => {
        // BASE POSITION: random anywhere that fits (respect padding & card size)
        const left = Math.random() * (W - cw - 2*pad) + pad;
        const top  = Math.random() * (H - ch - 2*pad) + pad;

        // TARGET DISPLACEMENT: big wander, but clamp so it stays inside bounds
        const maxRight = (W - pad) - (left + cw);       // space to the right
        const maxLeft  = (left - pad);                  // space to the left
        const maxDown  = (H - pad) - (top + ch);        // space downward
        const maxUp    = (top - pad);                   // space upward

        // pick a direction bias so not all go diagonally the same way
        const biasX = (Math.random() < 0.5 ? -1 : 1);
        const biasY = (Math.random() < 0.5 ? -1 : 1);

        // choose magnitude using 30–70% of the room available in that direction
        const roomX = biasX > 0 ? maxRight : maxLeft;
        const roomY = biasY > 0 ? maxDown  : maxUp;

        // If there's no room in one direction, flip bias
        const bx = roomX <= 8 ? -biasX : biasX;
        const by = roomY <= 8 ? -biasY : biasY;

        const capX = (bx > 0 ? maxRight : maxLeft);
        const capY = (by > 0 ? maxDown  : maxUp);

        // 0.3–0.7 of available space so it can travel visibly
        const dx = (capX * (0.3 + Math.random()*0.4)) * bx;
        const dy = (capY * (0.3 + Math.random()*0.4)) * by;

        const dur   = (3 + Math.random() * 5).toFixed(2); // faster 3..8s
        const delay = (Math.random() * 3).toFixed(2);     // 0..3s
        const r0 = ((Math.random() * 1.5) - 0.75).toFixed(2) + 'deg';
        const r1 = ((Math.random() * 2.0) - 1.0).toFixed(2) + 'deg';

        el.style.left = `${clamp(left, pad, W - cw - pad)}px`;
        el.style.top  = `${clamp(top , pad, H - ch - pad)}px`;
        el.style.setProperty('--dx', `${dx.toFixed(1)}px`);
        el.style.setProperty('--dy', `${dy.toFixed(1)}px`);
        el.style.setProperty('--dur', `${dur}s`);
        el.style.setProperty('--delay', `${delay}s`);
        el.style.setProperty('--r0', r0);
        el.style.setProperty('--r1', r1);
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
        // after painting to DOM, compute positions and drift per card
        layoutFreeFloat();
      }catch(e){
        msg.textContent = 'Failed to load. Refresh to try again.';
      }
    }

    // Recompute on resize (throttle)
    let resizeTimer = null;
    window.addEventListener('resize', ()=>{
      if(resizeTimer) cancelAnimationFrame(resizeTimer);
      resizeTimer = requestAnimationFrame(layoutFreeFloat);
    });

    // Submit
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

    // Boot
    render();
  