(function(){
 'use strict';
 const store = 'mealprep.dual.state';
 const hash = location.hash.slice(1);
 const requested = ['simple','full'].includes(hash);
 function read(key){try{return localStorage.getItem(key)}catch{return null}}
 let mode = requested ? hash : 'full';
 try { if (!requested) mode = sessionStorage.getItem('mealprep.view') || 'full'; sessionStorage.setItem('mealprep.view', mode); } catch {}
 if(requested) {try {history.replaceState(null,'','#menu')} catch {}}
 window.simpleView = mode === 'simple';
 if(window.simpleView){
   document.documentElement.classList.add('simple-mode');
   document.querySelector('section.setup').replaceWith(document.querySelector('#simpleSetup').content.cloneNode(true));
 }
 const toggle = document.querySelector('#switchMode');
 toggle.textContent = window.simpleView ? '切到完整版' : '切到简选版';
 toggle.onclick = function(){location.hash=window.simpleView?'full':'simple';location.reload()};
 window.addEventListener('storage', function(event){
   if (event.key === store && event.newValue !== event.oldValue) location.reload();
 });
 const status = document.querySelector('#backupStatus');
 function valid(obj){return obj && typeof obj.settings==='object' && obj.settings && !Array.isArray(obj.settings)}
 function restore(raw){
   try{
     const obj=JSON.parse(raw);
     if(!valid(obj)) throw Error();
     if(!confirm('使用这份计划？当前计划会保留为上一次备份。')) return;
     const previous=read(store);
     if(previous)localStorage.setItem(store+'.previous',previous);
     localStorage.setItem(store,raw);location.reload();
   }catch{status.textContent='未能导入，请选择家庭餐桌的计划 JSON 文件。'}
 }
 for(const [key,name] of [['mealprep.v3.state','原完整版计划'],['mealprep.simple.v1.state','原简选版计划'],[store+'.previous','上一次备份']]){
   const raw=read(key); if(!raw)continue;
   const button=document.createElement('button');button.textContent='使用'+name;button.className='btn small';button.onclick=()=>restore(raw);document.querySelector('#legacyPlans').append(button);
 }
 document.querySelector('#importPlan').onchange=async function(){if(this.files[0])restore(await this.files[0].text())};
 document.querySelector('#exportPlan').onclick=function(){
   const state=window.__MEALPREP__.state;
   const raw=JSON.stringify({version:3,settings:state.settings,checks:state.checks,edits:state.edits},null,2);
   const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
   const link=document.createElement('a');link.href=url;link.download='家庭餐桌计划.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
})();
