/* An immutable satellite photograph under each device-resolution trajectory canvas. */
(() => {
  'use strict';
  const cache = new Map();
  function loadRoute(clip) {
    if (!cache.has(clip.payload)) {
      const promise = new Promise((resolve,reject) => {
        const script = document.createElement('script');
        script.src = clip.payload;
        script.onload = () => {
          script.remove();
          try {
            const data = window.gnssPaths[clip.route];
            const stages = data.stages.map(encoded => {
              const bytes = atob(encoded);
              const result = new Float64Array(bytes.length/2);
              for (let i=0;i<result.length;i++) result[i]=(bytes.charCodeAt(2*i)+256*bytes.charCodeAt(2*i+1))/65535;
              return result;
            });
            resolve({stages,fixes:data.fixes});
          } catch (err) { reject(err); }
        };
        script.onerror = () => {script.remove();reject(Error('轨迹数据加载失败'));};
        document.head.append(script);
      });
      cache.set(clip.payload,promise);
      promise.catch(()=>cache.delete(clip.payload));
    }
    return cache.get(clip.payload);
  }

  function upperBound(sorted, value) {
    let lo=0, hi=sorted.length;
    while (lo<hi) {
      const mid=Math.floor((lo+hi)/2);
      if (sorted[mid]<=value) lo=mid+1;
      else hi=mid;
    }
    return lo;
  }
  const clock = s => Math.floor(s/60).toString().padStart(2,'0')+':'+Math.floor(s%60).toString().padStart(2,'0');

  // Append completed samples only once. Rebuild for a backward seek or while
  // blending consecutive estimates at an observation, when the prefix changes.
  class Trail {
    draw(ctx,points,previous,mix,last,f,w,h,color,width) {
      const point = i => {
        const x=points[2*i], y=points[2*i+1];
        if (!previous) return [w*x,h*y];
        return [w*(previous[2*i]+mix*(x-previous[2*i])),h*(previous[2*i+1]+mix*(y-previous[2*i+1]))];
      };
      if (this.points!==points || previous || this.wasBlending || this.end>last || this.w!==w || this.h!==h) {
        this.points=points;this.end=0;this.path=new Path2D();this.path.moveTo(...point(0));this.w=w;this.h=h;
      }
      this.wasBlending=!!previous;
      while (this.end<last) this.path.lineTo(...point(++this.end));
      const segment=new Path2D(this.path);
      let [x,y]=point(last);
      if (f>0) {
        const [nx,ny]=point(last+1);x+=f*(nx-x);y+=f*(ny-y);segment.lineTo(x,y);
      }
      ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=width+1.5;ctx.strokeStyle='#253342';ctx.stroke(segment);
      ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke(segment);
      ctx.beginPath();ctx.arc(x,y,width+.9,0,2*Math.PI);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=1;ctx.strokeStyle='#fff';ctx.stroke();
    }
  }

  window.SparseReplay = class {
    constructor(root) {
      this.root=root;
      const get = cls => root.querySelector('.sparse-'+cls);
      this.status=get('status');this.seek=get('seek');this.play=get('play');this.speed=get('speed');
      this.clock=get('clock');this.count=get('count');this.expand=get('expand');this.key=get('key');
      this.views=[...root.querySelectorAll('.sparse-map')].map(map => {
        const canvas=map.querySelector('canvas');
        return {map,image:map.querySelector('img'),canvas,ctx:canvas.getContext('2d'),ref:new Trail(),estimate:new Trail()};
      });
      this.rate=2;this.speed.textContent=this.rate+'×';this.running=true;this.visible=false;this.frame=0;this.token=0;
      this.tick=this.tick.bind(this);
      this.play.onclick=()=>{this.running=!this.running;this.updatePlayback();};
      this.speed.onclick=()=>{
        const rates=[1,2,4,.5];this.rate=rates[(rates.indexOf(this.rate)+1)%rates.length];
        this.speed.textContent=this.rate+'×';
      };
      this.seek.oninput=()=>{this.elapsed=this.duration*this.seek.value/1000;this.lastTick=null;this.draw();};
      this.expand.onclick=async()=>{
        if (document.fullscreenElement===root) await document.exitFullscreen();
        else if (root.classList.contains('expanded')) this.fold();
        else {
          try {await root.requestFullscreen();}
          catch {root.classList.add('expanded');this.expand.textContent='收起';this.expand.setAttribute('aria-label','退出放大');}
        }
      };
      this.fold=()=>{root.classList.remove('expanded');this.expand.textContent='放大';this.expand.setAttribute('aria-label','放大纠偏回放');};
      document.addEventListener('fullscreenchange',()=>{
        const full=document.fullscreenElement===root;
        this.expand.textContent=full?'收起':'放大';this.expand.setAttribute('aria-label',full?'退出放大':'放大纠偏回放');
      });
      document.addEventListener('keydown',e=>{if (e.key==='Escape' && root.classList.contains('expanded')) this.fold();});
      new ResizeObserver(()=>this.draw()).observe(this.views[0].map);
      new IntersectionObserver(([entry])=>{
        this.visible=entry.isIntersecting;
        if (this.visible && this.clip && !this.data && !this.loading) this.load();
        this.updatePlayback();
      }).observe(root);
      document.addEventListener('visibilitychange',()=>this.updatePlayback());
    }
    select(clip,scene) {
      ++this.token;
      this.clip=clip;this.scene=scene;this.loading=false;this.data=null;
      this.elapsed=0;this.running=true;this.seek.value=0;this.seek.disabled=true;
      this.duration=clip.travel+clip.count*clip.hold+2;
      this.total=scene.series.t.at(-1);
      this.clock.textContent='00:00 / '+clock(this.total);
      this.count.textContent='观测 0 / '+clip.count;
      this.key.replaceChildren();
      for (const entry of [...scene.legend,{id:'fix',label:'GNSS 观测点',color:'#29303b'}]) {
        const label=document.createElement('span'), swatch=document.createElement('i');
        swatch.style.setProperty('--stroke',entry.color);
        if(entry.id==='fix')swatch.className='fix-key';
        label.append(swatch,entry.label);this.key.append(label);
      }
      for (const {map,image,canvas} of this.views) {
        image.removeAttribute('src');map.style.aspectRatio=scene.mapLayer.nativeSize.join('/');
        canvas.width=canvas.width;
      }
      this.status.hidden=true;
      if(this.visible) this.load();
      this.updatePlayback();
    }
    async load() {
      const token=this.token, clip=this.clip, map=this.scene.mapLayer;
      this.loading=true;this.status.hidden=false;this.status.textContent='正在加载轨迹…';
      try {
        const imageTasks=this.views.map(({image})=>{image.src=map.src;return image.decode();});
        const [data]=await Promise.all([loadRoute(clip),...imageTasks]);
        if(token!==this.token)return;
        this.data=data;this.seek.disabled=false;
        this.ref=Float64Array.from(map.coords.gt.flat());this.raw=Float64Array.from(map.coords.pred.flat());
        this.arrivals=data.fixes.map(([t],i)=>t/this.total*clip.travel+i*clip.hold);
        this.status.hidden=true;this.draw();this.updatePlayback();
      } catch {
        if(token===this.token)this.status.textContent='无法加载地图或轨迹，请点击路线名称重试。';
      } finally {if(token===this.token)this.loading=false;}
    }
    updatePlayback() {
      this.play.textContent=this.running?'暂停':'播放';
      cancelAnimationFrame(this.frame);this.lastTick=null;
      if(this.data && this.visible && this.running && !document.hidden)this.frame=requestAnimationFrame(this.tick);
    }
    tick(now) {
      if(this.lastTick!==null)this.elapsed=(this.elapsed+(now-this.lastTick)*this.rate/1000)%this.duration;
      this.lastTick=now;this.draw();this.frame=requestAnimationFrame(this.tick);
    }
    draw() {
      if(!this.data) return;
      const {clip,data}=this, count=upperBound(this.arrivals,this.elapsed);
      const blend=count>0 && this.elapsed<this.arrivals[count-1]+clip.hold;
      const source=blend?data.fixes[count-1][0]:Math.max(0,Math.min(1,(this.elapsed-count*clip.hold)/clip.travel))*this.total;
      const phase=blend?(this.elapsed-this.arrivals[count-1])/clip.hold:1, mix=phase*phase*(3-2*phase);
      const times=this.scene.series.t, last=upperBound(times,source)-1;
      const f=last+1<times.length?(source-times[last])/(times[last+1]-times[last]):0;
      const [gt,pred,aux]=this.scene.legend;
      const old=count===1?this.raw:data.stages[count-2];
      const ratio=window.devicePixelRatio||1;
      this.views.forEach(({map,canvas,ctx,ref,estimate},side)=>{
        const w=map.clientWidth,h=map.clientHeight;
        if(!w||!h)return;
        const pw=Math.round(w*ratio),ph=Math.round(h*ratio);
        if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
        ctx.setTransform(pw/w,0,0,ph/h,0,0);ctx.clearRect(0,0,w,h);
        ref.draw(ctx,this.ref,null,1,last,f,w,h,gt.color,3.8);
        const assisted=side===1 && count>0;
        estimate.draw(ctx,assisted?data.stages[count-1]:this.raw,assisted&&blend?old:null,mix,last,f,w,h,assisted?aux.color:pred.color,2.5);
        if(side===1)for(let i=0;i<count;i++){
          const x=w*data.fixes[i][1],y=h*data.fixes[i][2];
          ctx.beginPath();ctx.arc(x,y,3.4,0,2*Math.PI);ctx.fillStyle='#29303b';ctx.fill();ctx.lineWidth=1.4;ctx.strokeStyle='#fff';ctx.stroke();
          if(blend && i===count-1){
            ctx.beginPath();ctx.arc(x,y,6+9*phase,0,2*Math.PI);ctx.strokeStyle=aux.color;ctx.lineWidth=2;ctx.stroke();
          }
        }
      });
      this.seek.value=Math.round(1000*this.elapsed/this.duration);
      this.seek.setAttribute('aria-valuetext',clock(source));
      this.clock.textContent=clock(source)+' / '+clock(this.total);
      this.count.textContent='观测 '+count+' / '+clip.count;
    }
  };
})();
