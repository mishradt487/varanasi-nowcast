var Nowcast=(function(){
var RAIN_MM=0.1;
function sig(z){return 1/(1+Math.exp(-z))}
function logit(p){p=Math.min(Math.max(p,1e-4),1-1e-4);return Math.log(p/(1-p))}
function walk(t,x){var n=0;while(t.f[n]>=0){n=x[t.f[n]]<=t.t[n]?t.l[n]:t.r[n]}return t.v[n]}
function gb(m,x){var s=m.base;for(var i=0;i<m.trees.length;i++)s+=walk(m.trees[i],x);return sig(s)}
function rf(trees,x){var s=0;for(var i=0;i<trees.length;i++)s+=walk(trees[i],x);return s/trees.length}
function nn(m,x){
  var z=x.map(function(v,i){return (v-m.mu[i])/m.sd[i]});
  for(var l=0;l<m.W.length;l++){
    var W=m.W[l],b=m.b[l],o=[];
    for(var j=0;j<b.length;j++){
      var s=b[j];
      for(var i=0;i<z.length;i++)s+=z[i]*W[i][j];
      o.push(l<m.W.length-1?Math.max(s,0):s);
    }
    z=o;
  }
  return sig(z[0]);
}
function rainProb(v,x){
  var s=v.stack;
  return sig(s.intercept+s.coef[0]*logit(gb(v.gb,x))+s.coef[1]*logit(rf(v.rf,x))+s.coef[2]*logit(nn(v.nn,x)));
}
function clip(r){return Math.min(Math.max(r,1),100)}
function dewdep(T,rh){var g=Math.log(rh/100)+17.62*T/(243.12+T);return T-243.12*g/(17.62-g)}
function feats(o,names){
  var rh=o.RH.map(clip),W=function(k){return Math.hypot(o.U[k],o.V[k])},d=new Date(o.ms);
  var hour=d.getUTCHours(),doy=Math.floor((o.ms-Date.UTC(d.getUTCFullYear(),0,0))/86400000);
  var f={temp_c:o.T[0],rh:rh[0],dewdep:dewdep(o.T[0],rh[0]),u:o.U[0],v:o.V[0],wspd:W(0),dT3:o.T[0]-o.T[3],dRH3:rh[0]-rh[3],dws1:W(0)-W(1),hour_sin:Math.sin(2*Math.PI*hour/24),hour_cos:Math.cos(2*Math.PI*hour/24),doy_sin:Math.sin(2*Math.PI*doy/365.25),doy_cos:Math.cos(2*Math.PI*doy/365.25)};
  if(o.P){f.dp1=o.P[0]-o.P[1];f.dp3=o.P[0]-o.P[3]}
  if(o.R){f.rain0=o.R[0];f.rain1=o.R[1];f.rain2=o.R[2];f.rain3sum=o.R[0]+o.R[1]+o.R[2]}
  return names.map(function(n){return f[n]});
}
function km(la1,lo1,la2,lo2){var dy=(la2-la1)*111.19,dx=(lo2-lo1)*111.19*Math.cos((la1+la2)/2*Math.PI/180);return Math.hypot(dx,dy)}
function idw(st,lat,lon,get){
  var num=null,den=0,n=0,ms=0;
  st.forEach(function(s){
    var a=get(s);
    if(!a||a.length<4||a.some(function(v){return v==null||isNaN(v)}))return;
    var w=1/Math.pow(Math.max(km(lat,lon,s.lat,s.lon),0.5),2);
    if(!num)num=a.map(function(){return 0});
    for(var i=0;i<a.length;i++)num[i]+=w*a[i];
    den+=w;n++;ms=Math.max(ms,Date.parse(s.obs_time));
  });
  return num?{v:num.map(function(x){return x/den}),n:n,ms:ms}:null;
}
function uv(s,which){
  if(!s.wind_ms||!s.wind_dir)return null;
  return s.wind_ms.map(function(w,i){var r=s.wind_dir[i]*Math.PI/180;return which=='u'?-w*Math.sin(r):-w*Math.cos(r)});
}
function describe(p,rainNow,h){
  var HI=0.5,LO=0.35,m;
  var none={headline:'No rain expected',detail:'Next '+h+' minutes'};
  if(rainNow===null){
    if(p>=HI)return {headline:'Rain likely',detail:'Within the next hour'};
    if(p>=LO)return {headline:'Rain possible',detail:'Within the next hour'};
    return none;
  }
  if(!rainNow){
    if(p>=HI){
      m=Math.max(5,Math.round(60*(1-p)/5)*5);
      return m<=h?{headline:'Rain expected in ~'+m+' min',detail:'Estimate',minutes:m}:none;
    }
    return p>=LO?{headline:'Rain possible',detail:'Within the next hour'}:none;
  }
  if(p>=HI)return {headline:'Raining, likely to continue',detail:'Next '+h+' minutes'};
  m=Math.max(5,Math.round(60*p/5)*5);
  return m<=h?{headline:'Rain likely to stop in ~'+m+' min',detail:'Estimate',minutes:m}:{headline:'Raining, likely to continue',detail:'Next '+h+' minutes'};
}
function forecast(models,live,lat,lon,nowMs){
  var st=live.stations||[];
  var T=idw(st,lat,lon,function(s){return s.temp_c}),RH=idw(st,lat,lon,function(s){return s.rh}),U=idw(st,lat,lon,function(s){return uv(s,'u')}),V=idw(st,lat,lon,function(s){return uv(s,'v')});
  if(!T||!RH||!U||!V)return {ok:false,headline:'No usable IMD data',detail:'Temperature, humidity and wind are needed'};
  var Pp=idw(st,lat,lon,function(s){return s.pres_hpa}),R=idw(st,lat,lon,function(s){return s.rain_mm});
  var cadence=live.cadence_min||60,obsMs=T.ms,age=(nowMs-obsMs)/60000,horizon=Math.min(30,Math.floor(cadence-age));
  var cur={temp:T.v[0],rh:RH.v[0],wind:Math.hypot(U.v[0],V.v[0]),dir:(Math.atan2(-U.v[0],-V.v[0])*180/Math.PI+360)%360};
  var res={ok:true,cur:cur,stations:T.n,obsMs:obsMs,validUntilMs:obsMs+cadence*60000,horizon:horizon};
  if(age>cadence*3){res.headline='IMD data is out of date';res.detail='No forecast until the next update';return res}
  if(horizon<=0){res.headline='Waiting for the next IMD update';res.detail='The last forecast has expired';return res}
  var full=!!(Pp&&R&&models.full),v=full?models.full:models.lite;
  var o={T:T.v,RH:RH.v,P:full?Pp.v:null,U:U.v,V:V.v,R:full?R.v:null,ms:obsMs};
  var p=rainProb(v,feats(o,v.features));
  var rainNow=full?R.v[0]>=RAIN_MM:null;
  var d=describe(p,rainNow,horizon);
  res.headline=d.headline;res.detail=d.detail;res.minutes=d.minutes;res.prob=p;res.rainNow=rainNow;res.variant=full?'full':'lite';
  var tf=feats({T:T.v,RH:RH.v,U:U.v,V:V.v,P:null,R:null,ms:obsMs},models.trend.features);
  var z=tf.map(function(x,i){return (x-models.trend.mu[i])/models.trend.sd[i]});
  var dl=function(k){var t=models.trend.targets[k],s=t.intercept;for(var i=0;i<z.length;i++)s+=t.coef[i]*z[i];return s*horizon/60};
  var u2=U.v[0]+dl('u'),v2=V.v[0]+dl('v');
  res.outlook={temp:cur.temp+dl('temp_c'),rh:Math.min(100,Math.max(0,cur.rh+dl('rh'))),wind:Math.hypot(u2,v2),dir:(Math.atan2(-u2,-v2)*180/Math.PI+360)%360};
  return res;
}
return {forecast:forecast,rainProb:rainProb,feats:feats,describe:describe,idw:idw,uv:uv};
})();
if(typeof module!=='undefined')module.exports=Nowcast;
