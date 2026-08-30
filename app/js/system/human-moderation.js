(() => {
  'use strict';
  const API = String(window.API_URL || '').replace(/\/+$/, '');
  const state = { packs: [], tracks: [], index: 0, key: sessionStorage.getItem('sonaraFounderKey') || '' };
  const $ = sel => document.querySelector(sel);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const t = value => window.SonaraI18n?.t?.(value) || value;

  function askKey() {
    const value = window.prompt(t('Clé Founder'), state.key || '');
    if (value == null) return false;
    state.key = String(value).trim();
    sessionStorage.setItem('sonaraFounderKey', state.key);
    return Boolean(state.key);
  }
  function headers(json = false) {
    return { ...(json ? {'Content-Type':'application/json'} : {}), 'x-founder-key': state.key };
  }
  async function api(path, options = {}) {
    if (!state.key && !askKey()) throw new Error(t('Clé Founder requise.'));
    const response = await fetch(`${API}${path}`, { cache:'no-store', ...options, headers:{...headers(Boolean(options.body)), ...(options.headers||{})} });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { state.key=''; sessionStorage.removeItem('sonaraFounderKey'); }
    if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
    return data;
  }
  function formatTime(seconds) {
    const n = Math.max(0, Number(seconds)||0); const m=Math.floor(n/60); const s=Math.floor(n%60); return `${m}:${String(s).padStart(2,'0')}`;
  }
  function flatten(packs) {
    return packs.flatMap(pack => {
      const tracks = Array.isArray(pack.tracks) && pack.tracks.length ? pack.tracks : [{id:`${pack.id}:resource`,title:pack.title,duration:0}];
      return tracks.map((track, trackIndex) => ({ pack, track, trackIndex }));
    });
  }
  async function load() {
    const root=$('[data-review]'); root.innerHTML='<div class="hm-empty">Chargement…</div>';
    try {
      const data=await api('/api/moderation/human-creation/packs');
      state.packs=data.items||[]; state.tracks=flatten(state.packs); state.index=Math.min(state.index,Math.max(0,state.tracks.length-1));
      $('[data-env]').textContent=String(data.environment||'').toUpperCase(); $('[data-count]').textContent=String(state.tracks.length);
      renderList(); renderReview();
    } catch(error) { root.innerHTML=`<div class="hm-empty">${esc(error.message)}</div>`; }
  }
  function renderList() {
    const list=$('[data-list]');
    if (!state.tracks.length) { list.innerHTML='<div class="hm-empty">Aucun son en attente.</div>'; return; }
    list.innerHTML=state.tracks.map((item,i)=>`<button class="hm-item ${i===state.index?'active':''}" data-index="${i}"><strong>${esc(item.track.title||item.pack.title)}</strong><span>${esc(item.pack.artist||item.pack.artistId||'Artiste')}</span><span>${esc(item.pack.title||'Pack')}</span><span class="hm-state">${esc(item.pack.humanModeration?.state||item.pack.status||'pending')}</span></button>`).join('');
    list.querySelectorAll('[data-index]').forEach(btn=>btn.addEventListener('click',()=>{ state.index=Number(btn.dataset.index); renderList(); renderReview(); }));
  }
  function info(label,value,wide=false){return `<div class="${wide?'hm-wide':''}"><span>${esc(t(label))}</span><strong>${esc(value||'—')}</strong></div>`}
  function tags(items){return `<div class="hm-tags">${(items||[]).length?(items||[]).map(x=>`<span>${esc(x)}</span>`).join(''):'<span>—</span>'}</div>`}
  function evidenceHtml(pack){ const items=pack.creationEvidence||[]; if(!items.length)return '<small>Aucun justificatif fourni.</small>'; return items.map(e=>`<button data-evidence="${esc(e.id)}"><span>${esc(e.originalName||e.kind)}</span><small>${esc(e.kind)} · ${Math.round((Number(e.size)||0)/1024)} Ko</small></button>`).join(''); }
  function historyHtml(pack){ const h=pack.humanModeration?.history||[]; const req=pack.humanModeration?.requests||[]; return [...h].reverse().slice(0,15).map(x=>`<div><strong>${esc(x.state||x.type)}</strong><p>${esc(x.note||'')}</p><small>${esc(x.createdAt||'')}</small></div>`).join('') + req.map(r=>`<div class="hm-request"><strong>Demande d’informations</strong><p>${esc(r.question||'')}</p>${r.response?`<p><b>Réponse artiste :</b> ${esc(r.response)}</p>`:''}<small>${esc(r.status||'open')}</small></div>`).join(''); }
  function renderReview() {
    const root=$('[data-review]'); const item=state.tracks[state.index];
    if(!item){root.innerHTML='<div class="hm-empty">Aucun son à modérer.</div>';return;}
    const {pack,track}=item; const creation=pack.creationProcess||{}; const sig=pack.technicalModerationSignals||{};
    root.innerHTML=`
      <div class="hm-review-head"><div><span class="hm-kicker">${esc(t('Review qualitative'))} · ${state.index+1}/${state.tracks.length}</span><h2>${esc(track.title||pack.title)}</h2><div class="hm-meta">${esc(pack.artist||pack.artistId||'')} · ${esc(pack.title||'')} · ${esc(pack.submittedAt||pack.createdAt||'')}</div></div><div class="hm-nav"><button data-prev>Précédent</button><button data-next>Suivant</button></div></div>
      <div class="hm-grid">
        <div class="hm-card hm-player"><h3>Écoute</h3><audio data-audio preload="metadata" src="${esc(API + (track.moderationAudioUrl||''))}"></audio><div class="hm-player-main"><button class="hm-play" data-play>▶</button><input class="hm-timeline" data-timeline type="range" min="0" max="${Math.max(1,Number(track.duration)||1)}" step="0.05" value="0"><span class="hm-time" data-time>0:00 / ${formatTime(track.duration)}</span></div></div>
        <div class="hm-card"><h3>Identité</h3><div class="hm-info">${info('Artiste',pack.artist||pack.artistId)}${info('Pack',pack.title)}${info('Date de publication',pack.submittedAt||pack.createdAt)}${info('Durée',formatTime(track.duration))}${info('DAW utilisé',creation.daw||'Non indiqué')}${info('MIDI fourni',sig.midiProvided?'Oui':'Non')}</div></div>
        <div class="hm-card"><h3>Processus déclaré</h3><div class="hm-info">${info('Instruments','',true).replace('<strong>—</strong>',tags(creation.instruments))}${info('VST / plugins','',true).replace('<strong>—</strong>',tags(creation.plugins))}${info('Aide IA déclarée',creation.aiAssistanceUsed?'Oui':'Non')}${info('Type d’aide IA',creation.aiAssistanceUsed?(creation.aiAssistanceType||'—'):'Aucune')}${info('Précision sur l’aide IA',creation.aiAssistanceDetails||'—',true)}${info('Processus de création',creation.processComment||'—',true)}</div></div>
        <div class="hm-card"><h3>Signaux techniques</h3><div class="hm-signal"><strong>Signal de détection automatique — non conclusif</strong><p>Ces éléments aident la review humaine. Aucun signal ne déclenche un refus ou une sanction automatique.</p></div><div class="hm-info" style="margin-top:12px">${info('Notes MIDI',String(sig.midiNoteCount||0))}${info('Variété vélocités',String(sig.midiVelocityVariety||0))}${info('Stems fournis',sig.stemsProvided?'Oui':'Non')}${info('Projet fourni',sig.projectProvided?'Oui':'Non')}${info('Historique artiste',`${pack.artistHistory?.approved||0} approuvé(s) · ${pack.artistHistory?.rejected||0} refusé(s)`,true)}</div></div>
        <div class="hm-card"><h3>Justificatifs privés</h3><div class="hm-evidence">${evidenceHtml(pack)}</div></div>
        <div class="hm-card"><h3>Historique de review</h3><div class="hm-history">${historyHtml(pack)||'<small>Aucun événement.</small>'}</div></div>
        <div class="hm-card hm-wide"><h3>Décision humaine</h3><textarea class="hm-note" data-note placeholder="Note interne ou demande d’informations…">${esc(pack.humanModeration?.internalNote||'')}</textarea><div class="hm-actions"><button data-action="approve">Approuver</button><button data-action="reject">Refuser</button><button data-action="information_requested">Demander des informations supplémentaires</button><button data-action="on_hold">Mettre en attente</button><button data-action="suspect">Marquer comme suspect</button></div><div class="hm-warning">Aucun doute ou signal automatique ne bannit un artiste. Suspicion → review humaine → demande d’informations si nécessaire.</div></div>
      </div>`;
    bindReview();
  }
  function bindReview(){
    const item=state.tracks[state.index]; if(!item)return; const audio=$('[data-audio]'), timeline=$('[data-timeline]'), time=$('[data-time]');
    $('[data-prev]').onclick=()=>{state.index=(state.index-1+state.tracks.length)%state.tracks.length;renderList();renderReview()};
    $('[data-next]').onclick=()=>{state.index=(state.index+1)%state.tracks.length;renderList();renderReview()};
    $('[data-play]').onclick=()=>audio.paused?audio.play():audio.pause();
    audio.addEventListener('play',()=> $('[data-play]').textContent='Ⅱ'); audio.addEventListener('pause',()=> $('[data-play]').textContent='▶');
    audio.addEventListener('loadedmetadata',()=>{timeline.max=String(audio.duration||item.track.duration||1)});
    audio.addEventListener('timeupdate',()=>{ if(!timeline.matches(':active'))timeline.value=String(audio.currentTime||0);time.textContent=`${formatTime(audio.currentTime)} / ${formatTime(audio.duration||item.track.duration)}`; });
    timeline.addEventListener('input',()=>{audio.currentTime=Number(timeline.value)||0});
    rootEvidence();
    document.querySelectorAll('[data-action]').forEach(btn=>btn.addEventListener('click',()=>decide(btn.dataset.action)));
  }
  function rootEvidence(){ document.querySelectorAll('[data-evidence]').forEach(btn=>btn.addEventListener('click',async()=>{ const pack=state.tracks[state.index].pack; const e=(pack.creationEvidence||[]).find(x=>x.id===btn.dataset.evidence); if(!e)return; try{const res=await fetch(`${API}${e.url}`,{headers:headers()});if(!res.ok)throw new Error('Justificatif indisponible');const blob=await res.blob();const url=URL.createObjectURL(blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(err){alert(err.message)}})); }
  async function decide(action){
    const item=state.tracks[state.index]; const note=String($('[data-note]').value||'').trim();
    if(action==='reject'&&!note&&!confirm('Refuser sans motif personnalisé ?'))return;
    try{
      if(['approve','reject'].includes(action)){
        const status=action==='approve'?'approved':'rejected';
        await api(`/api/packs/${encodeURIComponent(item.pack.id)}/status`,{method:'PATCH',body:JSON.stringify({status,reason:note})});
        await api(`/api/moderation/human-creation/packs/${encodeURIComponent(item.pack.id)}/review`,{method:'PATCH',body:JSON.stringify({state:status,note})});
      } else {
        await api(`/api/moderation/human-creation/packs/${encodeURIComponent(item.pack.id)}/review`,{method:'PATCH',body:JSON.stringify({state:action,note})});
      }
      await load();
    }catch(error){alert(error.message)}
  }
  $('[data-key]').addEventListener('click',()=>{askKey();load()}); $('[data-reload]').addEventListener('click',load);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true}); else load();
})();
