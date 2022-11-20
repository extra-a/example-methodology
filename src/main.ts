import ndjson from 'ndjson';
import { GameReader } from 'dmo-expositor/build/src/lib.js';
import { pipeline } from 'node:stream/promises';
import parseArgs from 'minimist';
import fs from 'node:fs';
import { angDistPlotter, Options } from './angular-dist.js';
import path from 'node:path';

async function main() {
  let cfg: Options = {
    acn: 0,
    tcn: 0,
    gun: 'RIFLE',
    interval: 1000,
    dir: process.cwd()
  };
  try {
    const argv = parseArgs(process.argv.slice(2));
    const filePath = argv._[0];
    if (argv.usage || !argv.acn || !argv.tcn) {
      showUsage();
    }
    cfg = {...cfg, ...argv};
    cfg.dir = path.normalize(cfg.dir);
    const isStdin = !filePath;
    const reader = new GameReader();
    await pipeline(
      isStdin ? process.stdin : fs.createReadStream(filePath),
      ndjson.parse(),
      reader.getStreamConsumer(),
    );
    const gameState = reader.getGameState();
    await angDistPlotter(gameState, cfg);
  } catch (e) {
    console.error(e);
    process.exit(-1);
  }
  process.exit(0);
}

main();

function showUsage() {
  const usage = `
Usage: npm start -- --acn=1 --tcn=2 input.json

Other options:
  --gun=<FIST | SG | CG | RL | RIFLE | GL | PISTOL> RIFLE    Attacker weapon
  --interval=<number> 1000    Interval before the shot
  --dir=<path> .   Output directory
`;
  console.log(usage);
  process.exit(0);
}
