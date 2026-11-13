'use strict';
(() => {
 const c=JSON.parse(document.getElementById('comparison-data').textContent);
 const controls=[...document.querySelectorAll('[data-weight]')];
 const input=()=>Object.fromEntries(controls.map(el=>[el.dataset.weight,Number(el.value)]));
 const scoreText=n=>n===null?'Unranked':n.toFixed(1);
 const words=(k,v)=>k&&k.format&&window.OVMetrics?window.OVMetrics.format[k.format](v):null;
 let ranked=CompareRank.rank(c,input());
 function order(ids){for(const id of ids)for(const parent of [document.getElementById('cards'),document.getElementById('rows')]){const el=[...parent.children].find(e=>e.dataset.thing===id);if(el)parent.append(el);}}
 function update(){
   ranked=CompareRank.rank(c,input());order(ranked.map(r=>r.thing.id));
   for(const row of ranked)for(const el of document.querySelectorAll('[data-thing]'))if(el.dataset.thing===row.thing.id){const target=el.querySelector('[data-score]');target.replaceChildren();if(row.score===null){target.textContent='Unranked';continue;}const d=document.createElement('details'),s=document.createElement('summary');s.textContent=scoreText(row.score);d.append(s,document.createTextNode(`Derived from the dated results below using your weights. Updated ${c.updated_at.slice(0,10)}. See Method.`));target.append(d);}
   const url=new URL(location.href);for(const el of controls){url.searchParams.set(`w.${el.dataset.weight}`,el.value);el.nextElementSibling.textContent=el.value;}history.replaceState(null,'',url);chart();
 }
 controls.forEach(el=>el.addEventListener('input',update));
 let descending=false;
 document.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{
   const key=b.dataset.sort;descending=!descending;
   const value=id=>key==='overall'?ranked.find(r=>r.thing.id===id)?.score:c.results.find(r=>r.thing===id && r.criterion===key)?.value;
   const ids=c.things.map(t=>t.id).sort((a,b)=>{const x=value(a),y=value(b);if(x==null)return y==null?0:1;if(y==null)return -1;return descending?y-x:x-y;});order(ids);
   document.querySelectorAll('thead th').forEach(th=>th.removeAttribute('aria-sort'));b.closest('th').setAttribute('aria-sort',descending?'descending':'ascending');
 }));
 function evidence(r,k){const d=document.createElement('details'),s=document.createElement('summary'),a=document.createElement('a');s.textContent=words(k,r.value)||String(r.value);a.href=r.source.url;a.textContent=r.source.label;d.append(s,document.createTextNode(`${r.as_of.slice(0,10)} · `),a);return d;}
 function chart(){
   const box=document.getElementById('chart');box.replaceChildren();const mode=document.getElementById('chart-mode').value;if(mode==='none')return;
   if(mode==='bars')for(const k of c.criteria){
     const h=document.createElement('h3');h.textContent=`${k.label} (${k.unit})`;box.append(h);
     const rs=c.results.filter(r=>r.criterion===k.id),max=Math.max(1,...rs.map(r=>Math.abs(r.value)));
     if(!rs.length){const p=document.createElement('p');p.textContent='Not measured';box.append(p);}
     for(const r of rs){const div=document.createElement('div');div.className='chart-row';const meter=document.createElement('meter');meter.min=Math.min(0,...rs.map(r=>r.value));meter.max=max;meter.value=r.value;meter.setAttribute('aria-label',`${c.things.find(t=>t.id===r.thing).name}: ${words(k,r.value)||`${r.value} ${k.unit}`}`);div.append(document.createTextNode(c.things.find(t=>t.id===r.thing).name+' '),meter,evidence(r,k));box.append(div);}
   }
   if(mode==='scatter'){
     const points=c.things.map(t=>({t,x:c.results.find(r=>r.thing===t.id&&r.criterion==='output'),y:c.results.find(r=>r.thing===t.id&&r.criterion==='quality')})).filter(p=>p.x&&p.y);
     if(!points.length){box.textContent='No models have both dated price and measured quality yet.';return;}
     const axes=document.createElement('p');axes.textContent='Horizontal: output price (USD / million tokens). Vertical: arena quality (Elo); higher is better. Values, dates and sources below.';box.append(axes);
     const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 600 360');svg.setAttribute('role','img');svg.setAttribute('aria-label','Output price (horizontal, USD per million tokens) against arena quality (vertical, Elo). Values, dates and sources follow.');
     const xmax=Math.max(1,...points.map(p=>p.x.value)),ys=points.map(p=>p.y.value),ymin=Math.min(...ys),ymax=Math.max(...ys);
     for(const p of points){const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',40+520*p.x.value/xmax);circle.setAttribute('cy',310-270*(ymax===ymin?.5:(p.y.value-ymin)/(ymax-ymin)));circle.setAttribute('r',6);circle.setAttribute('fill','currentColor');const title=document.createElementNS(ns,'title');title.textContent=`${p.t.name}: ${p.x.value} USD / 1M output tokens, ${p.y.value} Elo`;circle.append(title);svg.append(circle);}
     box.append(svg);for(const p of points){const div=document.createElement('div');div.append(document.createTextNode(`${p.t.name} — output price / quality: `),evidence(p.x),evidence(p.y));box.append(div);}
   }
 }
 document.getElementById('chart-mode').addEventListener('change',chart);
})();
