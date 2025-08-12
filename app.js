
    const wall = document.getElementById('wall');
    const msg  = document.getElementById('msg');
    const btn  = document.getElementById('submitBtn');

    async function fetchList(){
      const r = await fetch('/api/list', { cache:'no-store' });
      if (!r.ok) throw new Error('list failed');
      return r.json();
    }

    function cardNode(item){
      const url = item.twitter_url || `https://twitter.com/${item.handle}`;
      const pfp = item.pfp_url || '';
      const handle = item.handle ? '@'+item.handle : '';

      const a = document.createElement('a');
      a.className = 'card';
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = `
        <div class="pfp"><img src="${pfp}" alt="${handle}'s avatar" loading="lazy"></div>
        <div class="caption"><span class="handle">${handle}</span></div>
      `;
      return a;
    }


    function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
    function rotate(arr){
      if(!arr.length) return arr;
      const key='aztec_pfp_wall_rot';
      const prev=parseInt(sessionStorage.getItem(key)||'0',10)||0;
      const off=(prev+3)%arr.length;
      sessionStorage.setItem(key, String(off));
      return arr.slice(off).concat(arr.slice(0,off));
    }


    function random(min,max){ return Math.random()*(max-min)+min; }


    function floatCard(el, stage){
      const W = stage.clientWidth  - el.clientWidth;
      const H = stage.clientHeight - el.clientHeight;

      function hop(){
        const x = random(0, W);
        const y = random(0, H);
        const d = random(10, 18);        
        el.animate(
          [{ transform:`translate(${x}px, ${y}px)` }],
          { duration: d*1000, easing: 'ease-in-out', fill: 'forwards' }
        ).finished.then(hop).catch(()=>{});
      }
   
      el.style.transform = `translate(${random(0,W)}px, ${random(0,H)}px)`;
      
      setTimeout(hop, random(100, 1200));
    }

    async function render(){
      msg.textContent = '';
      try {
        let data = await fetchList();
        if (!Array.isArray(data) || !data.length){
          wall.innerHTML = '<div style="color:#c8cff9;padding:20px">No cards yet. Be the first!</div>';
          return;
        }
        data = rotate(shuffle(data));

        
        wall.innerHTML = '';
        const frag = document.createDocumentFragment();
        data.forEach(item => {
          const el = cardNode(item);
          frag.appendChild(el);
        });
        wall.appendChild(frag);

        
        const cards = wall.querySelectorAll('.card');
        cards.forEach(el => floatCard(el, wall));

       
        let t; window.addEventListener('resize', ()=>{ clearTimeout(t); t=setTimeout(()=>{
          cards.forEach(el => floatCard(el, wall));
        }, 200); });

      } catch(e){
        msg.textContent = 'Failed to load. Refresh to try again.';
      }
    }

    document.getElementById('form').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const raw = document.getElementById('handle').value;
      const handle = String(raw).trim().replace(/^@+/, '');
      if(!handle){ msg.textContent = 'Enter a handle'; return; }
      btn.disabled = true; btn.textContent = 'Submitting…'; msg.textContent = '';

      try {
        const r = await fetch('/api/submit', {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ handle })
        });
        const j = await r.json();
        if(!r.ok || !j.ok){
          msg.textContent = j?.error || 'Could not fetch PFP';
        } else {
          document.getElementById('form').reset();
          await render();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } catch (err){
        msg.textContent = 'Network error';
      } finally {
        btn.disabled = false; btn.textContent = 'Submit';
      }
    });

    render();
