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
  return {gross,net:a.estimate?a.estimate.net:null};
}

const MONTH_NAME=/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?![a-z])/i;
const MONTHS=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

// The month a YVR464 dealer-margin credit pays for. Narrations vary ("YVR464 1102 Jun 24",
// "DEALER MARGIN SEP'26", "Dealer margin for January,20" cut short at the source), so read only the
// month name and take its latest occurrence at or before the posting date: a credit never posts
// before its month. Without a month name, the posting month is used.
export function marginMonth(description, postedOn) {
  const match=MONTH_NAME.exec(description||'');
  if(!match) return postedOn.slice(0,7);
  const month=MONTHS.indexOf(match[1].slice(0,3).toLowerCase())+1;
  const year=Number(postedOn.slice(0,4))-(month<=Number(postedOn.slice(5,7))?0:1);
  return `${year}-${String(month).padStart(2,'0')}`;
}

// A day's operating estimate needs every sale captured, valid prices and the IOCL statement; its
// kharcha turns that into a full net. Without kharcha the day still gives a before-kharcha estimate.
export function dayKind({sales,prices,iocl,kharcha}) {
  if(!sales || !prices || !iocl) return 'incomplete';
  return kharcha?'complete':'before_kharcha';
}

// Net over a period's complete days, and a before-kharcha estimate over the days that lack only
// kharcha. A whole-month view adds that month's YVR464 credit, shared by litres (margin.litres is the
// month's total), so a month with missing days only gets their share.
export function periodEstimate(days, margin) {
  const total=(list,key)=>list.reduce((sum,day)=>sum+(Number(day[key])||0),0);
  const share=list=>margin && margin.litres>0?margin.credit*total(list,'litres')/margin.litres:0;
  const operating=list=>total(list,'revenue')-total(list,'cogs')-total(list,'fees')+share(list);
  const complete=days.filter(day=>day.kind==='complete'), before=days.filter(day=>day.kind==='before_kharcha');
  return {completeDays:complete.length,beforeKharchaDays:before.length,
    net:complete.length?operating(complete)-total(complete,'exp'):null,
    beforeKharcha:before.length?operating(before):null,
    marginShare:share(complete)+share(before)};
}

// Kharcha bins are the hisaab viewer's categories (ops/categories.json; its kharcha part is deployed as categories.json),
// chosen as the viewer chooses: your choice for that line, then for every line written so, then the first rule whose
// pattern matches the label. An expense row has no place on the page, so a one-line choice is found by its date, label
// and amount (two lines alike on one day can't be told apart here). Kharcha rules don't test the line's kind ('item'):
// a row here doesn't carry it.
export function kharchaCategory(row, cats) {
  const line = Object.entries(cats.lines).find(([key, v]) => key.startsWith(row.date + '/') && v.label === row.category &&
    Math.abs(v.amount - row.amount) < 0.01);
  if (line) return line[1].category;
  const label = cats.labels['kharcha:' + String(row.category || '').replace(/\s*\([^()]*\)\s*$/, '').trim()];
  if (label) return label;
  const rule = cats.kharcha.rules.find(r => !r.pattern || new RegExp(r.pattern, 'i').test(row.category || ''));
  return rule ? rule.category : cats.kharcha.fallback;
}
