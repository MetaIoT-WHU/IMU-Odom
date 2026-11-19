(() => {
  'use strict';
  // Reuse the same north-up Web Mercator extent as the exported route pixels.
  const tileURL = (x,y,z,server) => 'https://t'+server+'.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX='+z+'&TILEROW='+y+'&TILECOL='+x+'&tk=89bcebef20b3304b0bcbd3b556e4bb50';
  const imagery = new Map();
  const world = 2 * Math.PI * 6378137;
  async function onlineBackdrop(layer, zoom) {
    const [west,south,east,north] = layer.bounds3857;
    const ppm = 256 * 2 ** zoom / world;
    const left = (west + world/2)*ppm, top = (world/2 - north)*ppm;
    const width = (east-west)*ppm, height = (north-south)*ppm;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width); canvas.height = Math.ceil(height);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),12000);
    async function tile(x,y) {
      const response = await fetch(tileURL(x,y,zoom,(x+y)%8),{signal:controller.signal});
      if (!response.ok) throw Error('天地图影像暂不可用');
      const bitmap = await createImageBitmap(await response.blob());
      try {
        if (bitmap.width!==256 || bitmap.height!==256) throw Error('影像瓦片无效');
        ctx.drawImage(bitmap,x*256-left,y*256-top);
      } finally { bitmap.close(); }
    }
    try {
      const requests = [];
      for (let y=Math.floor(top/256);y<Math.ceil((top+height)/256);y++) {
        for (let x=Math.floor(left/256);x<Math.ceil((left+width)/256);x++) requests.push(tile(x,y));
      }
      await Promise.all(requests);
      const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if (!blob) throw Error('影像合成失败');
      return URL.createObjectURL(blob);
    } finally { clearTimeout(timeout); controller.abort(); }
  }
  function backdrop(layer, image) {
    const [west,south,east,north] = layer.bounds3857;
    const ratio = Math.min(window.devicePixelRatio || 1,2);
    const target = Math.min(1800,Math.max(768,image.clientWidth*ratio));
    const zoom = Math.min(18,Math.max(1,Math.round(Math.log2(target*world/(256*(east-west))))));
    const key = layer.src+'@'+zoom;
    if (!imagery.has(key)) {
      const task = onlineBackdrop(layer,zoom).catch(error=>{imagery.delete(key);throw error;});
      imagery.set(key,task);
    }
    return imagery.get(key);
  }
  window.showcaseMapReady = async function(image,layer) {
    let src=layer.src, provider='离线底图';
    if (/^https?:$/.test(location.protocol) && navigator.onLine && layer.bounds3857) {
      try {src=await backdrop(layer,image); provider='影像 © 天地图';}
      catch {provider='备用底图';}
    }
    if (!image.isConnected) return;
    image.dataset.online=String(src!==layer.src);
    image.src=src;
    await image.decode();
    if (!image.isConnected) return;
    const credit=document.createElement('span');
    credit.className='map-credit';credit.textContent=provider;
    image.parentNode.append(credit);
    await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
  };
  window.ReplayMap = class {
    constructor(host,image,layer,route) {
      const container=document.createElement('div');
      container.className='replay-map';
      container.setAttribute('role','region');
      container.setAttribute('aria-label','轨迹地图，可拖动和缩放');
      host.prepend(container);
      const [west,south,east,north]=layer.bounds3857;
      const crs=L.CRS.EPSG3857;
      this.bounds=L.latLngBounds(crs.unproject(L.point(west,south)),crs.unproject(L.point(east,north)));
      const online=image.dataset.online==='true';
      const map=this.map=L.map(container,{
        zoomControl:false,attributionControl:false,zoomAnimation:false,fadeAnimation:false,
        zoomSnap:0,minZoom:2,maxZoom:22,trackResize:false,
        maxBounds:online?undefined:this.bounds.pad(.2),maxBoundsViscosity:1
      });
      this.reset=()=>map.fitBounds(this.bounds,{animate:false});
      this.reset();
      const homeZoom=map.getZoom();
      if (!online) map.setMinZoom(Math.floor(homeZoom)-1);
      // Keep a decoded image beneath the live tiles while changing zoom levels.
      map.createPane('backdrop').style.zIndex=190;
      image.style.objectFit='fill';
      L.imageOverlay(image,this.bounds,{pane:'backdrop',alt:'卫星底图'}).addTo(map);
      if (online) L.tileLayer(tileURL('{x}','{y}','{z}','{s}'),{
        subdomains:'01234567',minZoom:2,maxZoom:22,maxNativeZoom:18,keepBuffer:1
      }).addTo(map);
      if (route) {
        route.setAttribute('preserveAspectRatio','none');
        route.classList.add('map-route');
        L.svgOverlay(route,this.bounds).addTo(map);
        const sizeMarkers=()=>route.style.setProperty('--marker-scale',2**(homeZoom-map.getZoom()));
        map.on('zoom',sizeMarkers);sizeMarkers();
      }
      L.control.zoom({position:'topright',zoomInTitle:'放大地图',zoomOutTitle:'缩小地图'}).addTo(map);
      const control=new L.Control({position:'topright'});
      control.onAdd=()=>{
        const button=L.DomUtil.create('button','map-home');
        button.type='button';button.textContent='全程';button.title='恢复全程视图';
        L.DomEvent.disableClickPropagation(button);
        button.addEventListener('click',this.reset);
        return button;
      };
      control.addTo(map);
      L.control.scale({imperial:false,maxWidth:68}).addTo(map);
      this.resize=new ResizeObserver(()=>map.invalidateSize({pan:false,animate:false}));
      this.resize.observe(container);
    }
    // Screen pixels bounding the same georeferenced rectangle as the SVG layer.
    screenRect() {
      const a=this.map.latLngToContainerPoint(this.bounds.getNorthWest());
      const b=this.map.latLngToContainerPoint(this.bounds.getSouthEast());
      return {left:a.x,top:a.y,width:b.x-a.x,height:b.y-a.y};
    }
    destroy() {
      this.resize.disconnect();
      const container=this.map.getContainer();
      this.map.remove();container.remove();
    }
  };
})();
