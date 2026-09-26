import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as os from 'os'

const execAsync = promisify(exec)

export interface WifiNetwork {
  ssid: string
  security: string
  signal: number
  inUse: boolean
}

export interface WifiStatus {
  apMode: boolean
  hotspotIp: string | null
  hotspotSsid: string | null
  hostname: string | null
}

export interface WifiConnection {
  connected: boolean
  ssid: string | null
  /** 0-100 */
  signal: number
}

const AP_MODE_FLAG = '/tmp/wifi-ap-mode'
const HOTSPOT_DEFAULT_IP = '10.42.0.1'

// Matches scripts/wifi-check.sh: SSID/connection name is always
// "<hostname>-setup", so both sides stay in sync with zero shared config —
// no per-device string to hardcode or forget to update after a rename.
function getHotspotConName(): string {
  return `${os.hostname()}-setup`
}

// ── nmcli terse output parser ─────────────────────────────────────────────────
// nmcli -t escapes colons inside values as \: so we must parse carefully.
function parseTerseLine(line: string): string[] {
  const parts: string[] = []
  let current = ''
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && i + 1 < line.length && line[i + 1] === ':') {
      current += ':'
      i++ // skip escaped colon
    } else if (line[i] === ':') {
      parts.push(current)
      current = ''
    } else {
      current += line[i]
    }
  }
  parts.push(current)
  return parts
}

// ── WifiService ───────────────────────────────────────────────────────────────

export class WifiService {
  isApMode(): boolean {
    return fs.existsSync(AP_MODE_FLAG)
  }

  async getStatus(): Promise<WifiStatus> {
    if (!this.isApMode()) {
      return { apMode: false, hotspotIp: null, hotspotSsid: null, hostname: null }
    }
    const ip = await this.getHotspotIp()
    return { apMode: true, hotspotIp: ip, hotspotSsid: getHotspotConName(), hostname: os.hostname() }
  }

  // Get the actual IP assigned to wlan0 in AP mode (falls back to default)
  async getHotspotIp(): Promise<string> {
    try {
      const { stdout } = await execAsync(
        "ip -4 addr show wlan0 2>/dev/null | grep -oP '(?<=inet )\\d+\\.\\d+\\.\\d+\\.\\d+' | head -1"
      )
      const ip = stdout.trim()
      return ip || HOTSPOT_DEFAULT_IP
    } catch {
      return HOTSPOT_DEFAULT_IP
    }
  }

  // Current association, from the cached scan list (no rescan — cheap enough to poll).
  async getConnection(): Promise<WifiConnection> {
    try {
      const { stdout } = await execAsync(
        'nmcli -t -f IN-USE,SSID,SIGNAL dev wifi list ifname wlan0 --rescan no 2>/dev/null'
      )
      for (const line of stdout.split('\n')) {
        const parts = parseTerseLine(line)
        if (parts.length < 3 || parts[0].trim() !== '*') continue
        const ssid = parts.slice(1, parts.length - 1).join(':').trim()
        if (ssid === getHotspotConName()) break   // our own setup hotspot isn't "connected"
        return { connected: true, ssid, signal: parseInt(parts[parts.length - 1]) || 0 }
      }
    } catch { /* nmcli missing (dev machine) or no wlan0 */ }
    return { connected: false, ssid: null, signal: 0 }
  }

  // List nearby networks via nmcli, deduped and sorted by signal
  async scanNetworks(): Promise<WifiNetwork[]> {
    // Trigger a rescan (best-effort; may be rate-limited by NM)
    await execAsync('nmcli device wifi rescan ifname wlan0 2>/dev/null').catch(() => {})

    const { stdout } = await execAsync(
      'nmcli -t -f IN-USE,SSID,SECURITY,SIGNAL dev wifi list ifname wlan0 2>/dev/null'
    )

    const networks: WifiNetwork[] = []
    const seen = new Set<string>()

    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue

      // Fields: IN-USE  SSID  SECURITY  SIGNAL
      const parts = parseTerseLine(line)
      if (parts.length < 4) continue

      const inUse = parts[0].trim() === '*'
      // SSID is everything between parts[1] and parts[parts.length-2]
      // (handles SSIDs that still somehow contain unescaped colons)
      const signal = parseInt(parts[parts.length - 1]) || 0
      const security = parts[parts.length - 2].trim() || 'Open'
      const ssid = parts.slice(1, parts.length - 2).join(':').trim()

      if (!ssid || ssid === getHotspotConName() || seen.has(ssid)) continue
      seen.add(ssid)
      networks.push({ ssid, security, signal, inUse })
    }

