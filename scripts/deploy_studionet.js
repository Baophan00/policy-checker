const fs = require("fs");
const path = require("path");
const { createClient, createAccount, generatePrivateKey } = require("genlayer-js");
const { studionet } = require("genlayer-js/chains");
const KEYFILE = path.join(__dirname, ".e2e-keys.json");
function keys() {
  if (fs.existsSync(KEYFILE)) return JSON.parse(fs.readFileSync(KEYFILE, "utf8"));
  const k = { owner: generatePrivateKey() };
  fs.writeFileSync(KEYFILE, JSON.stringify(k, null, 2), { mode: 0o600 });
  return k;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, label) {
  let last;
  for (let i = 0; i < 8; i++) {
    try { return await fn(); } catch (e) {
      last = e; const msg = String(e && e.message);
      if (!/DOCTYPE|fetch failed|ECONNRESET|timeout|temporarily unavailable|not available/i.test(msg)) throw e;
      console.log(`  ${label}: rpc hiccup, retry ${i + 1}`); await sleep(4000);
    }
  } throw last;
}
(async () => {
  const k = keys();
  const deployer = createAccount(k.owner);
  const client = createClient({ chain: studionet, account: deployer });
  const code = new Uint8Array(fs.readFileSync(path.join(process.cwd(), "contracts/policy_checker.py")));
  console.log("deployer", deployer.address);
  await withRetry(() => client.initializeConsensusSmartContract(), "consensus");
  const hash = await withRetry(() => client.deployContract({ code, args: [] }), "deploy");
  console.log("deploy tx", hash);
  const receipt = await withRetry(() => client.waitForTransactionReceipt({ hash, status: "FINALIZED", retries: 200, interval: 3000 }), "receipt");
  const address = receipt.data?.contract_address || receipt.txDataDecoded?.contractAddress || receipt.data?.contractAddress;
  if (!address) throw new Error(`no contract address: ${JSON.stringify(receipt).slice(0, 800)}`);
  console.log("contract", address);
  const info = await withRetry(() => client.readContract({ address, functionName: "contract_info", args: [] }), "info");
  console.log("info", JSON.stringify(info));
})().catch((e) => { console.error("FAILED:", e.message); if (e.cause) console.error(String(e.cause).slice(0, 800)); process.exit(1); });
