var map,marker,models,live,sel=null;
var COVER={n:25.5,s:25.09,e:83.17,w:82.73};
var DARK=[{elementType:'geometry',stylers:[{color:'#0d0d0d'}]},{elementType:'labels.text.stroke',stylers:[{color:'#0d0d0d'}]},{elementType:'labels.text.fill',stylers:[{color:'#7a7a7a'}]},{featureType:'road',elementType:'geometry',stylers:[{color:'#222222'}]},{featureType:'road',elementType:'labels.icon',stylers:[{visibility:'off'}]},{featureType:'water',elementType:'geometry',stylers:[{color:'#040404'}]},{featureType:'poi',stylers:[{visibility:'off'}]},{featureType:'transit',stylers:[{visibility:'off'}]},{featureType:'administrative',elementType:'geometry.stroke',stylers:[{color:'#2a2a2a'}]}];
function $(id){return document.getElementById(id)}
function ist(ms){return new Date(ms).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false})}
function compass(d){return ['N','NE','E','SE','S','SW','W','NW'][Math.round(d/45)%8]}
function wind(w,d){return Math.round(w*3.6)+' km/h '+compass(d)}
function tick(){$('clock').innerText=ist(Date.now())+' IST'}
function foot(){
  if(!live||!live.stations||!live.stations.length){$('foot').innerText='Waiting for IMD observations.';return}
  var ms=Math.max.apply(null,live.stations.map(function(s){return Date.parse(s.obs_time)}));
  $('foot').innerText='Observations: India Meteorological Department, '+ist(ms)+' IST'+(live.demo?' (demo data)':'')+'. Forecast: ML ensemble trained on ERA5 reanalysis. Not an official forecast.';
}
async function refresh(){
  try{live=await (await fetch('live.json?t='+Date.now(),{cache:'no-store'})).json()}catch(e){live=null}
  foot();
  if(sel)show();
}
async function start(){
  try{models=await (await fetch('models.json')).json()}catch(e){$('idle').innerText='Could not load the model.';return}
  await refresh();
  setInterval(refresh,300000);
  setInterval(function(){if(sel)show()},60000);
}
function inside(a,b){return a<=COVER.n&&a>=COVER.s&&b<=COVER.e&&b>=COVER.w}
function select(a,b){
  sel={lat:a,lng:b};
  $('idle').hidden=true;$('out').hidden=false;
  $('place').innerText=a.toFixed(4)+'\u00B0 N  '+b.toFixed(4)+'\u00B0 E';
  if(marker)marker.setPosition({lat:a,lng:b}),marker.setMap(map);
  show();
}
function show(){
  var a=sel.lat,b=sel.lng,cells=['t0','t1','h0','h1','w0','w1'];
  if(!inside(a,b)){text('Outside the covered area','The model only covers the Varanasi region');cells.forEach(function(c){$(c).innerText=''});$('pct').innerText='';$('fill').style.width='0';return}
  if(!live||!models){text('Waiting for data','');return}
  var r=Nowcast.forecast(models,live,a,b,Date.now());
  text(r.headline,r.detail||'');
  $('t0').innerText=r.cur?r.cur.temp.toFixed(1)+'\u00B0C':'';
  $('h0').innerText=r.cur?Math.round(r.cur.rh)+'%':'';
  $('w0').innerText=r.cur?wind(r.cur.wind,r.cur.dir):'';
  var o=r.outlook;
  $('hz').innerText=o?'In '+r.horizon+' min':'Later';
  $('t1').innerText=o?o.temp.toFixed(1)+'\u00B0C':'';
  $('h1').innerText=o?Math.round(o.rh)+'%':'';
  $('w1').innerText=o?wind(o.wind,o.dir):'';
  var p=r.prob;
  $('pct').innerText=p==null?'':Math.round(p*100)+'%';
  $('fill').style.width=p==null?'0':Math.round(p*100)+'%';
}
function text(h,d){$('headline').innerText=h;$('detail').innerText=d}
function initMap(){
  map=new google.maps.Map($('map'),{center:{lat:25.3176,lng:82.9739},zoom:11,disableDefaultUI:true,zoomControl:true,clickableIcons:false,gestureHandling:'greedy',backgroundColor:'#000000',styles:DARK});
  new google.maps.Rectangle({map:map,bounds:{north:COVER.n,south:COVER.s,east:COVER.e,west:COVER.w},strokeColor:'#4a4a4a',strokeWeight:1,fillOpacity:0,clickable:false});
  marker=new google.maps.Marker({icon:{path:google.maps.SymbolPath.CIRCLE,scale:6,fillColor:'#ffffff',fillOpacity:1,strokeColor:'#000000',strokeWeight:2}});
  map.addListener('click',function(e){select(e.latLng.lat(),e.latLng.lng())});
}
tick();setInterval(tick,30000);
start();
