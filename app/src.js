import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const CONTRACT = "0x6CD89930916fb4D613e05ee0FFDee5A4E45FFa95";
const $ = (id) => document.getElementById(id);
const log = (msg) => { const b = $("log"); b.textContent = msg; b.style.display = "block"; clearTimeout(log._t); log._t = setTimeout(() => (b.style.display = "none"), 12000); };

const KEY_SLOT = "policy.keys";
let keys = []; try { keys = JSON.parse(localStorage.getItem(KEY_SLOT) || "[]"); } catch {}
if (!keys.length) { keys = [generatePrivateKey()]; localStorage.setItem(KEY_SLOT, JSON.stringify(keys)); }
let account = createAccount(keys[0]);
let client = createClient({ chain: studionet, account });
const reader = createClient({ chain: studionet, account: createAccount(generatePrivateKey()) });

async function check() {
  const q = $("question").value.trim();
  const url = $("purl").value.trim();
  const ans = $("answer").value;
  if (!q || !url) { log("Fill question and policy URL."); return; }
  log("Checking policy compliance… (1-2 min)");
  $("result").style.display = "none";
  try {
    const hash = await client.writeContract({ address: CONTRACT, functionName: "check_policy", args: [q, url, ans] });
    log(`Tx: ${hash.slice(0,12)}… waiting…`);
    const r = await client.waitForTransactionReceipt({ hash, status: "FINALIZED", retries: 200, interval: 3000 });
    if (r.result !== 7 && r.status !== 7) { const lr = (r.consensus_data?.leader_receipt||[{}])[0]; log("Failed: " + (lr.genvm_result?.stderr||"").slice(0,200)); return; }
    const stored = await reader.readContract({ address: CONTRACT, functionName: "get_check", args: [q] });
    showResult(stored);
  } catch (e) { log("Error: " + (e.message||e)); }
}

function showResult(r) {
  const box = $("result"); box.style.display = "block";
  const vColor = { SUPPORTED: "#1f7a4d", CONTRADICTED: "#a32b2b", SILENT: "#9a5b00" }[r.verdict] || "#697586";
  const cColor = { COMPLIANT: "#1f7a4d", NON_COMPLIANT: "#a32b2b", UNCLEAR: "#9a5b00" }[r.compliance_status] || "#697586";
  box.innerHTML = `
    <div style="display:flex;gap:16px;margin-bottom:12px">
      <div><span style="font-size:20px;font-weight:700;color:${vColor}">${r.verdict}</span><br/><span style="font-size:12px;color:#697586">Verdict</span></div>
      <div><span style="font-size:20px;font-weight:700;color:${cColor}">${r.compliance_status}</span><br/><span style="font-size:12px;color:#697586">Compliance</span></div>
      <div><span style="font-size:20px;font-weight:700">${r.confidence}%</span><br/><span style="font-size:12px;color:#697586">Confidence</span></div>
    </div>
    <div style="font-size:14px;margin-bottom:8px"><b>Relevant section:</b> ${r.relevant_section || "—"}</div>
    <div style="font-size:14px"><b>Reasoning:</b> ${r.reasoning || "—"}</div>
  `;
}

window.check = check;
