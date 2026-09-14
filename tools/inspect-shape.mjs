import { HypersyncClient, LogField, BlockField } from "@envio-dev/hypersync-client";
import { readFileSync } from "node:fs";
const c = new HypersyncClient({ url: "https://monad.hypersync.xyz",
  apiToken: readFileSync("/home/solana/.envio-token", "utf8").trim() });
const res = await c.get({ fromBlock: 104722000, toBlock: 104722010, logs: [{}],
  fieldSelection: { log: [LogField.BlockNumber, LogField.Address, LogField.Topic0, LogField.Topic1, LogField.Topic2],
                    block: [BlockField.Number, BlockField.Timestamp] } });
const l = res.data.logs[0];
console.log("логов:", res.data.logs.length);
console.log("ключи лога:", Object.keys(l ?? {}));
console.log("пример:", JSON.stringify(l).slice(0, 320));
console.log("ключи блока:", Object.keys(res.data.blocks[0] ?? {}));
