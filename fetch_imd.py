import os,sys,json,math,datetime as dt
import requests
D=os.path.dirname(os.path.abspath(__file__))
URL=os.environ.get('IMD_API_URL') or 'https://mausam.imd.gov.in/api/current_wx_api.php?id={id}'
KEY=os.environ.get('IMD_API_KEY') or ''
CADENCE=60
RAIN_MODE='none'
WIND_FACTOR=1.0
FIELD_MAP={'time':None,'temp_c':'Temperature','rh':'Humidity','pres_hpa':None,'wind_ms':None,'wind_dir':None,'rain':'Rainfall'}
IST=dt.timezone(dt.timedelta(hours=5,minutes=30))
HOUR=3600000
def num(v):
    try:
        x=float(v)
        return None if math.isnan(x) else x
    except Exception:
        return None
def parse_time(v):
    if not v:return None
    for f in('%Y-%m-%d %H:%M:%S','%Y-%m-%d %H:%M','%d-%m-%Y %H:%M:%S','%d-%m-%Y %H:%M','%d/%m/%Y %H:%M'):
        try:return dt.datetime.strptime(str(v).strip(),f).replace(tzinfo=IST)
        except Exception:pass
    try:
        t=dt.datetime.fromisoformat(str(v).strip().replace('Z','+00:00'))
        return t if t.tzinfo else t.replace(tzinfo=IST)
    except Exception:return None
def parse(j,now):
    g=lambda k:num(j.get(FIELD_MAP[k])) if FIELD_MAP[k] else None
    t=parse_time(j.get(FIELD_MAP['time'])) if FIELD_MAP['time'] else None
    t=t or now.replace(minute=0,second=0,microsecond=0)
    ws=g('wind_ms')
    return {'ms':int(t.timestamp()*1000),'temp_c':g('temp_c'),'rh':g('rh'),'pres_hpa':g('pres_hpa'),'wind_ms':None if ws is None else ws*WIND_FACTOR,'wind_dir':g('wind_dir'),'rain':g('rain')}
def fetch(sid):
    h={'Authorization':'Bearer '+KEY} if KEY else {}
    r=requests.get(URL.format(id=sid),headers=h,timeout=30)
    r.raise_for_status()
    j=r.json()
    return j[0] if isinstance(j,list) else j
def nearest(h,ms):
    b=min(h,key=lambda o:abs(o['ms']-ms),default=None)
    return b if b and abs(b['ms']-ms)<=25*60000 else None
def iso(ms):return dt.datetime.fromtimestamp(ms/1000,dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
def build(st,h):
    if not h:return None
    L=max(o['ms'] for o in h)
    ob=[nearest(h,L-k*HOUR) for k in range(4)]
    def ser(key):
        v=[None if o is None else o[key] for o in ob]
        return None if any(x is None for x in v) else v
    out={'id':st['id'],'name':st['name'],'lat':st['lat'],'lon':st['lon'],'obs_time':iso(L),'temp_c':ser('temp_c'),'rh':ser('rh'),'pres_hpa':ser('pres_hpa'),'wind_ms':ser('wind_ms'),'wind_dir':ser('wind_dir'),'rain_mm':None}
    r=ser('rain')
    if r and RAIN_MODE=='hourly':out['rain_mm']=r
    if r and RAIN_MODE=='cumulative':
        d=[r[k]-r[k+1] if r[k]>=r[k+1] else r[k] for k in range(3)]
        out['rain_mm']=[round(x,2) for x in d]+[0.0]
    return out
def mock(st,ms,k):
    h=((ms/HOUR)+5.5)%24
    i=sum(map(ord,st['id']))%7
    return {'ms':ms,'temp_c':round(30+4*math.sin((h-9)/24*2*math.pi)-0.3*i,1),'rh':round(72-18*math.sin((h-9)/24*2*math.pi)+i,1),'pres_hpa':round(999.5-1.2*k+0.2*i,1),'wind_ms':round(2.2+0.4*i+0.3*math.sin(k),1),'wind_dir':(250+8*i+10*k)%360,'rain':[0.0,0.0,0.0,0.0][k%4]}
def main():
    sts=[s for s in json.load(open(D+'/stations.json')) if not str(s['id']).startswith('REPLACE')]
    hp=D+'/history.json'
    hist=json.load(open(hp)) if os.path.exists(hp) else {}
    now=dt.datetime.now(dt.timezone.utc)
    demo='--mock' in sys.argv
    if '--probe' in sys.argv:
        print(json.dumps(fetch(sys.argv[sys.argv.index('--probe')+1]),indent=2));return
    if demo:
        base=int(now.replace(minute=0,second=0,microsecond=0).timestamp()*1000)
        hist={s['id']:[mock(s,base-k*HOUR,k) for k in range(6)] for s in sts}
    ok=0
    for s in sts:
        if demo:ok+=1;continue
        try:
            o=parse(fetch(s['id']),now)
            h=hist.setdefault(s['id'],[])
            if all(x['ms']!=o['ms'] for x in h):h.append(o)
            ok+=1
        except Exception as e:
            print('station',s['id'],'failed:',e)
    for k in hist:hist[k]=[o for o in hist[k] if o['ms']>now.timestamp()*1000-8*HOUR]
    if sts and not ok:sys.exit(1)
    live={'updated':iso(int(now.timestamp()*1000)),'cadence_min':CADENCE,'demo':demo,'stations':[x for x in(build(s,hist.get(s['id'],[])) for s in sts) if x]}
    json.dump(hist,open(hp,'w'))
    json.dump(live,open(D+'/live.json','w'),indent=1)
    print('wrote live.json with',len(live['stations']),'station(s)')
main()
