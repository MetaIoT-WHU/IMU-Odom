/* Spatial paths and motion share the acquisition clock, including gaps in the record. */
(() => {
  'use strict';
  const pending = new Map();
  let serial = 0;
  function load(item) {
    if (item.series) return Promise.resolve(item.series);
    if (!pending.has(item.payload)) {
      pending.set(item.payload, new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = item.payload;
        script.onload = () => {
          script.remove();
          const data = window.imuTraces?.[item.id];
          if (data) resolve(data);
          else { pending.delete(item.payload); reject(Error('轨迹数据不完整')); }
        };
        script.onerror = () => { script.remove(); pending.delete(item.payload); reject(Error('轨迹数据加载失败')); };
        document.head.append(script);
      }));
    }
    return pending.get(item.payload);
  }
  // Decode the displayed element, then give the browser a paint between the
  // image becoming visible and inserting the first overlay or advancing time.
  window.showcaseMapReady = async function(image,src) {
    image.src=src;
    await image.decode();
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
  };
  function svg(tag, parent, attrs = {}, text) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key,value);
    if (text !== undefined) node.textContent = text;
    parent.append(node);
    return node;
  }
  const grid = '#e2eaf0', ink = '#64788a';
  const line = (g,x1,y1,x2,y2,stroke=grid) => svg('line',g,{x1,y1,x2,y2,stroke});
  const label = (g,x,y,value,align='start') => svg('text',g,{x,y,fill:ink,'font-size':14,'text-anchor':align},value);
  const clock = t => Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
  const xy = p => p && Number.isFinite(p[0]) && Number.isFinite(p[1]);
  const coord = p => p[0].toFixed(2)+' '+p[1].toFixed(2);
  function upper(times,value) {
    let lo=0,hi=times.length;
    while(lo<hi){const m=Math.floor((lo+hi)/2);if(times[m]<=value)lo=m+1;else hi=m;}
    return Math.max(0,lo-1);
  }
  function commands(points,t,gap) {
    return points.map((p,i)=>xy(p)?((i && xy(points[i-1]) && t[i]>t[i-1] && t[i]-t[i-1]<=gap)?'L':'M')+coord(p):'');
  }
  function limits(columns) {
    let low=Infinity,high=-Infinity;
    for(const values of columns) for(const v of values) if(Number.isFinite(v)){low=Math.min(low,v);high=Math.max(high,v);}
    return low===Infinity?[-1,1]:[low,high];
  }
  function drawRoute(group, points, data, style, map) {
    const chunkSize=160, steps=commands(points,data.t,data.gapThresholdS);
    const layer=svg('g',group,{fill:'none',stroke:style.color,'stroke-width':map?3.4:2.8,'stroke-linecap':'round','stroke-linejoin':'round'});
    const chunks=[];
    function part(start,end) {
      const prefix=steps[start]?.startsWith('L')?'M'+coord(points[start-1]):'';
      return prefix+steps.slice(start,end).join('');
    }
    for(let i=0;i<steps.length;i+=chunkSize)
      chunks.push(svg('path',layer,{d:part(i,i+chunkSize),display:'none'}));
    const tail=svg('path',layer), tip=svg('circle',layer,{r:4.7,fill:style.color,stroke:'white','stroke-width':1.6});
    let last=0;
    return (i,frac) => {
      const n=Math.floor(i/chunkSize);
      for(let k=Math.min(n,last);k<Math.max(n,last);k++)chunks[k].setAttribute('display',k<n?'inline':'none');
      last=n;
      const a=points[i],b=points[i+1];
      let head=a;
      if(xy(a)&&xy(b)&&frac>0)head=[a[0]+frac*(b[0]-a[0]),a[1]+frac*(b[1]-a[1])];
      tail.setAttribute('d',part(n*chunkSize,i+1)+(frac>0&&xy(a)&&xy(head)?'L'+coord(head):''));
      tip.setAttribute('visibility',xy(head)?'visible':'hidden');
      if(xy(head)){tip.setAttribute('cx',head[0]);tip.setAttribute('cy',head[1]);}
    };
  }
  function space(view,data,item) {
    const map=item.mapLayer, styles=item.legend;
    const width=640,height=view.viewBox.baseVal.height;
    let project;
    if(map){
      const [w,h]=map.nativeSize, k=Math.min(width/w,height/h);
      const x=(width-k*w)/2,y=(height-k*h)/2;
      project=p=>[x+p[0]*w*k,y+p[1]*h*k];
    }else{
      const left=62,right=617,top=23,bottom=395;
      const bounds=[0,1].map(i=>limits(styles.map(st=>data[st.id].map(p=>p[i]))));
      const k=Math.min((right-left)/Math.max(1,bounds[0][1]-bounds[0][0]),(bottom-top)/Math.max(1,bounds[1][1]-bounds[1][0]))*.9;
      const center=bounds.map(([lo,hi])=>(lo+hi)/2);
      project=p=>[(left+right)/2+(p[0]-center[0])*k,(top+bottom)/2-(p[1]-center[1])*k];
      const rough=(bottom-top)/(5*k), base=10**Math.floor(Math.log10(rough));
      const step=base*[1,2,5,10].find(s=>s*base>=rough);
      for(let axis=0;axis<2;axis++){
        const span=(axis?bottom-top:right-left)/(2*k);
        for(let v=Math.ceil((center[axis]-span)/step)*step;v<=center[axis]+span;v+=step){
          const [x,y]=project([v,v]);
          if(axis){line(view,left,y,right,y);label(view,left-8,y+5,+v.toFixed(2),'end');}
          else{line(view,x,top,x,bottom);label(view,x,bottom+18,+v.toFixed(2),'middle');}
        }
      }
      label(view,(left+right)/2,438,'局部 X（米）','middle');
      label(view,0,0,'局部 Y（米）','middle').setAttribute('transform','translate(17 214) rotate(-90)');
    }
    const coords=data.mapCoords || map?.coords || data;
    const paths=styles.map(st=>drawRoute(view,coords[st.id].map(p=>xy(p)?project(p):null),data,st,!!map));
    return (i,f)=>paths.forEach(draw=>draw(i,f));
  }
  function motion(view,data,item) {
    const left=56,right=416, height=item.camera?300:445;
    const rowHeight=(height-40)/3;
    view.setAttribute('viewBox','0 0 440 '+height);
    const end=data.t.at(-1), keys=['vx','vy',data.speedpred?'speed':'yaw'];
    const cursors=[], clips=[];
    keys.forEach((key,row)=>{
      const top=24+row*rowHeight, floor=(row+1)*rowHeight-9;
      const [low,high]=limits(item.legend.map(s=>data[key+s.id]));
      const pad=Math.max((high-low)*.09,key==='yaw'?2:.1);
      const y=v=>floor-(v-low+pad)/(high-low+2*pad)*(floor-top);
      label(view,left,top-9,key==='speed'?'速率（米/秒）':key+(key==='yaw'?'（度）':'（米/秒）'));
      for(let j=0;j<3;j++){
        const v=low-pad+j*(high-low+2*pad)/2, pos=y(v);
        line(view,left,pos,right,pos);label(view,left-7,pos+4,Number(v.toFixed(key==='yaw'?0:1)),'end');
      }
      for(const f of [0,.25,.5,.75,1]){
        const x=left+f*(right-left);line(view,x,top,x,floor);
        if(row===2)label(view,x,height-28,Math.round(f*end),'middle');
      }
      const id='time-clip-'+(++serial), cut=svg('clipPath',view,{id});
      clips.push(svg('rect',cut,{x:left-2,y:top-1,height:floor-top+2,width:0}));
      const past=svg('g',view,{'clip-path':'url(#'+id+')'});
      for(const st of item.legend){
        const vals=data[key+st.id];
        const pts=vals.map((v,i)=>Number.isFinite(v)?[left+data.t[i]/end*(right-left),y(v)]:null);
        const d=commands(pts,data.t,data.gapThresholdS).join('');
        const ghost=svg('path',view,{d,fill:'none',stroke:st.pale,'stroke-width':1.3});
        view.insertBefore(ghost,past);
        svg('path',past,{d,fill:'none',stroke:st.color,'stroke-width':1.8});
      }
      cursors.push(line(view,left,top,left,floor,'#8297a8'));
    });
    label(view,(left+right)/2,height-3,'时间（秒）','middle');
    return fraction=>{
      const x=left+fraction*(right-left);
      cursors.forEach(c=>{c.setAttribute('x1',x);c.setAttribute('x2',x);});
      clips.forEach(r=>r.setAttribute('width',x-left+2));
    };
  }
  // Project the archived watch orientation from its measured XYZW quaternion.
  function watch(view,poses) {
    const g=svg('g',view,{transform:'translate(12 12)'});
    svg('rect',g,{width:114,height:97,rx:8,fill:'white',opacity:.95});
    label(g,57,18,'手表姿态','middle');
    const face=svg('polygon',g,{fill:'#dbedf4',stroke:'#41647a','stroke-width':2});
    const mark=line(g,0,0,0,0,'#0087c2');mark.setAttribute('stroke-width',3);
    const points=[[-.72,-1],[.72,-1],[.72,1],[-.72,1],[0,0],[0,.78]];
    return f=>{
      const [x,y,z,w]=poses[Math.round(f*(poses.length-1))];
      const p=points.map(([a,b])=>{
        const X=(1-2*y*y-2*z*z)*a+2*(x*y-w*z)*b;
        const Y=2*(x*y+w*z)*a+(1-2*x*x-2*z*z)*b;
        const Z=2*(x*z-w*y)*a+2*(y*z+w*x)*b;
        return [57+24*(X-.48*Y),59+24*(.25*X+.48*Y-Z)];
      });
      face.setAttribute('points',p.slice(0,4).map(coord).join(' '));
      ['x1','y1','x2','y2'].forEach((attr,i)=>mark.setAttribute(attr,p[4+(i>>1)][i%2]));
    };
  }

  window.TrackReplay = class {
    constructor(host,item,legend) {
      this.root=document.createElement('div');this.root.className='track-replay';
      this.root.innerHTML='<div class="track-panels"><figure><figcaption></figcaption><svg viewBox="0 0 640 445" role="img"></svg></figure><figure><figcaption>运动分量</figcaption><svg viewBox="0 0 440 445" role="img" aria-label="速度与时间曲线"></svg></figure></div><div class="track-controls"><button type="button" class="track-play">暂停</button><output></output><input type="range" min="0" max="1000" value="0" aria-label="轨迹播放进度"><button type="button" class="track-rate" aria-label="切换回放速度">1×</button><button type="button" class="track-expand">放大</button></div>';
      host.append(this.root);this.root.prepend(legend);
      const get=s=>this.root.querySelector(s);
      get('figcaption').textContent=item.mapLayer?'卫星地图 · 北向上':'平面轨迹';
      const [route,signals]=this.root.querySelectorAll('svg');
      route.setAttribute('aria-label',item.title+'轨迹');
      const plan=document.createElement('div');
      plan.className='track-plan';
      route.before(plan);plan.append(route);
      const image=item.mapLayer?new Image():null;
      if(image){
        image.alt='卫星底图';image.decoding='async';plan.prepend(image);
      }
      if(item.segments){
        this.root.classList.add('exp-replay');
        const [w,h]=item.mapLayer.nativeSize;
        plan.style.aspectRatio=w+'/'+h;
        route.setAttribute('viewBox','0 0 640 '+640*h/w);
        get('figcaption').textContent='全程卫星图';
      }
      const camera=item.camera?document.createElement('video'):null;
      if(camera){
        camera.className='track-camera';camera.muted=true;camera.defaultMuted=true;
        camera.playsInline=true;camera.loop=true;camera.preload='none';
        camera.setAttribute('aria-label',item.title+'同步实拍');
        camera.width=item.camera.size[0];camera.height=item.camera.size[1];
        const aside=signals.parentNode;
        const holder=document.createElement('div');holder.className='camera-inset';
        const caption=document.createElement('span');caption.textContent='同步实拍';
        holder.append(camera,caption);aside.prepend(holder);
        this.root.classList.add('has-camera');
        this.camera=camera;
      }
      this.play=true;this.rate=1;this.time=0;
      const play=get('.track-play'),seek=get('input'),out=get('output');
      const retry=document.createElement('button');retry.type='button';retry.hidden=true;
      retry.textContent='重新加载';out.after(retry);
      seek.disabled=true;
      const draw=()=>{
        if(!this.data)return;
        const d=this.data,t=d.t,i=upper(t,this.time),dt=t[i+1]-t[i];
        this.space(i,dt>0 && dt<=d.gapThresholdS?(this.time-t[i])/dt:0);
        this.motion(this.time/this.end);this.segmentPanel?.(this.time);this.pose?.(this.time/this.end);
        out.value=clock(this.time)+' / '+clock(this.end);
        seek.value=Math.round(this.time/this.end*1000);seek.setAttribute('aria-valuetext',out.value);
      };
      const cameraSpan=camera?item.duration-1/item.camera.fps:0;
      const cameraAvailable=()=>camera && !camera.error;
      const active=()=>this.data && this.play && this.visible && !document.hidden && !this.closed;
      const tick=now=>{
        this.frame=0;
        if(!active())return;
        if(cameraAvailable()){
          if(!camera.seeking)this.time=Math.min(1,camera.currentTime/cameraSpan)*this.end;
        }else if(this.last){
          const step=Math.min(now-this.last,200)/1000*this.end/item.duration*this.rate;
          if(item.segments && this.time+step>=this.end){
            this.hold=(this.hold||0)+step;
            this.time=this.hold<this.end*3/item.duration?this.end:0;
            if(!this.time)this.hold=0;
          }else this.time=(this.time+step)%this.end;
        }
        this.last=now;draw();this.frame=requestAnimationFrame(tick);
      };
      const schedule=()=>{
        cancelAnimationFrame(this.frame);this.frame=0;this.last=0;
        if(!active()){camera?.pause();return;}
        if(cameraAvailable() && camera.paused)camera.play().catch(err=>{
          if(err.name==='NotAllowedError' && active()){
            this.play=false;play.textContent='播放';schedule();
          }
        });
        this.frame=requestAnimationFrame(tick);
      };
      if(camera){
        camera.onerror=()=>{
          if(this.closed)return;
          camera.parentElement.querySelector('span').textContent='实拍暂不可用';
          schedule();
        };
        camera.onloadedmetadata=()=>{
          if(this.end && this.time)camera.currentTime=this.time/this.end*cameraSpan;
        };
      }
      this.onVisibility=schedule;
      document.addEventListener('visibilitychange',schedule);
      const start=async()=>{
        if(this.started || this.closed)return;
        this.started=true;retry.hidden=true;out.value=image?'底图加载中…':'轨迹加载中…';
        if(camera && !camera.hasAttribute('src'))camera.src=item.camera.src;
        try{
          const [d]=await Promise.all([load(item),image?window.showcaseMapReady(image,item.mapLayer.src):null]);
          if(this.closed)return;
          this.space=space(route,d,item);this.motion=motion(signals,d,item);
          if(item.segments)this.segmentPanel=window.eastlakePanel(this,item,d,route,signals,image,time=>{
            this.time=time;this.last=0;this.hold=0;draw();
          });
          if(d.pose)this.pose=watch(route,d.pose);
          this.data=d;this.end=d.t.at(-1);seek.disabled=false;draw();schedule();
        }catch{
          if(!this.closed){this.started=false;out.value=image?'底图或轨迹加载失败':'轨迹加载失败';retry.hidden=false;}
        }
      };
      retry.onclick=start;
      this.observer=new IntersectionObserver(([entry])=>{
        this.visible=entry.isIntersecting;
        if(this.visible)start();
        schedule();
      });this.observer.observe(this.root);
      play.onclick=()=>{this.play=!this.play;play.textContent=this.play?'暂停':'播放';schedule();};
      seek.oninput=()=>{
        this.time=this.end*Number(seek.value)/1000;this.last=0;this.hold=0;
        if(cameraAvailable() && camera.readyState)camera.currentTime=this.time/this.end*cameraSpan;
        draw();
      };
      get('.track-rate').onclick=e=>{
        this.rate=({1:2,2:4,4:.5,.5:1})[this.rate];
        if(camera)camera.playbackRate=this.rate;
        e.currentTarget.textContent=this.rate+'×';
      };
      const expand=get('.track-expand');
      const expanded=()=>{expand.textContent=document.fullscreenElement===this.root||this.root.classList.contains('expanded')?'收起':'放大';};
      this.onFullscreen=expanded;document.addEventListener('fullscreenchange',expanded);
      expand.onclick=async()=>{
        if(document.fullscreenElement===this.root)await document.exitFullscreen();
        else if(this.root.classList.contains('expanded'))this.root.classList.remove('expanded');
        else{try{await this.root.requestFullscreen();}catch{this.root.classList.add('expanded');}}
        expanded();
      };
    }
    destroy(){
      this.closed=true;
      if(this.camera){this.camera.onerror=null;this.camera.onloadedmetadata=null;this.camera.pause();this.camera.removeAttribute('src');this.camera.load();}
      cancelAnimationFrame(this.frame);this.observer.disconnect();
      document.removeEventListener('visibilitychange',this.onVisibility);
      document.removeEventListener('fullscreenchange',this.onFullscreen);this.root.remove();
    }
  };
})();
