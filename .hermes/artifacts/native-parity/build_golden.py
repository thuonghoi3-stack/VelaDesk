"""Independent scalar source-line translation. NOT TradingView output.
Only Python stdlib; never imports native-reference or reads its output.
Wrapper pins verified before generation; v5 documented kernels, caveats in contract.
"""
import math, json, pathlib, hashlib
ROOT=pathlib.Path(__file__).resolve().parent
N=float('nan')
names=['macd','rsi','stochastic-slow','supertrend','bollinger-bands','keltner','psar']
# Non-sinusoidal deterministic path: startup, reversals, flats, large gaps.
xs=[100.0]*20
for cycle in range(5):
    xs += [100+cycle*2-i*2 for i in range(18)]
    xs += [65+cycle*2+i*3 for i in range(25)]
    xs += [140+cycle]*7
    xs += [70+cycle,150+cycle,90+cycle]
bars=[dict(open=x,high=x+1+(i%4)*.25,low=x-1-(i%3)*.25,close=x) for i,x in enumerate(xs)]
def avg(seq,n):
    valid=[x for x in seq if not math.isnan(x)]
    return sum(valid[-n:])/n if len(valid)>=n else N
def smooth(seq,n,exponential=False):
    out=[];a=2/(n+1) if exponential else 1/n
    for i,x in enumerate(seq):
        prev=out[-1] if out else N
        if math.isnan(x): y=prev
        elif math.isnan(prev): y=x if exponential else avg(seq[:i+1],n)
        else:y=a*x+(1-a)*prev
        out.append(y)
    return out
def over(a,b,pa,pb):return a>b and pa<=pb
def prev(a,i):return a[i-1] if i else N
def order(id,side,price=None,oca=None,pct=False):
    d=dict(kind='entry',id=id,side=side,order=dict(kind='market') if price is None else dict(kind='stop',price=price),reversal='pine-entry-auto',quantity=dict(kind='percent-of-equity',value=15) if pct else dict(kind='unresolved-source-default'))
    if oca:d['oca']=dict(name=oca,type='cancel')
    return d
def cancel(id):return dict(kind='cancel',id=id)
tr=[b['high']-b['low'] if i==0 else max(b['high']-b['low'],abs(b['high']-xs[i-1]),abs(b['low']-xs[i-1])) for i,b in enumerate(bars)]
atr=smooth(tr,10)
fast=smooth(xs,12,True);slow=smooth(xs,26,True)
macd=[a-b for a,b in zip(fast,slow)];sig=smooth(macd,9,True);delta=[a-b for a,b in zip(macd,sig)]
change=[N]+[xs[i]-xs[i-1] for i in range(1,len(xs))]
up=smooth([max(v,0) for v in change],14);down=smooth([-min(v,0) for v in change],14)
rsi=[100 if d==0 else 0 if u==0 else 100-100/(1+u/d) for u,d in zip(up,down)]
raw=[]
for i,b in enumerate(bars):
    w=bars[max(0,i-13):i+1];lo=min(x['low'] for x in w);hi=max(x['high'] for x in w)
    raw.append(100*(b['close']-lo)/(hi-lo) if hi!=lo else N)
