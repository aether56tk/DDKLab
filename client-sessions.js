/* DDKLab local client/session workspace. Local-only; no cloud upload. */
(function(){
'use strict';
const KEY='ddklab.clients.v1';
const load=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'{}');return{clients:x.clients||[],sessions:x.sessions||[]}}catch{return{clients:[],sessions:[]}}};
let db=load();
const save=()=>localStorage.setItem(KEY,JSON.stringify(db));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function addButton(){
 const app=document.getElementById('app'); if(!app||document.getElementById('clientBtn'))return;
 const b=document.createElement('button');b.id='clientBtn';b.className='btn';b.textContent='Client & Session Workspace';b.style.marginTop='10px';
 const home=app.querySelector('.hero .stack'); if(home)home.appendChild(b); b.onclick=show;
}
function show(){
 const app=document.getElementById('app');
 app.innerHTML='<div class="top"><button class="back" id="clientBack">‹</button><div><div class="brand">Client Sessions</div><div class="sub">Local device only • research workflow</div></div></div><div class="stack"><div class="card"><h2>Add client</h2><div class="grid"><input class="input" id="cName" placeholder="Client code / initials"><input class="input" id="cNote" placeholder="Optional note"></div><button class="btn" id="cAdd">Add client</button></div><div class="card"><h2>Session entry</h2><select class="select" id="cClient"></select><select class="select" id="cTask" style="margin-top:8px"><option>AMR PA</option><option>AMR TA</option><option>AMR KA</option><option>SMR PATAKA</option></select><input class="input" id="cCount" type="number" min="0" step="1" placeholder="Verified count" style="margin-top:8px"><input class="input" id="cNote2" placeholder="Session note" style="margin-top:8px"><button class="btn" id="cSave" style="margin-top:8px">Save local session</button></div><div class="card"><h2>Local history</h2><div id="cStats"></div><div id="cList"></div><button class="btn" id="cExport" style="margin-top:8px">Export CSV</button></div></div>';
 document.getElementById('clientBack').onclick=()=>{if(typeof home==='function')home()};
 const render=()=>{const sel=document.getElementById('cClient');sel.innerHTML=db.clients.length?db.clients.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join(''):'<option value="">Add a client first</option>';document.getElementById('cStats').innerHTML='<b>'+db.clients.length+'</b> clients · <b>'+db.sessions.length+'</b> sessions';document.getElementById('cList').innerHTML=db.sessions.slice(0,50).map(s=>'<p><b>'+esc(s.clientName)+'</b> · '+esc(s.task)+' · '+esc(s.count??'—')+' verified<br><small>'+new Date(s.createdAt).toLocaleString()+' · '+esc(s.note||'No note')+'</small></p>').join('')||'<div class="status">No sessions recorded.</div>'};
 document.getElementById('cAdd').onclick=()=>{const name=document.getElementById('cName').value.trim();if(!name)return;db.clients.unshift({id:'C-'+Date.now(),name,note:document.getElementById('cNote').value.trim(),createdAt:new Date().toISOString()});save();render()};
 document.getElementById('cSave').onclick=()=>{const c=db.clients.find(x=>x.id===document.getElementById('cClient').value);if(!c)return;db.sessions.unshift({id:'S-'+Date.now(),clientId:c.id,clientName:c.name,task:document.getElementById('cTask').value,count:Number(document.getElementById('cCount').value)||null,note:document.getElementById('cNote2').value.trim(),createdAt:new Date().toISOString()});save();document.getElementById('cCount').value='';document.getElementById('cNote2').value='';render()};
 document.getElementById('cExport').onclick=()=>{const rows=[['client_id','client_name','task','verified_count','note','created_at'],...db.sessions.map(s=>[s.clientId,s.clientName,s.task,s.count,s.note,s.createdAt])];const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='ddklab-client-sessions.csv';a.click()};
 render();
}
new MutationObserver(addButton).observe(document.body,{childList:true,subtree:true});document.addEventListener('DOMContentLoaded',addButton);
})();