    return networks.sort((a, b) => b.signal - a.signal)
  }

  // Connect wlan0 to a given network; uses sudo so it works from the pi user.
  //
  // Deliberately NOT `nmcli dev wifi connect <ssid> password <pwd>` — on
  // current NetworkManager (nmcli 1.52+) that shorthand fails outright with
  // "802-11-wireless-security.key-mgmt: property is missing", before it
  // ever attempts to associate. Building the connection profile explicitly
  // via `connection add` + `connection up` (same pattern as the hotspot
  // creation in wifi-check.sh) sidesteps the broken shorthand entirely.
  async connect(ssid: string, password: string): Promise<void> {
    // Shell-escape single quotes in ssid/password
    const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`
    const conName = ssid

    // Drop any previous profile for this SSID so retries (or reconnecting
    // to a network used before) don't pile up duplicate connections.
    await execAsync(`sudo nmcli connection delete ${q(conName)} 2>/dev/null`).catch(() => {})

    const securityArgs = password
      ? `802-11-wireless-security.key-mgmt wpa-psk 802-11-wireless-security.psk ${q(password)}`
      : ''

    await execAsync(
      `sudo nmcli connection add type wifi ifname wlan0 con-name ${q(conName)} ssid ${q(ssid)} ${securityArgs} ipv4.method auto`
    )

    try {
      await execAsync(`sudo nmcli --wait 30 connection up ${q(conName)}`)
    } catch (err) {
      // Failed to associate (wrong password, out of range, etc.) — remove
      // the bad profile rather than leaving it behind for NM to retry.
      await execAsync(`sudo nmcli connection delete ${q(conName)} 2>/dev/null`).catch(() => {})
      throw err
    }
  }

  // Connects, then — once actually connected — tears down the AP hotspot
  // (if any), notifies the caller, and reboots so everything (NM, avahi,
  // the app itself) comes back up cleanly on the new network. Shared by
  // the phone-facing HTTP route and the on-device IPC path so both behave
  // identically instead of duplicating this orchestration.
  async connectAndFinalize(ssid: string, password: string, onConnected?: () => void): Promise<void> {
    await this.connect(ssid, password)

    setTimeout(async () => {
      try {
        await this.teardownHotspot()
        onConnected?.()
        await this.reboot()
      } catch (err) {
        console.error('[WiFi] post-connect teardown error:', err)
      }
    }, 1500)
  }

  // Tear down the hotspot connection created by wifi-check.sh
  async teardownHotspot(): Promise<void> {
    const con = getHotspotConName()
    await execAsync(`sudo nmcli connection down   "${con}" 2>/dev/null`).catch(() => {})
    await execAsync(`sudo nmcli connection delete "${con}" 2>/dev/null`).catch(() => {})
    try { fs.unlinkSync(AP_MODE_FLAG) } catch { /* already gone */ }
  }

  async reboot(): Promise<void> {
    await execAsync('sudo reboot')
  }
}

// ── Setup page HTML (served at GET /setup) ────────────────────────────────────
// Self-contained; no React bundle required. Works on any phone browser.
// Built per-request (not a static const) so the displayed name always
// matches this device's current hostname — a fresh unit shows its default
// name, a renamed one shows the parent-chosen name, no rebuild needed.

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildSetupPageHtml(): string {
  const deviceName = escHtml(os.hostname())
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${deviceName} — WiFi Setup</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #eee;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem 1rem 3rem;
    }
    .hero { font-size: 3.5rem; margin-bottom: .5rem; }
    h1   { font-size: 1.6rem; font-weight: 700; }
    .sub { color: #8899aa; font-size: .9rem; margin-bottom: 2rem; }

    .card {
      background: #0f3460;
      border-radius: 14px;
      padding: 1.4rem 1.4rem 1.6rem;
      width: 100%; max-width: 420px;
      box-shadow: 0 6px 24px rgba(0,0,0,.4);
    }
    .card + .card { margin-top: 1rem; }

    .card-title {
      font-size: .75rem;
      font-weight: 600;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: #8899aa;
      margin-bottom: .9rem;
    }

    /* Network list */
    .net-list { list-style: none; display: flex; flex-direction: column; gap: .35rem; }
    .net-item {
      display: flex; align-items: center; gap: .75rem;
      padding: .65rem .75rem;
      border-radius: 9px;
      cursor: pointer;
      transition: background .15s;
      border: 2px solid transparent;
    }
    .net-item:hover  { background: rgba(255,255,255,.07); }
    .net-item.active { background: rgba(233,69,96,.15); border-color: #e94560; }
    .net-signal { font-size: 1rem; width: 1.4rem; text-align: center; flex-shrink: 0; }
    .net-ssid   { flex: 1; font-size: .95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .net-lock   { font-size: .8rem; color: #8899aa; flex-shrink: 0; }
    .net-badge  {
      font-size: .65rem; font-weight: 700; letter-spacing: .05em;
      background: #e94560; color: #fff; border-radius: 4px;
      padding: 1px 5px; flex-shrink: 0;
    }

    .empty { color: #8899aa; text-align: center; padding: 1.2rem 0; font-size: .9rem; }

    /* Form */
    label { display: block; font-size: .75rem; font-weight: 600;
            letter-spacing: .06em; text-transform: uppercase;
            color: #8899aa; margin-bottom: .5rem; }
    .input-wrap { position: relative; margin-bottom: 1.1rem; }
    input[type=password], input[type=text] {
      width: 100%;
      padding: .75rem 2.8rem .75rem .9rem;
      background: #16213e;
      border: 1.5px solid #1e3a5f;
      border-radius: 9px;
      color: #fff;
      font-size: 1rem;
      outline: none;
      transition: border-color .2s;
    }
    input:focus { border-color: #e94560; }
    .eye {
      position: absolute; right: .75rem; top: 50%; transform: translateY(-50%);
      background: none; border: none; color: #8899aa;
      cursor: pointer; font-size: 1rem; padding: 0;
    }
    .selected-label { font-weight: 600; color: #fff; }

    /* Buttons */
    .btn {
      display: block; width: 100%;
      padding: .85rem;
      border: none; border-radius: 10px;
      font-size: 1rem; font-weight: 700;
      cursor: pointer; transition: opacity .2s, transform .1s;
    }
    .btn:active  { transform: scale(.98); }
    .btn:disabled { opacity: .45; cursor: not-allowed; transform: none; }
    .btn-primary { background: #e94560; color: #fff; }
    .btn-ghost   { background: rgba(255,255,255,.08); color: #ccc; margin-top: .6rem; }

    /* Status banners */
    .status {
      margin-top: 1rem;
      padding: .8rem 1rem;
      border-radius: 9px;
      font-size: .9rem;
      line-height: 1.4;
    }
    .status-info    { background: #122840; color: #7cc8ff; }
    .status-success { background: #0d2e1a; color: #5de080; }
    .status-error   { background: #2d0f14; color: #ff7a8a; }
  </style>
</head>
<body>
  <div class="hero">⏰</div>
  <h1>${deviceName}</h1>
  <p class="sub">WiFi Setup</p>

  <!-- Step 1: pick a network -->
  <div class="card" id="card-scan">
    <p class="card-title">Select your WiFi network</p>
    <div id="net-container">
      <p class="empty">Scanning…</p>
    </div>
    <button class="btn btn-ghost" onclick="loadNetworks()" style="margin-top:.8rem">↻ Refresh</button>
  </div>

  <!-- Step 2: enter password + connect -->
  <div class="card" id="card-pwd" style="display:none">
    <p class="card-title">Connect to <span class="selected-label" id="sel-ssid"></span></p>
    <label for="pwd-input">Password</label>
    <div class="input-wrap">
      <input type="password" id="pwd-input"
             placeholder="Leave empty for open networks"
             autocomplete="current-password">
      <button class="eye" onclick="togglePwd()" title="Show / hide">👁</button>
    </div>
    <button class="btn btn-primary" id="connect-btn" onclick="doConnect()">Connect</button>
    <div id="status-area"></div>
  </div>

  <script>
    let selectedSsid = null;
    let selectedOpen = false;

    // ── helpers ──────────────────────────────────────────────────────────────
    function esc(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function signal(n) {
      if (n >= 75) return '▂▄▆█';
      if (n >= 50) return '▂▄▆·';
      if (n >= 25) return '▂▄··';
      return '▂···';
    }
    function setStatus(html, cls) {
      document.getElementById('status-area').innerHTML =
        html ? \`<div class="status \${cls}">\${html}</div>\` : '';
    }
    function togglePwd() {
      const el = document.getElementById('pwd-input');
      el.type = el.type === 'password' ? 'text' : 'password';
    }

    // ── network scan ─────────────────────────────────────────────────────────
    async function loadNetworks() {
      const container = document.getElementById('net-container');
      container.innerHTML = '<p class="empty">Scanning…</p>';
      try {
        const res  = await fetch('/api/wifi/networks');
        const nets = await res.json();
        if (!Array.isArray(nets) || !nets.length) {
          container.innerHTML = '<p class="empty">No networks found — try refreshing.</p>';
          return;
        }
        const ul = document.createElement('ul');
        ul.className = 'net-list';
        for (const net of nets) {
          const li = document.createElement('li');
          li.className = 'net-item' + (net.ssid === selectedSsid ? ' active' : '');
          li.dataset.ssid = net.ssid;
          li.innerHTML = \`
            <span class="net-signal">\${signal(net.signal)}</span>
            <span class="net-ssid">\${esc(net.ssid)}</span>
            \${net.inUse ? '<span class="net-badge">connected</span>' : ''}
            <span class="net-lock">\${net.security !== 'Open' ? '🔒' : ''}</span>
          \`;
          li.onclick = () => pick(net);
          ul.appendChild(li);
          if (net.inUse && !selectedSsid) pick(net, false);
        }
        container.innerHTML = '';
        container.appendChild(ul);
      } catch {
        container.innerHTML = '<p class="empty" style="color:#ff7a8a">Scan failed — try refreshing.</p>';
      }
    }

    function pick(net, scroll = true) {
      selectedSsid = net.ssid;
      selectedOpen = net.security === 'Open';
      document.querySelectorAll('.net-item').forEach(el => {
        el.classList.toggle('active', el.dataset.ssid === net.ssid);
      });
      document.getElementById('sel-ssid').textContent = net.ssid;
      document.getElementById('card-pwd').style.display = 'block';
      setStatus('', '');
      if (scroll) {
        setTimeout(() =>
          document.getElementById('card-pwd').scrollIntoView({ behavior: 'smooth' }), 80);
      }
    }

    // ── connect ───────────────────────────────────────────────────────────────
    async function doConnect() {
      if (!selectedSsid) return;
      const password = document.getElementById('pwd-input').value;
      const btn = document.getElementById('connect-btn');
      btn.disabled = true;
      btn.textContent = 'Connecting…';
      setStatus('Connecting to ' + esc(selectedSsid) + ' — this may take 10–20 s…', 'status-info');
      try {
        const res  = await fetch('/api/wifi/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ssid: selectedSsid, password }),
        });
        const data = await res.json();
        if (res.ok) {
          setStatus('✓ Connected! The clock is rebooting — you can close this page.', 'status-success');
          btn.textContent = 'Done ✓';
        } else {
          setStatus('✗ ' + esc(data.error || 'Connection failed. Check the password and try again.'), 'status-error');
          btn.disabled = false;
          btn.textContent = 'Try Again';
        }
      } catch {
        setStatus('✗ No response — the clock may have already rebooted. Try reconnecting your phone to your home WiFi.', 'status-error');
        btn.disabled = false;
        btn.textContent = 'Try Again';
      }
    }

    // ── boot ──────────────────────────────────────────────────────────────────
    loadNetworks();
  </script>
</body>
</html>
`
}