k=[avg(raw[:i+1],3) for i in range(len(xs))];d=[avg(k[:i+1],3) for i in range(len(xs))]
basis=[avg(xs[:i+1],20) for i in range(len(xs))]
dev=[2*math.sqrt(sum((x-basis[i])**2 for x in xs[max(0,i-19):i+1])/20) for i in range(len(xs))]
bbu=[a+b for a,b in zip(basis,dev)];bbl=[a-b for a,b in zip(basis,dev)]
ma=smooth(xs,20,True);ku=[a+2*b for a,b in zip(ma,atr)];kl=[a-2*b for a,b in zip(ma,atr)]
result={name:[] for name in names}
lastlower=lastupper=lastst=lastdir=N
bp=sp=0;bc=sc=False
uptrend=False;ep=sar=nextsar=N;af=.02
for i,b in enumerate(bars):
    c=b['close'];h=b['high'];l=b['low'];pc=prev(xs,i)
    def add(name,values,intents,warm=False):result[name].append(dict(barIndex=i,values=values,intents=intents,status='warmup' if warm else 'ready'))
    intents=[]
    if over(delta[i],0,prev(delta,i),0):intents.append(order('MacdLE','long'))
    if over(0,delta[i],0,prev(delta,i)):intents.append(order('MacdSE','short'))
    add('macd',dict(fast=fast[i],slow=slow[i],macd=macd[i],signal=sig[i],delta=delta[i]),intents)
    intents=[]
    if not math.isnan(rsi[i]):
        if over(rsi[i],30,prev(rsi,i),30):intents.append(order('RsiLE','long'))
        if over(70,rsi[i],70,prev(rsi,i)):intents.append(order('RsiSE','short'))
    add('rsi',dict(rsi=rsi[i],up=up[i],down=down[i]),intents,math.isnan(rsi[i]))
    intents=[]
    if not math.isnan(k[i]) and not math.isnan(d[i]):
        if over(k[i],d[i],prev(k,i),prev(d,i)) and k[i]<20:intents.append(order('StochLE','long'))
        if over(d[i],k[i],prev(d,i),prev(k,i)) and k[i]>80:intents.append(order('StochSE','short'))
    add('stochastic-slow',dict(raw=raw[i],k=k[i],d=d[i]),intents,math.isnan(k[i]) or math.isnan(d[i]))
    intents=[order('BBandLE','long',bbl[i],'BollingerBands') if over(c,bbl[i],pc,prev(bbl,i)) else cancel('BBandLE'),order('BBandSE','short',bbu[i],'BollingerBands') if over(bbu[i],c,prev(bbu,i),pc) else cancel('BBandSE')]
    add('bollinger-bands',dict(basis=basis[i],dev=dev[i],upper=bbu[i],lower=bbl[i]),intents,math.isnan(basis[i]))
    cu=over(c,ku[i],pc,prev(ku,i));cl=over(kl[i],c,prev(kl,i),pc)
    bp=h+.25 if cu else bp;sp=l-.25 if cl else sp
    bc=True if cu else bc;sc=True if cl else sc
    intents=[]
    if bc and (c<ma[i] or h>=bp):intents.append(cancel('KltChLE'))
    if cu:intents.append(order('KltChLE','long',bp))
    if sc and (c>ma[i] or l<=sp):intents.append(cancel('KltChSE'))
    if cl:intents.append(order('KltChSE','short',sp))
    add('keltner',dict(ma=ma[i],atr=atr[i],upper=ku[i],lower=kl[i],bprice=bp,sprice=sp,crossBcond=int(bc),crossScond=int(sc)),intents,math.isnan(atr[i]))
    lower=(h+l)/2-3*atr[i];upper=(h+l)/2+3*atr[i]
    pl=0 if math.isnan(lastlower) else lastlower;pu=0 if math.isnan(lastupper) else lastupper
    lower=lower if lower>pl or pc<pl else pl
    upper=upper if upper<pu or pc>pu else pu
    if math.isnan(prev(atr,i)):direction=1
    elif lastst==pu:direction=-1 if c>upper else 1
    else:direction=1 if c<lower else -1
    st=lower if direction==-1 else upper
    intents=[]
    if direction-lastdir<0:intents.append(order('My Long Entry Id','long',pct=True))
    if direction-lastdir>0:intents.append(order('My Short Entry Id','short',pct=True))
    add('supertrend',dict(atr=atr[i],lower=lower,upper=upper,supertrend=st,direction=direction),intents,math.isnan(atr[i]))
    lastlower,lastupper,lastst,lastdir=lower,upper,st,direction
    intents=[]
    if i>0:
        first=False;sar=nextsar
        if i==1:
            uptrend=c>pc;ep=h if uptrend else l
            ps=bars[i-1]['low'] if uptrend else bars[i-1]['high']
            first=True;sar=ps+.02*(ep-ps)
        if uptrend:
            if sar>l:first=True;uptrend=False;sar=max(ep,h);ep=l;af=.02
        else:
            if sar<h:first=True;uptrend=True;sar=min(ep,l);ep=h;af=.02
        if not first:
            if uptrend:
                if h>ep:ep=h;af=min(af+.02,.2)
            else:
                if l<ep:ep=l;af=min(af+.02,.2)
        if uptrend:
            sar=min(sar,bars[i-1]['low'])
            if i>1:sar=min(sar,bars[i-2]['low'])
        else:
            sar=max(sar,bars[i-1]['high'])
            if i>1:sar=max(sar,bars[i-2]['high'])
        nextsar=sar+af*(ep-sar)
        intents=[order('ParSE','short',nextsar),cancel('ParLE')] if uptrend else [order('ParLE','long',nextsar),cancel('ParSE')]
    add('psar',dict(sar=sar,nextBarSAR=nextsar,ep=ep,af=af,uptrend=int(uptrend)),intents,i==0)
def clean(x):
    if isinstance(x,float) and math.isnan(x):return 'NaN'
    if isinstance(x,dict):return {k:clean(v) for k,v in x.items()}
    if isinstance(x,list):return [clean(v) for v in x]
    return x
payload=dict(provenance='Independent Python source translation; no Pine runtime',mintick=.25,bars=bars,expected=result)
(ROOT/'golden.json').write_text(json.dumps(clean(payload),indent=2)+'\n')
print(json.dumps({n:{'bars':len(a),'warmup':sum(f['status']=='warmup' for f in a),'ready':sum(f['status']=='ready' for f in a),'entries':sum(o['kind']=='entry' for f in a for o in f['intents']),'cancels':sum(o['kind']=='cancel' for f in a for o in f['intents'])} for n,a in result.items()},indent=2))
