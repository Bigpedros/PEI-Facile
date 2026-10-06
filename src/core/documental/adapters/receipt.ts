import type {ReceiptResult} from '../engine/types';
export function money(value:string):number|null {
 const cleaned=value.replace(/\s/g,'').replace(/€/g,'');
 if(!/^-?\d+(?:[.,]\d{3})*[.,]\d{2}$/.test(cleaned))return null;
 const last=Math.max(cleaned.lastIndexOf(','),cleaned.lastIndexOf('.'));
 const integer=cleaned.slice(0,last).replace(/[.,]/g,'');return Number(integer+'.'+cleaned.slice(last+1));
}
export function parseReceipt(text:string):ReceiptResult {
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);const warnings:string[]=[];
 const totals:{amount:number;index:number}[]=[];const items:ReceiptResult['items']=[];
 let date:string|null=null;
 const totalPattern=/\b(?:TOTALE(?:\s+(?:EURO|COMPLESSIVO|DA\s+PAGARE))?|IMPORTO\s+TOTALE)\b/i;
 const excluded=/SUB\s*TOTALE|TOTALE\s+(?:IVA|IMPOSTA|SCONTO|CONTANTE|PAGATO)|RESTO|BANCOMAT|CARTA|PAGAMENTO|CONTANTI|IVA|IMPONIBILE|SCONTO|\bP\.?\s*IVA\b|\bTEL\b|\bCASSA\b|\bDOCUMENTO\b|\bEURO\b|\bEUR\b/i;
 for(let index=0;index<lines.length;index++){
 const line=lines[index];
 const dateMatch=line.match(/\b(\d{2})[/.\-](\d{2})[/.\-](\d{4}|\d{2})\b/);
 if(dateMatch&&!date){const year=Number(dateMatch[3].length===2?'20'+dateMatch[3]:dateMatch[3]);const month=Number(dateMatch[2]),day=Number(dateMatch[1]);const d=new Date(Date.UTC(year,month-1,day));if(d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day)date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
 const amountMatch=line.match(/(-?\d+(?:[.,]\d{3})*[.,]\d{2})\s*(?:€|EUR|[A-Z])?\s*$/i);
 if(totalPattern.test(line)&&!excluded.test(line.replace(/\bEURO\b|\bEUR\b/gi,''))){
 const nextMatch=amountMatch||lines[index+1]?.match(/^\s*(-?\d+(?:[.,]\d{3})*[.,]\d{2})\s*€?\s*$/);
 const amount=nextMatch?money(nextMatch[1]):null;if(amount!==null)totals.push({amount,index});continue;
 }
 if(!amountMatch||excluded.test(line)||dateMatch||totalPattern.test(line))continue;
 const amount=money(amountMatch[1]);const description=line.slice(0,amountMatch.index).trim();
 if(amount!==null&&/[A-Za-zÀ-ÿ]{2}/.test(description))items.push({description,amount,line});
 }
 const total=totals.length===1?totals[0].amount:null;
 if(totals.length>1)warnings.push('Più righe di totale: selezione manuale necessaria.');
 if(total===null)warnings.push('Totale non identificato in modo univoco.');
 const cutoff=totals.length===1?totals[0].index:lines.length;
 const candidates=items.filter(item=>lines.indexOf(item.line)<cutoff);
 const itemsSum=Math.round(candidates.reduce((sum,item)=>sum+item.amount,0)*100)/100;
 const difference=total===null?null:Math.round((total-itemsSum)*100)/100;
 if(difference!==null&&Math.abs(difference)>.01)warnings.push('La somma delle righe candidate non coincide con il totale. Verificare quantità, sconti e righe mancanti.');
 if(!date)warnings.push('Data non riconosciuta.');
 warnings.push('Estrazione scontrino euristica: negozio, prodotti e importi richiedono conferma.');
 const merchant=lines.find(line=>/[A-Za-zÀ-ÿ]{3}/.test(line)&&!excluded.test(line)&&!totalPattern.test(line))||null;
 return {merchant,date,total,items:candidates,itemsSum,difference,warnings,status:'review'};
}
