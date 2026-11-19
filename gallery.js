/* Real trajectory samples, one shared clock, vector plots at device resolution. */
window.TrajectoryCanvas = class {
  constructor(host, scene, enabled = true) {
    host.replaceChildren();
    this.scene = scene;
    this.d = scene.series;
    this.total = this.d.t[this.d.t.length - 1];
    this.time = 0;
    this.enabled = enabled;
    this.visible = false;
    this.rate = 1;
    this.last = 0;
    this.destroyed = false;
    this.root = document.createElement('div'); this.root.className = 'trajectory-view';
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', `${scene.title}：左侧真值、本方法和位置辅助轨迹，右侧三组 vx、vy、yaw 动态对比`);
    this.canvas.className = 'trajectory-canvas';
    this.controls = document.createElement('div'); this.controls.className = 'trajectory-controls';
    this.controls.innerHTML = '<button type="button" class="chart-play" aria-label="暂停轨迹动画">暂停</button><span class="chart-time"></span><input type="range" min="0" max="1000" step="1" value="0" aria-label="轨迹播放进度"><button type="button" class="chart-speed" aria-label="切换轨迹播放速度">1×</button><button type="button" class="chart-fullscreen" aria-label="放大轨迹画布">放大</button>';
    this.root.append(this.canvas, this.controls); host.append(this.root);
    this.playButton = this.controls.querySelector('.chart-play');
    this.slider = this.controls.querySelector('input');
    this.timeText = this.controls.querySelector('.chart-time');
    this.playButton.onclick = () => {
      this.setEnabled(!this.enabled);
      document.querySelector('#gallery-animation').checked = this.enabled;
    };
    this.slider.oninput = () => { this.time = Number(this.slider.value) / 1000 * this.total; this.draw(); };
    const rates = [1, .5, 2]; let index = 0;
    this.controls.querySelector('.chart-speed').onclick = e => { index = (index+1)%rates.length; this.rate = rates[index]; e.currentTarget.textContent = this.rate+'×'; };
    this.controls.querySelector('.chart-fullscreen').onclick = async () => {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if(this.root.requestFullscreen) await this.root.requestFullscreen();
    };
    this.prepare();
    this.resize = new ResizeObserver(() => this.draw()); this.resize.observe(this.canvas);
    this.observer = new IntersectionObserver(entries => {
      this.visible = entries[0].isIntersecting; this.last = 0;
    }, {threshold:.15});
    this.observer.observe(this.root);
    this.setEnabled(enabled);
    this.tick = this.tick.bind(this); this.raf = requestAnimationFrame(this.tick);
    document.fonts.ready.then(() => { if(!this.destroyed) this.draw(); });
  }
  prepare() {
    const all = this.d.gt.concat(this.d.pred,this.d.aux);
    this.bounds = [Math.min(...all.map(p=>p[0])), Math.max(...all.map(p=>p[0])), Math.min(...all.map(p=>p[1])), Math.max(...all.map(p=>p[1]))];
    this.ranges = ['vx','vy','yaw'].map(k => {
      const values = this.d[k+'gt'].concat(this.d[k+'pred'],this.d[k+'aux']).filter(Number.isFinite);
      let low = Math.min(...values), high = Math.max(...values);
      if(!values.length) { low=-1;high=1; }
      const pad = Math.max((high-low)*.14, k==='yaw'?5:.2);
      return [low-pad,high+pad];
    });
  }
  setEnabled(value) { this.enabled = value; this.last = 0; this.playButton.textContent = value?'暂停':'播放'; this.playButton.setAttribute('aria-label', value?'暂停轨迹动画':'播放轨迹动画'); }
  tick(now) {
    if(this.destroyed) return;
    if(this.enabled && this.visible && !document.hidden) {
      if(this.last) this.time = (this.time + Math.min((now-this.last)/1000,.1) * this.total/30 * this.rate) % this.total;
      this.draw();
    }
    this.last = now; this.raf = requestAnimationFrame(this.tick);
  }
  draw() {
    const box = this.canvas.getBoundingClientRect(); if(!box.width) return;
    const width = 1440, height = 850;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const portrait = box.width < 590;
    const displayWidth=portrait?720:width, displayHeight=portrait?1590:height;
    const outW=Math.round(box.width*ratio),outH=Math.round(outW/displayWidth*displayHeight);
    if(this.canvas.width!==outW || this.canvas.height!==outH){this.canvas.width=outW;this.canvas.height=outH;}
    if(!this.surface)this.surface=document.createElement('canvas');
    const surface=portrait?this.surface:this.canvas;
    const w=Math.round(outW*width/displayWidth),h=Math.round(w*height/width);
    if(surface.width!==w||surface.height!==h){surface.width=w;surface.height=h;}
    const ctx=surface.getContext('2d');ctx.setTransform(w/width,0,0,h/height,0,0);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
    const text=(s,x,y,size=17,color='#45566b',align='left',weight=400)=>{
      ctx.font=`${weight} ${size}px Showcase, "Microsoft YaHei", sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(s,x,y);
    };
    const line=(a,b,color,width=1,dash=[])=>{ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();ctx.setLineDash([]);};
    text('轨迹与运动分量',45,49,23,'#203449','left',600);
    const clock=t=>`${Math.floor(t/60).toString().padStart(2,'0')}:${Math.floor(t%60).toString().padStart(2,'0')}`;
    text(`${clock(this.time)} / ${clock(this.total)}`,1388,49,23,'#253b50','right');
    text(`${(this.total/30*this.rate).toFixed(1)} 倍速回放`,1388,77,15,'#78899b','right');
    const styles=[
      {id:'gt',label:'真值',color:'#697a88',pale:'#dce2e7',dash:[9,6]},
      {id:'pred',label:'本方法（未加入GNSS观测）',color:'#0087c2',pale:'#d3eaf4',dash:[]},
      {id:'aux',label:'本方法（'+this.scene.auxLabel+'）',color:'#ea586f',pale:'#f7dfe3',dash:[]}
    ];
    styles.forEach((style,i)=>{
      const x=[234,446,829][i];
      line([x,99],[x+43,99],style.color,3,style.dash);text(style.label,x+54,105,19,'#324658');
    });
    text('平面轨迹',336,159,20,'#263c52','center',500);
    text('速度与行进航向',1060,159,20,'#263c52','center',500);
    const rect=[91,195,638,735];
    const [xmin,xmax,ymin,ymax]=this.bounds;
    const spanX=Math.max(xmax-xmin,1),spanY=Math.max(ymax-ymin,1);
    const scale=Math.min((rect[2]-rect[0])/(spanX*1.2),(rect[3]-rect[1])/(spanY*1.2));
    const cx=(xmin+xmax)/2,cy=(ymin+ymax)/2;
    const point=p=>[(rect[0]+rect[2])/2+(p[0]-cx)*scale,(rect[1]+rect[3])/2-(p[1]-cy)*scale];
    const nice=(lo,hi,count=5)=>{
      const raw=(hi-lo)/count;const exp=10**Math.floor(Math.log10(Math.max(raw,1e-9)));
      const f=raw/exp;const step=(f>5?10:f>2?5:f>1?2:1)*exp;
      const out=[];for(let x=Math.ceil(lo/step)*step;x<=hi+step*.001;x+=step)out.push(Math.abs(x)<step*.001?0:x);return out;
    };
    const leftX=cx-(rect[2]-rect[0])/2/scale,rightX=cx+(rect[2]-rect[0])/2/scale;
    const lowY=cy-(rect[3]-rect[1])/2/scale,highY=cy+(rect[3]-rect[1])/2/scale;
    nice(leftX,rightX).forEach(v=>{const x=point([v,cy])[0];line([x,rect[1]],[x,rect[3]],'#e5ebf0');text(Number(v.toFixed(1)),x,rect[3]+29,15,'#748497','center');});
    nice(lowY,highY).forEach(v=>{const y=point([cx,v])[1];line([rect[0],y],[rect[2],y],'#e5ebf0');text(Number(v.toFixed(1)),rect[0]-14,y+5,15,'#748497','right');});
    line([rect[0],rect[3]],[rect[2],rect[3]],'#a4b2bf');line([rect[0],rect[1]],[rect[0],rect[3]],'#a4b2bf');
    text(this.scene.location==='室内'?'局部 X（米）':'东向位置（米）',365,803,17,'#34475b','center');
    ctx.save();ctx.translate(32,470);ctx.rotate(-Math.PI/2);text(this.scene.location==='室内'?'局部 Y（米）':'北向位置（米）',0,0,17,'#34475b','center');ctx.restore();
    const t=this.d.t;
    const path=(points,to,color,thickness=2,dash=[],limit=Infinity)=>{
      ctx.save();ctx.beginPath();ctx.rect(...[to[0],to[1],to[2]-to[0],to[3]-to[1]]);ctx.clip();
      ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=thickness;ctx.setLineDash(dash);
      let active=false;let lastIndex=-1;
      for(let i=0;i<t.length&&t[i]<=limit;i++){
        const p=points(i);if(!p||!p.every(Number.isFinite)){active=false;continue;}
        if(i&&t[i]-t[i-1]>this.d.gapThresholdS)active=false;
        if(!active)ctx.moveTo(...p);else ctx.lineTo(...p);active=true;lastIndex=i;
      }
      if(active&&lastIndex>=0&&lastIndex<t.length-1&&Number.isFinite(limit)&&t[lastIndex+1]-t[lastIndex]<=this.d.gapThresholdS){
        const a=points(lastIndex),b=points(lastIndex+1);
        if(a&&b&&a.every(Number.isFinite)&&b.every(Number.isFinite)){
          const f=(limit-t[lastIndex])/(t[lastIndex+1]-t[lastIndex]);ctx.lineTo(a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f);
        }
      }
      ctx.stroke();ctx.restore();
    };
    const next=t.findIndex(v=>v>this.time);const at=next<0?t.length-1:Math.max(0,next-1);
    styles.forEach(st=>{
      const pts=i=>point(this.d[st.id][i]);
      path(pts,rect,st.pale,2,st.dash);
    });
    styles.forEach(st=>{
      const pts=i=>point(this.d[st.id][i]);path(pts,rect,st.color,2.9,st.dash,this.time);
      const a=pts(at),b=pts(Math.min(at+1,t.length-1)),dt=t[Math.min(at+1,t.length-1)]-t[at];
      const f=dt&&dt<=this.d.gapThresholdS?(this.time-t[at])/dt:0;
      ctx.beginPath();ctx.fillStyle=st.color;ctx.arc(a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,5,0,Math.PI*2);
      ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();
    });
    const rows=[['vx','vx（米/秒）'],['vy','vy（米/秒）'],['yaw','yaw（度）']];
    rows.forEach(([key,label],index)=>{
      const b=[800,192+index*192,1387,343+index*192],range=this.ranges[index];
      const chart=(val,i)=>val[i]===null?null:[b[0]+t[i]/this.total*(b[2]-b[0]),b[3]-(val[i]-range[0])/(range[1]-range[0])*(b[3]-b[1])];
      nice(range[0],range[1],5).forEach(v=>{const y=b[3]-(v-range[0])/(range[1]-range[0])*(b[3]-b[1]);line([b[0],y],[b[2],y],'#e5ebf0');text(Number(v.toFixed(key==='yaw'?0:1)),b[0]-13,y+5,15,'#748497','right');});
      [0,.25,.5,.75,1].forEach(f=>{const x=b[0]+f*(b[2]-b[0]);line([x,b[1]],[x,b[3]],'#edf0f4');if(index===2)text(Math.round(this.total*f),x,b[3]+26,15,'#748497','center');});
      line([b[0],b[3]],[b[2],b[3]],'#a4b2bf');
      ctx.save();ctx.translate(735,(b[1]+b[3])/2);ctx.rotate(-Math.PI/2);text(label,0,0,17,'#34475b','center');ctx.restore();
      for(const past of [false,true]) for(const st of styles){
        const samples=this.d[key+st.id];path(i=>chart(samples,i),b,past?st.color:st.pale,past?2.5:1.6,st.dash,past?this.time:Infinity);
      }
      const x=b[0]+this.time/this.total*(b[2]-b[0]);line([x,b[1]],[x,b[3]],'#93a4b5',1);
    });
    text('时间（秒）',1095,804,17,'#34475b','center');
    if(portrait){
      const screen=this.canvas.getContext('2d');screen.setTransform(outW/displayWidth,0,0,outH/displayHeight,0,0);
      screen.fillStyle='#fff';screen.fillRect(0,0,displayWidth,displayHeight);
      screen.textBaseline='middle';screen.font='22px Showcase, sans-serif';screen.textAlign='left';
      styles.forEach((st,i)=>{
        const x=i===0?30:218,y=i===2?73:35;
        screen.strokeStyle=st.color;screen.lineWidth=4;screen.setLineDash(st.dash);screen.beginPath();screen.moveTo(x,y);screen.lineTo(x+40,y);screen.stroke();screen.setLineDash([]);
        screen.fillStyle='#324658';screen.fillText(st.label,x+48,y);
      });
      const copy=(left,top,sw,sh,x,y,dw,dh)=>screen.drawImage(surface,left*w/width,top*h/height,sw*w/width,sh*h/height,x,y,dw,dh);
      copy(0,130,690,700,0,110,720,730);
      copy(706,130,730,700,0,852,720,710);
    }
    this.timeText.textContent=`${clock(this.time)} / ${clock(this.total)}`;
    this.slider.value=Math.round(this.time/this.total*1000);
    this.slider.setAttribute('aria-valuetext',clock(this.time));
  }
  destroy() { this.destroyed=true;cancelAnimationFrame(this.raf);this.resize.disconnect();this.observer.disconnect();this.root.remove(); }
};
