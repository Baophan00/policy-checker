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

function decodeCheck(raw) {
  let value = raw;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text || text === "{}") return null;
    try { value = JSON.parse(text); } catch { throw new Error("the stored check is not valid JSON"); }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const str = (v) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
  const verdict = str(value.verdict).toUpperCase();
  const status = str(value.compliance_status).toUpperCase();
  const confidence = Number(value.confidence);
  return {
    verdict: ["SUPPORTED", "CONTRADICTED", "SILENT"].includes(verdict) ? verdict : "SILENT",
    compliance: ["COMPLIANT", "NON_COMPLIANT", "UNCLEAR"].includes(status) ? status : "UNCLEAR",
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, Math.round(confidence))) : 0,
    section: str(value.relevant_section),
    reasoning: str(value.reasoning),
    question: str(value.question),
  };
}

function showResult(raw) {
  const box = $("result");
  box.style.display = "block";
  box.replaceChildren();
  let r;
  try { r = decodeCheck(raw); }
  catch (e) { box.textContent = "The stored check could not be read: " + e.message; return; }
  if (!r) { box.textContent = "No stored check for this question yet."; return; }

  const vColor = { SUPPORTED: "#1f7a4d", CONTRADICTED: "#a32b2b", SILENT: "#9a5b00" }[r.verdict];
  const cColor = { COMPLIANT: "#1f7a4d", NON_COMPLIANT: "#a32b2b", UNCLEAR: "#9a5b00" }[r.compliance];
  const add = (parent, tag, text, style) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (style) node.setAttribute("style", style);
    parent.append(node);
    return node;
  };

  const row = add(box, "div", undefined, "display:flex;gap:16px;margin-bottom:12px;flex-wrap:wrap");
  const cell = (label, value, color) => {
    const wrap = add(row, "div");
    add(wrap, "span", value, `font-size:20px;font-weight:700;${color ? `color:${color}` : ""}`);
    add(wrap, "br");
    add(wrap, "span", label, "font-size:12px;color:#697586");
  };
  cell("Verdict", r.verdict, vColor);
  cell("Compliance", r.compliance, cColor);
  cell("Confidence", `${r.confidence}%`);

  const section = add(box, "div", undefined, "font-size:14px;margin-bottom:8px");
  add(section, "b", "Relevant section: ");
  add(section, "span", r.section || "—");
  const reasoning = add(box, "div", undefined, "font-size:14px");
  add(reasoning, "b", "Reasoning: ");
  add(reasoning, "span", r.reasoning || "—");
}

window.check = check;
window.showResult = showResult;
window.decodeCheck = decodeCheck;
