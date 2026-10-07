import {escapeHtml} from './finance-model.mjs';

export async function loadOperations(url,headers,container){
  const fetchJson=async(path,options={})=>{
    const response=await fetch(url+'/'+path,{headers,...options});
    if(!response.ok) throw new Error('Operations data: HTTP '+response.status);
    return response.json();
  };
  const [health,forecast,incidents,shipments]=await Promise.all([
    fetchJson('rpc/pipeline_health',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'}),
    fetchJson('rpc/reorder_forecast',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'}),
    fetchJson('v_open_incidents?order=first_seen_at.desc&limit=30'),
    fetchJson('v_shipment_status?order=invoice_date.desc&limit=5')]);
  const card=(title,body)=>`<section style="background:var(--bg-card,#161a2b);border:1px solid var(--border,#30364a);border-radius:14px;padding:16px;margin:12px 0"><h3>${title}</h3>${body}</section>`;
  let html=card('Needs attention',incidents.length?incidents.map(item=>
    `<div style="padding:8px 0">${item.severity==='critical'?'🔴':'🟠'} ${escapeHtml(item.title)} <small>(${escapeHtml(item.status)})</small></div>`).join(''):'✅ No open operational incidents');
  html+=card('Pipeline evidence',health.checks.map(check=>`<div style="padding:4px 0">${check.status==='ok'?'✅':check.status==='pending'?'⏳':'⚠️'} ${escapeHtml(check.title)}: ${escapeHtml(check.status)}<small style="display:block;opacity:.65">${escapeHtml(JSON.stringify(check.detail))}</small></div>`).join(''));
  html+=card('Replenishment — 4,000 L reserve',forecast.tanks.map(tank=>
    `<div style="padding:8px 0">T${escapeHtml(tank.tank_no)}: <b>${escapeHtml(tank.status)}</b> · ${tank.volume==null?'unknown':Number(tank.volume).toLocaleString('en-IN')+' L'}<small style="display:block;opacity:.65">Measured ${escapeHtml(tank.observed_at||'unknown')}; ${tank.daily_l==null?'demand unknown':Math.round(tank.daily_l)+' L/day'}; two-day projection ${tank.projected_at_lead_l==null?'unknown':Math.round(tank.projected_at_lead_l)+' L'}.</small></div>`).join('')+
    '<small>Incoming product quantities are separate; allocation to HSD tanks is not assumed.</small>');
  html+=card('Shipment lifecycle',shipments.map(shipment=>`<div style="padding:8px 0">${escapeHtml(shipment.sap_entry_no)} · ${escapeHtml(shipment.truck_no||'truck unknown')}<b style="display:block">${escapeHtml(shipment.physical_status)}</b><small>Pricing ${shipment.amount>0?'available':'pending'}; acknowledgement ${escapeHtml(shipment.acknowledgement_status)}. Physical receipt evidence is not operator acceptance.</small></div>`).join(''));
  container.innerHTML=html;
  return {health,forecast};
}
