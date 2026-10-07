export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function creditKind(type) {
  return type === 'debit' ? 'given' : ['credit','payment'].includes(type) ? 'received' : 'unknown';
}

export function shiftDate(date, days) {
  const value = new Date(date+'T12:00:00Z');
  value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
}

export function allocateCollections(claims, records, lagDays = 1) {
  const available = records.map((row,index)=>({...row,index,remaining:Number(row.amount)||0}));
  const allocations=[];let claimed=0,matched=0;
  for (const claim of [...claims].sort((a,b)=>a.date.localeCompare(b.date))) {
    let remaining=Number(claim.amount)||0;claimed+=remaining;
    for (let lag=0;lag<=lagDays && remaining>0;lag++) {
      for (const record of available) {
        if (record.date!==shiftDate(claim.date,lag) || record.remaining<=0) continue;
        const amount=Math.min(remaining,record.remaining);
        remaining-=amount;record.remaining-=amount;matched+=amount;
        allocations.push({claim_date:claim.date,record_index:record.index,record_date:record.date,amount});
      }
    }
  }
  return {claimed,matched,unmatched_claim:claimed-matched,
          unmatched_records:available.reduce((sum,row)=>sum+row.remaining,0),allocations};
}

export function csvCell(value) {
  if(value==null) return '';
  let text=String(value);
  if(typeof value==='string' && /^[=+\-@\t\r]/.test(text)) text="'"+text;
  return /[",\n\r]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;
}

export function pnlEstimate(a) {
  const gross=a.cogs==null?null:a.revenue+a.ioclMargin-a.cogs;
  return {gross,net:a.complete && gross!=null?gross-a.exp-a.ioclFees:null};
}
