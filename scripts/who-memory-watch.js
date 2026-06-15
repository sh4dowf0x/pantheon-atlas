const fs = require('node:fs');
const path = require('node:path');
const { sampleProcessMemoryStrings } = require('../src/memoryProbe');

async function main() {
  const root = path.resolve(__dirname, '..');
  const outPath = path.join(root, 'data', 'who-memory-watch.jsonl');
  const pid = Number(process.env.PANTHEON_PID || 26876);
  const rounds = Number(process.env.WHO_MEMORY_ROUNDS || 12);
  const delayMs = Number(process.env.WHO_MEMORY_DELAY_MS || 1000);
  const keywords = String(process.env.WHO_MEMORY_KEYWORDS || 'who,lvl,race,class,zone,wilds end,group,grp,name')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, '');

  for (let i = 0; i < rounds; i++) {
    const observedAt = new Date().toISOString();
    try {
      const result = await sampleProcessMemoryStrings(pid, {
        processName: 'Pantheon.exe',
        maxRegionsPerSweep: 96,
        maxBytesPerRegion: 131072,
        minStringLength: 4,
        keywords,
        startAddress: 0
      });
      fs.appendFileSync(
        outPath,
        JSON.stringify({
          sweep: i,
          observedAt,
          pid,
          nextAddress: result.nextAddress,
          observations: result.observations
        }) + '\n'
      );
    } catch (error) {
      fs.appendFileSync(
        outPath,
        JSON.stringify({
          sweep: i,
          observedAt,
          pid,
          error: error?.message || String(error)
        }) + '\n'
      );
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
