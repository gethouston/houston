/**
 * update-tunnel.js
 *
 * Called automatically by start.bat after cloudflared prints its URL.
 * Updates the Vercel env var LOCAL_AGENT_URL and redeploys so the
 * Vercel forwarder knows where to send A2A requests.
 *
 * Usage: node update-tunnel.js https://xxx.trycloudflare.com
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dir = dirname(fileURLToPath(import.meta.url));
const DEPLOY_DIR = resolve(__dir, '..', 'deploy');

const tunnelUrl = process.argv[2];
if (!tunnelUrl || !tunnelUrl.startsWith('https://')) {
  console.error('Usage: node update-tunnel.js https://xxx.trycloudflare.com');
  process.exit(1);
}

console.log(`\nUpdating Vercel with tunnel URL: ${tunnelUrl}`);

try {
  // Remove old env var, add new one, redeploy
  await execAsync(`vercel env rm LOCAL_AGENT_URL production --yes`, { cwd: DEPLOY_DIR }).catch(() => {});
  await execAsync(`echo ${tunnelUrl} | vercel env add LOCAL_AGENT_URL production`, { cwd: DEPLOY_DIR });
  console.log('Env var updated. Redeploying...');
  const { stdout } = await execAsync(`vercel deploy --yes --prod`, { cwd: DEPLOY_DIR, timeout: 120_000 });
  // Extract production URL from output
  const match = stdout.match(/https:\/\/outbound-agent-iota\.vercel\.app/);
  console.log(`\nDone. Vercel forwarder is live at: ${match ? match[0] : 'https://outbound-agent-iota.vercel.app'}`);
  console.log(`Tunnel active at: ${tunnelUrl}`);
  console.log(`\nA2A endpoint (Bio registered): https://outbound-agent-iota.vercel.app/api`);
  console.log('Ready to receive requests.\n');
} catch (err) {
  console.error('Error updating Vercel:', err.message);
  process.exit(1);
}
