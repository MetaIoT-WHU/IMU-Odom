/* Five segment endpoints on the shared, registered map. */
(() => {
  const ns='http://www.w3.org/2000/svg';
  function node(tag,parent,cls,text){
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(text!==undefined)n.textContent=text;
    parent.append(n);return n;
  }
  function vector(tag,parent,attrs,text){
    const n=document.createElementNS(ns,tag);
    for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);
    if(text!==undefined)n.textContent=text;
    parent.append(n);return n;
  }
  const star=Array.from({length:10},(_,i)=>{
    const a=i*Math.PI/5-Math.PI/2,r=i%2?3.6:8.2;
    return [Math.cos(a)*r,Math.sin(a)*r].join(',');
  }).join(' ');
  function miniature(parent,image,data,styles,s){
    const canvas=node('canvas',parent,'segment-mini');
    canvas.setAttribute('aria-hidden','true');canvas.width=260;canvas.height=164;
    const ctx=canvas.getContext('2d'),w=image.naturalWidth,h=image.naturalHeight;
    const tracks=styles.map(st=>data.mapCoords[st.id].slice(s.first,s.last+1).map(([x,y])=>[x*w,y*h]));
    const p=tracks.flat(),xs=p.map(v=>v[0]),ys=p.map(v=>v[1]);
    const [x0,x1,y0,y1]=[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)];
    const k=Math.min(228/Math.max(x1-x0,1),136/Math.max(y1-y0,1));
    const dx=130-k*(x0+x1)/2,dy=82-k*(y0+y1)/2;
    ctx.fillStyle='#142932';ctx.fillRect(0,0,260,164);ctx.drawImage(image,dx,dy,w*k,h*k);
    tracks.forEach((pts,j)=>{
      ctx.beginPath();pts.forEach(([x,y],i)=>{if(i)ctx.lineTo(dx+x*k,dy+y*k);else ctx.moveTo(dx+x*k,dy+y*k);});
      ctx.lineWidth=2;ctx.strokeStyle=styles[j].color;ctx.stroke();
    });
    const [x,y]=tracks[0].at(-1);
    ctx.save();ctx.translate(dx+x*k,dy+y*k);ctx.beginPath();
    for(const [i,v] of star.split(' ').entries()){
      const [a,b]=v.split(',').map(Number);if(i)ctx.lineTo(a,b);else ctx.moveTo(a,b);
    }
    ctx.closePath();ctx.fillStyle='#b72b79';ctx.fill();ctx.lineWidth=1.4;ctx.strokeStyle='white';ctx.stroke();ctx.restore();
  }
  window.eastlakePanel=function(player,item,d,route,signals,img,jump){
    const root=player.root, segs=item.segments;
    const mast=root.querySelector('.player-legend');
    const key=node('li',mast,'star-key','段末 GNSS 观测');
    key.style.setProperty('--stroke','#ea66aa');
    const rail=signals.parentElement;rail.querySelector('figcaption').hidden=true;
    const tabs=node('div',rail,'exp-tabs');rail.prepend(tabs);
    const list=node('div',rail,'exp-segments');
    const switches=['分段记录','运动曲线'].map((name,i)=>{
      const b=node('button',tabs,'',name);b.type='button';
      b.onclick=()=>{list.hidden=!!i;signals.style.display=i?'block':'none';
        switches.forEach((button,k)=>button.setAttribute('aria-pressed',String(k===i)));};
      return b;
    });
    switches[0].click();
    const marks=[],buttons=[];
    const height=Number(route.viewBox.baseVal.height);
    const offsets=[[20,14],[18,-12],[-18,-12],[-20,-14],[-17,17]];
    const compass=vector('g',route,{transform:'translate(20 22)','aria-hidden':'true'});
    vector('rect',compass,{x:-12,y:-14,width:24,height:44,rx:3,fill:'#102329',opacity:.87});
    vector('text',compass,{y:-2,'text-anchor':'middle',fill:'white','font-size':11},'北');
    vector('path',compass,{d:'M0 2 L7 22 L0 18 L-7 22 Z',fill:'#f5fbfa'});
    const scale=vector('g',route,{transform:'translate(14 '+(height-32)+')','aria-hidden':'true'});
    vector('rect',scale,{width:item.scale500+12,height:22,fill:'#102329',opacity:.84,rx:2});
    vector('text',scale,{x:6+item.scale500/2,y:10,'text-anchor':'middle',fill:'white','font-size':8},'500 米');
    vector('path',scale,{d:'M6 13v4m0 -2h'+item.scale500+'m0 -2v4',fill:'none',stroke:'white'});
    const over=vector('g',route,{'aria-label':'段末 GNSS 位置观测'});
    segs.forEach((s,n)=>{
      const b=node('button',list,'exp-segment');b.type='button';
      miniature(b,img,d,item.legend,s);
      const copy=node('span',b,'seg-copy'),top=node('span',copy,'seg-top');
      node('b',top,'seg-index',String(n+1).padStart(2,'0'));node('strong',top,'',s.label);
      node('span',copy,'seg-clock',s.clocks.join(' – '));
      const stats=node('span',copy,'seg-stats');node('b',stats,'',s.km.toFixed(2)+' km');node('span',stats,'','段末误差 '+s.endError.toFixed(2)+' m');
      b.onclick=()=>jump(d.t[s.first]);buttons.push(b);
      const [x,y]=d.mapCoords.gt[s.last], [lx,ly]=offsets[n];
      const g=vector('g',over,{transform:'translate('+x*640+' '+y*height+')',display:'none','data-fix':n+1});
      const marker=vector('g',g,{class:'exp-fix-symbol'});
      vector('line',marker,{x1:0,y1:0,x2:lx,y2:ly,stroke:'#fff','stroke-width':2});
      vector('polygon',marker,{points:star,fill:'#ad2167',stroke:'white','stroke-width':1.6});
      vector('circle',marker,{cx:lx,cy:ly,r:7.3,fill:'#8b2059',stroke:'white','stroke-width':1});
      vector('text',marker,{x:lx,y:ly+3.6,'text-anchor':'middle',fill:'white','font-size':10,'font-weight':700},n+1);
      marks.push(g);
    });
    const summary=node('div',rail,'exp-summary');node('p',summary,'','全程位置均方根误差');
    item.rmse.forEach((v,i)=>{
      const row=node('div',summary,'exp-measure');
      node('span',row,'',i?'段末辅助':'仅 IMU');
      const meter=node('i',row,'');meter.style.setProperty('--fraction',100*v/Math.max(...item.rmse)+'%');
      meter.style.setProperty('--stroke',item.legend[i+1].color);
      node('b',row,'',v.toFixed(1)+' m');
    });
    const controls=root.querySelector('.track-controls');
    const status=node('span',controls,'exp-count');controls.querySelector('input').after(status);
    let previous=-1,previousCount=-1;
    return time=>{
      const count=segs.filter(s=>time>=d.t[s.last]).length;
      const current=Math.min(count,segs.length-1);
      if(current!==previous){
        buttons.forEach((b,n)=>b.setAttribute('aria-current',String(n===current)));
        previous=current;
      }
      if(count!==previousCount){
        marks.forEach((g,n)=>g.setAttribute('display',n<count?'inline':'none'));
        status.textContent='观测 '+count+' / 5';previousCount=count;
      }
    };
  };
})();
