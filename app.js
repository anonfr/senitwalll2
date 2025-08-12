
    const wall = document.getElementById('wall');
    const msg  = document.getElementById('msg');
    const btn  = document.getElementById('submitBtn');

    async function fetchList(){
      const r = await fetch('/api/list', { cache:'no-store' });
      if (!r.ok) throw new Error('list failed');
      return r.json();
    }

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

    // Shuffle
    function shuffle(arr){
      for(let i=arr.length-1; i>0; i--){
        const j = Math.floor(Math.random() * (i+1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    // Rotate order across refreshes
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
      try {
        let data = await fetchList();
        if (!Array.isArray(data) || !data.length){
          wall.innerHTML = '<div style="color:#9aa4d6">No cards yet. Be the first!</div>';
          return;
        }
        data = rotate(shuffle(data));
        wall.innerHTML = data.map(card).join('');

        // Give each card its own random drifting vector and timing
        const cards = wall.querySelectorAll('.card');
        cards.forEach((el) => {
          const dx = (Math.random() * 80 - 40).toFixed(1); // -12..12px
          const dy = (Math.random() * 80 - 40).toFixed(1); // -12..12px
          const dur = (3 + Math.random() * 4).toFixed(2);  // 7..14s
          const delay = (Math.random() * 4).toFixed(2);    // 0..4s
          el.style.setProperty('--dx', `${dx}px`);
          el.style.setProperty('--dy', `${dy}px`);
          el.style.setProperty('--dur', `${dur}s`);
          el.style.animationDelay = `${delay}s`;
        });
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
