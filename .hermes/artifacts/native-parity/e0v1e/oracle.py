"""Independent stdlib mathematical oracle, no VelaDesk imports/dependencies.
Not execution of pinned TA-Lib/pandas-ta: dependency-version parity remains open.
EMA and RSI use closed weighted sums rather than the TS recursive updates.
"""
import json, math, statistics
from pathlib import Path
rows = []
for i in range(260):
    close = 100 + .09*i + 8*math.sin(i*.13) + 2*math.cos(i*.71)
    if 220 <= i <= 230:
        close -= (i-219)*1.7
    rows.append(dict(close=close, low=close-1.3))
x = [r['close'] for r in rows]
def ema(i, n):
    if i<n-1: return None
    a=2/(n+1); k=i-(n-1)
    return statistics.mean(x[:n])*(1-a)**k + sum(a*(1-a)**(i-j)*x[j] for j in range(n,i+1))
def rsi(i,n):
    if i<n: return None
    d=[x[j]-x[j-1] for j in range(1,i+1)]; a=1/n
    def avg(sign):
        y=[max(sign*v,0) for v in d]
        return statistics.mean(y[:n])*(1-a)**(i-n)+sum(a*(1-a)**(i-j)*y[j-1] for j in range(n+1,i+1))
    g,l=avg(1),avg(-1)
    return 100*g/(g+l) if g+l else 0
expected=[]
for i in range(len(x)):
    expected.append(dict(close=x[i],low=rows[i]['low'],ema8=ema(i,8),ema16=ema(i,16),sma15=statistics.mean(x[i-14:i+1]) if i>=14 else None,cti=statistics.correlation(x[i-19:i+1],range(20)) if i>=19 else None,rsi=rsi(i,14),rsiFast=rsi(i,4),rsiSlow=rsi(i,20),ewo=100*(ema(i,50)-ema(i,200))/rows[i]['low'] if i>=199 else None))
Path(__file__).with_name('oracle.json').write_text(json.dumps(dict(provenance='stdlib closed-sum EMA/Wilder RSI and statistics.correlation; not deployed dependency certification',candles=rows,expected=expected),indent=2))
print('Generated 260 nonflat candles and independent indicator rows')
