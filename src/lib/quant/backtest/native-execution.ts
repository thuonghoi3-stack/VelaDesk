import type { NativeIntent } from "../strategy/native-reference.ts";
import type { DeskConfig, Ohlcv, OpenPosition, PaperEvent, StrategyId, Trade } from "../types.ts";
import { applySlippage, feeOn } from "../risk/sizer.ts";
type Entry = Extract<NativeIntent, {kind:"entry"}>;
export class NativeBroker {
  readonly ledger: {equity:number};
  readonly cfg: DeskConfig;
  position: OpenPosition | null = null;
  trades: Trade[] = [];
  events: PaperEvent[] = [];
  pending = new Map<string, Entry & {activated:boolean}>();
  constructor(ledger:{equity:number}, cfg:DeskConfig) {
    for(const [name,value,positive] of [["fixed quantity",cfg.nativeFixedQty??1,true],["tick",cfg.nativeTickSize??0.01,true],["fee",cfg.nativeFee??0,false],["slippage",cfg.nativeSlippageBps??0,false]] as const)
      if(!Number.isFinite(value)||(positive?value<=0:value<0))throw new Error(`Native invalid ${name}`);
    this.ledger=ledger; this.cfg=cfg;
  }
  step(bar:Ohlcv,index:number,intents:NativeIntent[]):boolean {
    let exposed=!!this.position;
    const path=Math.abs(bar.open-bar.high)<Math.abs(bar.open-bar.low)?[bar.open,bar.high,bar.low,bar.close]:[bar.open,bar.low,bar.high,bar.close];
    const rank=(o:Entry & {activated:boolean}):number=>{
      if(o.activated||o.order.kind==='market')return 0;
      const p=o.order.price;if(o.side==='long'?bar.open>=p:bar.open<=p)return 0;
      for(let k=1;k<path.length;k++)if(o.side==='long'?path[k]>=p:path[k]<=p)return k+Math.abs(p-path[k-1])/Math.max(1e-12,Math.abs(path[k]-path[k-1]));
      return Infinity;
    };
    for(const [id,order] of [...this.pending].sort((a,b)=>rank(a[1])-rank(b[1]))) {
      if(!this.pending.has(id))continue;
      let price=bar.open;
      if(order.order.kind==='stop' && !order.activated) {
        const stop=order.order.price;
        if(order.side==='long') { if(bar.high<stop)continue; price=Math.max(bar.open,stop); }
        else { if(bar.low>stop)continue; price=Math.min(bar.open,stop); }
      }
      this.pending.delete(id);
      const filled=this.fill(order,price,bar,index); exposed ||= !!this.position;
      if(filled&&order.oca)for(const [other,o] of this.pending)if(o.oca?.name===order.oca.name)this.pending.delete(other);
    }
    if(this.position)this.position.barsHeld++;
    for(const intent of intents) {
      if(intent.kind==='cancel')this.pending.delete(intent.id);
      else this.pending.set(intent.id,{...intent,activated:intent.order.kind==='market'||(intent.side==='long'?bar.close>=intent.order.price:bar.close<=intent.order.price)});
    }
    return exposed;
  }
  private fill(order:Entry,raw:number,bar:Ohlcv,index:number):boolean {
    if(this.position?.side===order.side)return false;
    if(this.position)this.close(bar,raw,'source_reversal');
    const fill=applySlippage(raw,order.side,true,this.cfg.nativeSlippageBps??0);
    const qty=order.quantity.kind==='percent-of-equity'?Math.max(0,this.ledger.equity)*order.quantity.value/100/fill:this.cfg.nativeFixedQty??1;
    if(!(qty>0))return false;
    this.ledger.equity-=feeOn(qty*fill,this.cfg.nativeFee??0);
    this.position={id:`native-${index}-${order.id}`,side:order.side,strategy:this.cfg.strategyId as StrategyId,entryTime:bar.time,entryBar:index,entry:fill,qty,remainingQty:qty,stop:order.side==='long'?-Infinity:Infinity,tp1:Infinity,tp2:Infinity,riskPerUnit:0,initialRiskUsdt:0,fundingPaid:0,barsHeld:0,tp1Done:false,trailed:false,rReached:0,maeR:0,signalExit:true};
    this.events.push({time:bar.time,kind:'fill',message:`Native ${order.id} ${order.side} @ ${fill} qty ${qty}; no source protective stop`});
    return true;
  }
  finish(bar:Ohlcv):void { if(this.position)this.close(bar,bar.close,'end_of_data');this.pending.clear(); }
  private close(bar:Ohlcv,raw:number,reason:string):void {
    const p=this.position!;const px=applySlippage(raw,p.side,false,this.cfg.nativeSlippageBps??0);
    const gross=(px-p.entry)*(p.side==='long'?1:-1)*p.qty;
    const fees=feeOn(p.qty*px,this.cfg.nativeFee??0),entryFee=feeOn(p.qty*p.entry,this.cfg.nativeFee??0);
    this.ledger.equity+=gross-fees;
    this.trades.push({id:`${p.id}-${this.trades.length}`,side:p.side,strategy:p.strategy,entryTime:p.entryTime,exitTime:bar.time,entry:p.entry,exit:px,qty:p.qty,pnl:gross-fees-entryFee,pnlR:0,mfeR:0,maeR:0,fees:fees+entryFee,funding:0,reason,barsHeld:p.barsHeld});
    this.events.push({time:bar.time,kind:'exit',message:`Native exit ${reason} @ ${px}`});this.position=null;
  }
  markToMarket(price:number):number {const p=this.position;return this.ledger.equity+(p?(price-p.entry)*(p.side==='long'?1:-1)*p.qty:0);}
}
