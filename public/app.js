const { useState, useEffect, useRef } = React;

// ── API ───────────────────────────────────────────────────────────────────────
const API = {
  token: () => localStorage.getItem('token'),
  headers: () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${API.token()}` }),
  async req(method, path, body) {
    const res = await fetch(`/api${path}`, {
      method, headers: API.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  get: (p) => API.req('GET', p),
  post: (p, b) => API.req('POST', p, b),
  patch: (p, b) => API.req('PATCH', p, b),
  del: (p) => API.req('DELETE', p),
};

// ── Router ────────────────────────────────────────────────────────────────────
function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const h = () => setPath(window.location.pathname);
    window.addEventListener('popstate', h);
    return () => window.removeEventListener('popstate', h);
  }, []);
  const navigate = (to) => { window.history.pushState({}, '', to); setPath(to); };
  return { path, navigate };
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (API.token()) {
      API.get('/auth/me').then(setUser).catch(() => localStorage.removeItem('token')).finally(() => setLoading(false));
    } else setLoading(false);
  }, []);
  const login = async (email, password) => {
    const d = await API.post('/auth/login', { email, password });
    localStorage.setItem('token', d.token); setUser(d.user); return d;
  };
  const register = async (email, password) => {
    const d = await API.post('/auth/register', { email, password });
    localStorage.setItem('token', d.token); setUser(d.user); return d;
  };
  const logout = () => { localStorage.removeItem('token'); setUser(null); };
  const refreshUser = async () => { const u = await API.get('/auth/me'); setUser(u); return u; };
  return { user, loading, login, register, logout, refreshUser };
}

// ── UI Primitives ─────────────────────────────────────────────────────────────
const Spinner = () => React.createElement('div', { className: 'spinner' });
const Alert = ({ type = 'error', children }) => React.createElement('div', { className: `alert alert-${type}` }, children);

function CopyBox({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return React.createElement('div', { className: 'copy-box' },
    React.createElement('span', { className: 'copy-box-text', title: text }, text),
    React.createElement('button', { onClick: copy }, copied ? '✓' : 'Copy')
  );
}

function Modal({ title, onClose, children }) {
  return React.createElement('div', { className: 'modal-overlay', onClick: e => e.target === e.currentTarget && onClose() },
    React.createElement('div', { className: 'modal' },
      React.createElement('div', { className: 'flex-between mb-4' },
        React.createElement('h2', { className: 'modal-title', style: { margin: 0 } }, title),
        React.createElement('button', { onClick: onClose, style: { background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer' } }, '×')
      ),
      children
    )
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav({ user, logout, navigate }) {
  const roleBadge = user?.role === 'site_owner'
    ? React.createElement('span', { className: 'badge badge-yellow', style: { fontSize: 11 } }, '★ Owner')
    : user?.role === 'admin'
    ? React.createElement('span', { className: 'badge badge-purple', style: { fontSize: 11 } }, '⚙ Admin')
    : null;

  return React.createElement('nav', { className: 'nav' },
    React.createElement('div', { className: 'nav-logo', onClick: () => navigate('/'), style: { cursor: 'pointer' } },
      'rslvd', React.createElement('span', null, '.net')
    ),
    React.createElement('div', { className: 'nav-links' },
      user ? [
        roleBadge,
        (user.role === 'site_owner' || user.role === 'admin') &&
          React.createElement('button', { key: 'adm', className: 'btn btn-secondary btn-sm', onClick: () => navigate('/admin') }, 'Admin'),
        React.createElement('button', { key: 'dash', className: 'btn btn-secondary btn-sm', onClick: () => navigate('/dashboard') }, 'Dashboard'),
        React.createElement('button', { key: 'acct', className: 'btn btn-secondary btn-sm', onClick: () => navigate('/account') }, '⚙️ Account'),
        React.createElement('button', { key: 'out', className: 'btn btn-secondary btn-sm', onClick: () => { logout(); navigate('/'); } }, 'Sign out'),
      ] : [
        React.createElement('button', { key: 'in', className: 'btn btn-secondary btn-sm', onClick: () => navigate('/login') }, 'Sign in'),
        React.createElement('button', { key: 'up', className: 'btn btn-primary btn-sm', onClick: () => navigate('/register') }, 'Free signup'),
      ]
    )
  );
}

// ── Landing ───────────────────────────────────────────────────────────────────
function Landing({ navigate }) {
  const plans = [
    { key: 'free',       name: 'Free',     price: '$0',    period: 'forever',    hosts: 1,  tunnels: 1,  highlight: false },
    { key: 'monthly',    name: 'Monthly',  price: '$0.99', period: '/month',      hosts: 3,  tunnels: 3,  highlight: false },
    { key: 'semi_annual',name: '6 Months', price: '$4.99', period: '/6 months',   hosts: 10, tunnels: 10, highlight: false },
    { key: 'annual',     name: 'Annual',   price: '$8.99', period: '/year',       hosts: 25, tunnels: 25, highlight: true  },
  ];

  const features = [
    { icon: '🌐', title: 'Dynamic DNS when you have a public IP', desc: 'Point a permanent rslvd.net subdomain at your changing home or office IP. Works with standard DynDNS-compatible clients.' },
    { icon: '🚇', title: 'CGNAT tunnel when port forwarding fails', desc: 'If your ISP uses carrier-grade NAT, mobile broadband, or a locked-down router, run one command and tunnel traffic to your service.' },
    { icon: '🏠', title: 'Permanent subdomains', desc: 'Use stable names like home.rslvd.net, nas.rslvd.net, or camera.rslvd.net instead of random temporary URLs.' },
    { icon: '📡', title: 'Router native', desc: 'Install directly on OpenWRT and DD-WRT. Built for routers, homelabs, NAS boxes, and always-on devices.' },
    { icon: '🔗', title: 'Drop-in DynDNS compatibility', desc: 'Paste the update URL into Asus, Synology, Ubiquiti, pfSense, OPNsense, and other DDNS clients.' },
    { icon: '🔒', title: 'Rotatable tokens', desc: 'Each hostname and tunnel gets its own token, so you can revoke or rotate access without rebuilding your account.' },
    { icon: '💻', title: 'Runs almost anywhere', desc: 'Linux, macOS, Windows, Android/Termux, OpenWRT, DD-WRT, ARM, MIPS, and x86 builds are available.' },
    { icon: '⚡', title: 'Live in minutes', desc: 'Create an account, choose a name, copy one command, and test your public URL before your coffee gets cold.' },
  ];

  const useCases = [
    { icon: '🏡', title: 'Home Assistant', desc: 'Reach your Home Assistant dashboard from anywhere, even if your ISP blocks inbound connections.' },
    { icon: '🧪', title: 'Homelab & Proxmox', desc: 'Expose Proxmox, dashboards, Jellyfin, Immich, Nextcloud, Grafana, or internal tools on stable subdomains.' },
    { icon: '💾', title: 'NAS & file access', desc: 'Give Synology, QNAP, TrueNAS, or self-hosted storage a permanent remote address without buying a static IP.' },
    { icon: '📹', title: 'IP cameras & NVRs', desc: 'Access cameras and NVRs remotely through a predictable hostname instead of fighting router rules.' },
    { icon: '🛠️', title: 'Dev demos', desc: 'Share a local app or webhook endpoint with clients and teammates without random URLs or temporary sessions.' },
    { icon: '🌍', title: 'Remote admin', desc: 'Reach SSH, RDP, VNC, router panels, and office services through a tunnel when VPNs or port forwarding are not practical.' },
  ];

  const faqs = [
    { q: 'What is CGNAT?', a: 'Carrier-Grade NAT is when your ISP shares a single public IP across many customers. Port forwarding doesn\'t work because you don\'t actually own the public IP. Our tunnel bypasses this entirely.' },
    { q: 'How is this different from ngrok?', a: 'rslvd.net gives you a permanent subdomain (not a random URL), supports WebSockets, works on routers and Android, has no session time limits, and costs a fraction of the price.' },
    { q: 'Does the tunnel support HTTPS?', a: 'Yes. rslvd.net serves tunnel subdomains over HTTPS at the public edge. For true end-to-end encryption all the way to your device, run HTTPS on your origin service too.' },
    { q: 'Can I run multiple tunnels?', a: 'Yes. Free tier gets 1 tunnel. Paid plans scale up to 25. Each tunnel gets its own subdomain and token.' },
    { q: 'Does it work on OpenWRT / DD-WRT?', a: 'Yes — dedicated one-line installers for both. Auto-detects your router\'s architecture (MIPS, ARM, x86) and persistent storage location.' },
  ];

  const [openFaq, setOpenFaq] = React.useState(null);

  return React.createElement('div', null,




     // ── Hero ──────────────────────────────────────────────────────────────────
    React.createElement('div', { className: 'hero' },
      React.createElement('div', {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 16px',
          background: 'var(--accent-bg)',
          border: '1px solid rgba(108,99,255,0.3)',
          borderRadius: 999,
          fontSize: 13,
          color: 'var(--accent2)',
          marginBottom: 24
        }
      },
        '⚡ Dynamic DNS + CGNAT tunnels — free tier included'
      ),

      React.createElement('h1', null,
        'Get back into your home network',
        React.createElement('br'),
        React.createElement('span', { style: { color: 'var(--accent2)' } }, 'even behind CGNAT.')
      ),

      React.createElement('p', null,
        'rslvd.net gives you a permanent ',
        React.createElement('strong', null, 'yourname.rslvd.net'),
        ' address, automatic Dynamic DNS, and one-command tunnels for Home Assistant, routers, NAS boxes, cameras, Proxmox, SSH, and local web apps.'
      ),

      React.createElement('div', {
        style: {
          display: 'flex',
          gap: 12,
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: 28
        }
      },
        React.createElement('button', {
          className: 'btn btn-primary btn-lg',
          onClick: () => navigate('/register')
        }, 'Create free account →'),

        React.createElement('button', {
          className: 'btn btn-secondary btn-lg',
          onClick: () => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })
        }, 'See pricing')
      ),

      React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: '8px 10px',
          marginBottom: 36
        }
      },
        ...[
          'No static IP required',
          'Works when port forwarding fails',
          'Router + NAS friendly'
        ].map(item =>
          React.createElement('span', {
            key: item,
            style: {
              fontSize: 13,
              color: 'var(--text2)',
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 999,
              padding: '7px 12px'
            }
          }, item)
        )
      ),

      React.createElement('div', {
        style: {
          maxWidth: 640,
          margin: '0 auto',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '12px 16px',
          textAlign: 'left'
        }
      },
        React.createElement('div', {
          style: {
            fontSize: 11,
            color: 'var(--text3)',
            marginBottom: 6,
            letterSpacing: 0.5,
            textTransform: 'uppercase'
          }
        }, 'Start a tunnel in one command'),

        React.createElement(CopyBox, {
          text: 'curl -fsSL https://rslvd.net/install.sh | bash'
        }),

        React.createElement('div', {
          style: {
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid var(--border)'
          }
        },
          React.createElement('div', {
            style: {
              fontSize: 11,
              color: 'var(--text3)',
              marginBottom: 8,
              letterSpacing: 0.5,
              textTransform: 'uppercase'
            }
          }, 'Step-by-step setup guides'),
          React.createElement('div', {
            style: {
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap'
            }
          },
            React.createElement('a', {
              href: '/tutorials/linux/index.html',
              className: 'btn btn-secondary btn-sm',
              style: { textDecoration: 'none' }
            }, '🐧 Linux tutorial'),
            React.createElement('a', {
              href: '/tutorials/windows/index.html',
              className: 'btn btn-secondary btn-sm',
              style: { textDecoration: 'none' }
            }, '🪟 Windows tutorial')
          )
        )
      )
    ),

    // ── Compatibility strip ────────────────────────────────────────────────────
    React.createElement('div', { style: { borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '18px 24px', marginBottom: 80 } },
      React.createElement('div', { style: { maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '10px 32px' } },
        React.createElement('span', { style: { fontSize: 12, color: 'var(--text3)', letterSpacing: 0.5, textTransform: 'uppercase' } }, 'Works with'),
        ...['Asus Router', 'Synology NAS', 'Ubiquiti', 'pfSense', 'DD-WRT', 'OpenWRT', 'Home Assistant', 'Proxmox'].map(name =>
          React.createElement('span', { key: name, style: { fontSize: 13, color: 'var(--text2)', fontWeight: 500 } }, name)
        )
      )
    ),

    // ── DDNS vs CGNAT explainer ───────────────────────────────────────────────
    React.createElement('div', { style: { maxWidth: 980, margin: '0 auto 80px', padding: '0 24px' } },
      React.createElement('div', {
        style: {
          background: 'linear-gradient(135deg, rgba(108,99,255,0.12), rgba(0,212,255,0.06))',
          border: '1px solid rgba(108,99,255,0.25)',
          borderRadius: 16,
          padding: 28
        }
      },
        React.createElement('h2', { style: { textAlign: 'center', fontSize: 28, marginBottom: 10 } },
          'DDNS updates your IP. rslvd.net gets you reachable.'
        ),
        React.createElement('p', { style: { textAlign: 'center', color: 'var(--text2)', maxWidth: 720, margin: '0 auto 28px', lineHeight: 1.7 } },
          'Classic Dynamic DNS works when your router has a real public IP. But if your ISP uses CGNAT, port forwarding will not work because inbound traffic never reaches your router. rslvd.net gives you both paths: DDNS when it works, and a tunnel when it does not.'
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 } },
          React.createElement('div', { style: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 } },
            React.createElement('div', { style: { fontSize: 28, marginBottom: 10 } }, '🌐'),
            React.createElement('h3', { style: { fontSize: 16, marginBottom: 8 } }, 'Have a public IP?'),
            React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, margin: 0 } },
              'Use rslvd.net like a classic DynDNS provider. Paste your update URL into your router, NAS, or DDNS client.'
            )
          ),
          React.createElement('div', { style: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 } },
            React.createElement('div', { style: { fontSize: 28, marginBottom: 10 } }, '🚇'),
            React.createElement('h3', { style: { fontSize: 16, marginBottom: 8 } }, 'Behind CGNAT?'),
            React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, margin: 0 } },
              'Run the tunnel client. Your device connects out to rslvd.net, then your permanent subdomain routes traffic back in.'
            )
          ),
          React.createElement('div', { style: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 } },
            React.createElement('div', { style: { fontSize: 28, marginBottom: 10 } }, '📡'),
            React.createElement('h3', { style: { fontSize: 16, marginBottom: 8 } }, 'Want it always on?'),
            React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, margin: 0 } },
              'Install on OpenWRT, DD-WRT, Linux, or a small always-on box so your home services stay reachable.'
            )
          )
        )
      )
    ),

    // ── Use cases ─────────────────────────────────────────────────────────────
    React.createElement('div', { style: { maxWidth: 1000, margin: '0 auto 80px', padding: '0 24px' } },
      React.createElement('h2', { style: { textAlign: 'center', fontSize: 28, marginBottom: 8 } }, 'Built for real-world use cases'),
      React.createElement('p', { style: { textAlign: 'center', color: 'var(--text2)', marginBottom: 40 } }, 'Whether you\'re a tinkerer, developer, or IT admin — rslvd.net has you covered.'),
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 } },
        ...useCases.map(u => React.createElement('div', { key: u.title, className: 'card' },
          React.createElement('div', { style: { fontSize: 32, marginBottom: 12 } }, u.icon),
          React.createElement('h3', { style: { marginBottom: 8, fontSize: 16 } }, u.title),
          React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } }, u.desc)
        ))
      )
    ),

    // ── Features grid ─────────────────────────────────────────────────────────
    React.createElement('div', { style: { background: 'var(--bg2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '80px 24px', marginBottom: 80 } },
      React.createElement('div', { style: { maxWidth: 1000, margin: '0 auto' } },
        React.createElement('h2', { style: { textAlign: 'center', fontSize: 28, marginBottom: 8 } }, 'Everything you need, nothing you don\'t'),
        React.createElement('p', { style: { textAlign: 'center', color: 'var(--text2)', marginBottom: 48 } }, 'A complete toolkit for exposing local services to the internet.'),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 } },
          ...features.map(f => React.createElement('div', { key: f.title, style: { padding: '20px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10 } },
            React.createElement('div', { style: { fontSize: 26, marginBottom: 10 } }, f.icon),
            React.createElement('h3', { style: { marginBottom: 8, fontSize: 15 } }, f.title),
            React.createElement('p', { style: { color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 } }, f.desc)
          ))
        )
      )
    ),

    // ── Pricing ───────────────────────────────────────────────────────────────
    React.createElement('div', { id: 'pricing', style: { textAlign: 'center', marginBottom: 80, padding: '0 24px' } },
      React.createElement('h2', { style: { fontSize: 28, marginBottom: 8 } }, 'Remote access for less than a static IP'),
      React.createElement('p', { style: { color: 'var(--text2)', marginBottom: 40 } }, 'Start free. Upgrade when your homelab grows. Annual gives you 25 hostnames and 25 tunnels for $8.99/year.'),
      React.createElement('div', { className: 'pricing-grid' },
        plans.map(p => React.createElement('div', { key: p.key, className: `pricing-card${p.highlight ? ' popular' : ''}` },
          p.highlight && React.createElement('div', { className: 'popular-badge' }, p.key === 'annual' ? 'Best value' : 'Popular'),
          React.createElement('h3', { style: { color: 'var(--text2)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 } }, p.name),
          React.createElement('div', { className: 'price-amount' }, p.price),
          React.createElement('div', { className: 'price-period' }, p.period),
          React.createElement('ul', { className: 'price-features' },
            React.createElement('li', null, `${p.hosts} subdomain${p.hosts > 1 ? 's' : ''}`),
            React.createElement('li', null, `${p.tunnels} CGNAT tunnel${p.tunnels > 1 ? 's' : ''}`),
            React.createElement('li', null, 'WebSocket support'),
            React.createElement('li', null, 'IPv4 + IPv6'),
            React.createElement('li', null, 'DynDNS compatible'),
            p.key === 'free' && React.createElement('li', null, 'No credit card')
          ),
          React.createElement('button', { className: 'btn btn-primary w-full', onClick: () => navigate('/register') },
            p.key === 'free' ? 'Start free' : 'Get started'
          )
        ))
      )
    ),

    // ── DDNS quick-setup ──────────────────────────────────────────────────────
    React.createElement('div', { style: { maxWidth: 720, margin: '0 auto 80px', padding: '0 24px' } },
      React.createElement('div', { className: 'card', style: { textAlign: 'center' } },
        React.createElement('h2', { style: { fontSize: 20, marginBottom: 6 } }, '🔗 Router DDNS — paste and go'),
        React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, marginBottom: 20 } }, 'Add this URL to your router\'s DDNS settings. Your IP updates automatically, forever.'),
        React.createElement(CopyBox, { text: 'https://rslvd.net/api/update?key=YOUR_UPDATE_KEY&ip=auto' }),
        React.createElement('p', { style: { color: 'var(--text3)', fontSize: 12, marginTop: 10 } }, 'Replace YOUR_UPDATE_KEY with the key from your dashboard. Compatible with any DynDNS client.')
      )
    ),

    // ── FAQ ───────────────────────────────────────────────────────────────────
    React.createElement('div', { style: { maxWidth: 720, margin: '0 auto 80px', padding: '0 24px' } },
      React.createElement('h2', { style: { fontSize: 24, marginBottom: 32, textAlign: 'center' } }, 'Frequently asked questions'),
      ...faqs.map((f, i) => React.createElement('div', { key: i, style: { borderBottom: '1px solid var(--border)', marginBottom: 0 } },
        React.createElement('button', {
          onClick: () => setOpenFaq(openFaq === i ? null : i),
          style: { width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', color: 'var(--text)', fontFamily: 'Inter, sans-serif', fontSize: 15, fontWeight: 500 }
        },
          f.q,
          React.createElement('span', { style: { fontSize: 18, color: 'var(--text3)', transition: 'transform 0.2s', transform: openFaq === i ? 'rotate(45deg)' : 'none' } }, '+')
        ),
        openFaq === i && React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.7, paddingBottom: 16, margin: 0 } }, f.a)
      ))
    ),

    // ── Bottom CTA ────────────────────────────────────────────────────────────
    React.createElement('div', { style: { textAlign: 'center', padding: '80px 24px', background: 'radial-gradient(ellipse 60% 60% at 50% 100%, rgba(108,99,255,0.12), transparent)' } },
      React.createElement('h2', { style: { fontSize: 32, marginBottom: 12 } }, 'Stop fighting port forwarding.'),
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 16, marginBottom: 32 } }, 'Create a free permanent subdomain, test DDNS, or start a CGNAT-safe tunnel in minutes. No credit card required.'),
      React.createElement('button', { className: 'btn btn-primary btn-lg', onClick: () => navigate('/register') }, 'Create your free account →')
    ),

    // ── Footer ────────────────────────────────────────────────────────────────
    React.createElement('footer', { style: { borderTop: '1px solid var(--border)', padding: '32px 24px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 } },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap', marginBottom: 16 } },
        React.createElement('a', { href: '#pricing', onClick: e => { e.preventDefault(); document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }); }, style: { color: 'var(--text3)', textDecoration: 'none' } }, 'Pricing'),
        React.createElement('a', { href: '/login', onClick: e => { e.preventDefault(); navigate('/login'); }, style: { color: 'var(--text3)', textDecoration: 'none' } }, 'Login'),
        React.createElement('a', { href: '/register', onClick: e => { e.preventDefault(); navigate('/register'); }, style: { color: 'var(--text3)', textDecoration: 'none' } }, 'Register'),
        React.createElement('a', { href: 'https://rslvd.net/dl/rslvd-tunnel-linux-amd64', style: { color: 'var(--text3)', textDecoration: 'none' } }, 'Downloads'),
        React.createElement('a', { href: '/terms', onClick: e => { e.preventDefault(); navigate('/terms'); }, style: { color: 'var(--text3)', textDecoration: 'none' } }, 'Terms'),
        React.createElement('a', { href: '/privacy', onClick: e => { e.preventDefault(); navigate('/privacy'); }, style: { color: 'var(--text3)', textDecoration: 'none' } }, 'Privacy')
      ),
      '© 2026 rslvd.net — Dynamic DNS & CGNAT tunnels'
    )
  );
}

// ── Auth Pages ──────────────────────────────────────────────────────────────
function AuthPage({ mode, login, register, navigate }) {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      if (mode === 'register') {
        if (pass !== pass2) { setError('Passwords do not match'); setLoading(false); return; }
        if (pass.length < 8) { setError('Password must be at least 8 characters'); setLoading(false); return; }
        if (!tosAccepted) { setError('You must accept the Terms of Service to create an account'); setLoading(false); return; }
        await register(email, pass);
        navigate('/dashboard');
      } else {
        const d = await API.post('/auth/login', { email, password: pass, totp_code: needTotp ? totpCode : undefined });
        if (d.requireTotp) { setNeedTotp(true); setLoading(false); return; }
        localStorage.setItem('token', d.token);
        window.location.href = '/dashboard';
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return React.createElement('div', { className: 'auth-wrap' },
    React.createElement('div', { className: 'auth-card card' },
      React.createElement('h1', { className: 'auth-title' }, mode === 'login' ? (needTotp ? '🔐 Two-factor auth' : 'Welcome back') : 'Create free account'),
      React.createElement('p', { className: 'auth-subtitle' },
        needTotp ? 'Enter the 6-digit code from your authenticator app'
        : mode === 'login' ? 'Sign in to manage your hostnames and tunnels' : 'Free subdomain + CGNAT tunnel, no credit card needed'
      ),
      error && React.createElement(Alert, null, error),
      React.createElement('form', { onSubmit: submit },
        !needTotp && React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Email'),
          React.createElement('input', { className: 'input', type: 'email', value: email, onChange: e => setEmail(e.target.value), placeholder: 'you@example.com', required: true, autoFocus: !needTotp })
        ),
        !needTotp && React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Password'),
          React.createElement('input', { className: 'input', type: 'password', value: pass, onChange: e => setPass(e.target.value), placeholder: 'At least 8 characters', required: true })
        ),
        mode === 'register' && React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Confirm password'),
          React.createElement('input', { className: 'input', type: 'password', value: pass2, onChange: e => setPass2(e.target.value), placeholder: '••••••••', required: true })
        ),
        mode === 'register' && React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10, margin: '12px 0 4px' } },
          React.createElement('input', { type: 'checkbox', id: 'tos', checked: tosAccepted, onChange: e => setTosAccepted(e.target.checked), style: { marginTop: 3, flexShrink: 0, accentColor: 'var(--accent)' } }),
          React.createElement('label', { htmlFor: 'tos', style: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, cursor: 'pointer' } },
            'I agree to the ',
            React.createElement('a', { href: '/terms', onClick: e => { e.preventDefault(); navigate('/terms'); }, style: { color: 'var(--accent2)' } }, 'Terms of Service'),
            ' and ',
            React.createElement('a', { href: '/privacy', onClick: e => { e.preventDefault(); navigate('/privacy'); }, style: { color: 'var(--accent2)' } }, 'Privacy Policy')
          )
        ),
        needTotp && React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Authenticator code'),
          React.createElement('input', { className: 'input', type: 'text', inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6, value: totpCode, onChange: e => setTotpCode(e.target.value.replace(/\D/g, '')), placeholder: '000000', required: true, autoFocus: true, style: { letterSpacing: 8, fontSize: 22, textAlign: 'center' } })
        ),
        React.createElement('button', { className: 'btn btn-primary w-full', type: 'submit', disabled: loading, style: { marginTop: 8 } },
          loading ? React.createElement(Spinner) : (needTotp ? 'Verify' : mode === 'login' ? 'Sign in' : 'Create account — free')
        )
      ),
      React.createElement('div', { className: 'divider' }),
      mode === 'login' && React.createElement('p', { className: 'text-center text-sm text-muted', style: { marginBottom: 8 } },
        React.createElement('a', { href: '/forgot-password', onClick: e => { e.preventDefault(); navigate('/forgot-password'); }, style: { color: 'var(--text3)', fontSize: 13 } }, 'Forgot your password?')
      ),
      React.createElement('p', { className: 'text-center text-sm text-muted' },
        mode === 'login'
          ? React.createElement('span', null, "No account? ", React.createElement('a', { href: '#', onClick: e => { e.preventDefault(); navigate('/register'); } }, 'Sign up free'))
          : React.createElement('span', null, "Have an account? ", React.createElement('a', { href: '#', onClick: e => { e.preventDefault(); navigate('/login'); } }, 'Sign in'))
      )
    )
  );
}

// ── Forgot Password Page ──────────────────────────────────────────────────────
function ForgotPasswordPage({ navigate }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await API.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return React.createElement('div', { className: 'auth-wrap' },
    React.createElement('div', { className: 'auth-card card' },
      React.createElement('h1', { className: 'auth-title' }, '🔑 Forgot password'),
      sent
        ? React.createElement('div', null,
            React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.7, marginBottom: 20 } },
              "If an account exists for ", React.createElement('strong', null, email), ", we've sent a password reset link. Check your inbox (and spam folder)."
            ),
            React.createElement('button', { className: 'btn btn-secondary w-full', onClick: () => navigate('/login') }, '← Back to sign in')
          )
        : React.createElement('div', null,
            React.createElement('p', { className: 'auth-subtitle' }, "Enter your email and we'll send you a reset link."),
            error && React.createElement(Alert, null, error),
            React.createElement('form', { onSubmit: submit },
              React.createElement('div', { className: 'form-group' },
                React.createElement('label', { className: 'form-label' }, 'Email'),
                React.createElement('input', { className: 'input', type: 'email', value: email, onChange: e => setEmail(e.target.value), placeholder: 'you@example.com', required: true, autoFocus: true })
              ),
              React.createElement('button', { className: 'btn btn-primary w-full', type: 'submit', disabled: loading, style: { marginTop: 8 } },
                loading ? React.createElement(Spinner) : 'Send reset link'
              )
            ),
            React.createElement('div', { className: 'divider' }),
            React.createElement('p', { className: 'text-center text-sm text-muted' },
              React.createElement('a', { href: '#', onClick: e => { e.preventDefault(); navigate('/login'); }, style: { color: 'var(--text3)', fontSize: 13 } }, '← Back to sign in')
            )
          )
    )
  );
}

// ── Reset Password Page ───────────────────────────────────────────────────────
function ResetPasswordPage({ navigate }) {
  const token = new URLSearchParams(window.location.search).get('token');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setError(''); 
    if (pass !== pass2) { setError('Passwords do not match'); return; }
    if (pass.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await API.post('/auth/reset-password', { token, password: pass });
      setDone(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return React.createElement('div', { className: 'auth-wrap' },
    React.createElement('div', { className: 'auth-card card' },
      React.createElement('h1', { className: 'auth-title' }, '🔑 Reset password'),
      !token
        ? React.createElement('div', null,
            React.createElement(Alert, null, 'Invalid or missing reset token.'),
            React.createElement('button', { className: 'btn btn-secondary w-full', style: { marginTop: 12 }, onClick: () => navigate('/forgot-password') }, 'Request a new link')
          )
        : done
          ? React.createElement('div', null,
              React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, marginBottom: 20 } }, 'Your password has been reset. You can now sign in.'),
              React.createElement('button', { className: 'btn btn-primary w-full', onClick: () => navigate('/login') }, 'Sign in →')
            )
          : React.createElement('div', null,
              error && React.createElement(Alert, null, error),
              React.createElement('form', { onSubmit: submit },
                React.createElement('div', { className: 'form-group' },
                  React.createElement('label', { className: 'form-label' }, 'New password'),
                  React.createElement('input', { className: 'input', type: 'password', value: pass, onChange: e => setPass(e.target.value), placeholder: 'At least 8 characters', required: true, autoFocus: true })
                ),
                React.createElement('div', { className: 'form-group' },
                  React.createElement('label', { className: 'form-label' }, 'Confirm new password'),
                  React.createElement('input', { className: 'input', type: 'password', value: pass2, onChange: e => setPass2(e.target.value), placeholder: '••••••••', required: true })
                ),
                React.createElement('button', { className: 'btn btn-primary w-full', type: 'submit', disabled: loading, style: { marginTop: 8 } },
                  loading ? React.createElement(Spinner) : 'Set new password'
                )
              )
            )
    )
  );
}

// ── Support Page (user-facing) ────────────────────────────────────────────────
function SupportPage({ user, navigate }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setTickets(await API.get('/support')); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    try {
      await API.post('/support', { subject: subject.trim(), body: body.trim() });
      setSubject(''); setBody(''); setShowNew(false);
      await load();
    } catch (e) { alert(e.message); }
    finally { setSending(false); }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!reply.trim() || !viewing) return;
    setReplying(true);
    try {
      await API.post(`/support/${viewing.id}/reply`, { body: reply.trim() });
      setReply('');
      const t = await API.get(`/support/${viewing.id}`);
      setViewing(t);
      await load();
    } catch (e) { alert(e.message); }
    finally { setReplying(false); }
  };

  const relTime = (ts) => {
    const diff = Date.now() - new Date(ts);
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  if (loading) return React.createElement('div', { className: 'flex-center', style: { minHeight: 400 } }, React.createElement(Spinner));

  return React.createElement('div', { className: 'dashboard' },
    React.createElement('div', { className: 'dashboard-header' },
      React.createElement('div', null,
        React.createElement('h1', { style: { fontSize: 24, marginBottom: 4 } }, '🎫 Support'),
        React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14 } }, 'Create a ticket to get help from our team.')
      ),
      !showNew && !viewing && React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: () => setShowNew(true) }, 'New ticket')
    ),

    error && React.createElement(Alert, null, error),

    // List view
    !showNew && !viewing && React.createElement('div', null,
      tickets.length === 0
        ? React.createElement('div', { className: 'card', style: { textAlign: 'center', padding: 48, color: 'var(--text3)' } },
            React.createElement('div', { style: { fontSize: 32, marginBottom: 12 } }, '🎫'),
            'No tickets yet.',
            React.createElement('div', { style: { marginTop: 16 } },
              React.createElement('button', { className: 'btn btn-primary', onClick: () => setShowNew(true) }, 'Create your first ticket')
            )
          )
        : React.createElement('div', { className: 'card', style: { padding: 0, overflow: 'hidden' } },
            tickets.map((t, i) => React.createElement('div', {
              key: t.id,
              onClick: () => setViewing(t),
              style: { padding: '14px 18px', cursor: 'pointer', borderBottom: i < tickets.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }
            },
              React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                React.createElement('div', { style: { fontWeight: 500, fontSize: 15, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, t.subject),
                React.createElement('div', { style: { fontSize: 12, color: 'var(--text3)' } }, `#${t.id} · ${t.message_count || 0} messages · updated ${relTime(t.updated_at)}`)
              ),
              React.createElement('span', { style: { fontSize: 11, fontWeight: 600, color: { open: 'var(--accent)', answered: 'var(--green)', closed: 'var(--text3)' }[t.status], textTransform: 'uppercase' } }, t.status)
            ))
          )
    ),

    // New ticket form
    showNew && React.createElement('div', { className: 'card' },
      React.createElement('h3', { style: { marginBottom: 16 } }, 'New support ticket'),
      React.createElement('form', { onSubmit: handleCreate },
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Subject'),
          React.createElement('input', { className: 'input', value: subject, onChange: e => setSubject(e.target.value), placeholder: 'Brief summary of your issue', required: true, maxLength: 200 })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Message'),
          React.createElement('textarea', { className: 'input', rows: 6, value: body, onChange: e => setBody(e.target.value), placeholder: 'Describe your issue in detail...', required: true, style: { resize: 'vertical', fontFamily: 'Inter, sans-serif' } })
        ),
        React.createElement('div', { style: { display: 'flex', gap: 12, justifyContent: 'flex-end' } },
          React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: () => setShowNew(false) }, 'Cancel'),
          React.createElement('button', { type: 'submit', className: 'btn btn-primary', disabled: sending }, sending ? React.createElement(Spinner) : 'Submit ticket')
        )
      )
    ),

    // Thread view
    viewing && React.createElement('div', null,
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 } },
        React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: () => setViewing(null) }, '← All tickets'),
        React.createElement('span', { style: { fontSize: 11, fontWeight: 600, color: { open: 'var(--accent)', answered: 'var(--green)', closed: 'var(--text3)' }[viewing.status], textTransform: 'uppercase' } }, viewing.status)
      ),
      React.createElement('div', { className: 'card', style: { marginBottom: 16 } },
        React.createElement('h2', { style: { fontSize: 17, marginBottom: 4 } }, viewing.subject),
        React.createElement('div', { style: { fontSize: 12, color: 'var(--text3)' } }, `Ticket #${viewing.id} · Created ${relTime(viewing.created_at)}`)
      ),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 } },
        viewing.messages && viewing.messages.map(m => React.createElement('div', { key: m.id, style: { display: 'flex', gap: 12, justifyContent: m.is_staff ? 'flex-start' : 'flex-end' } },
          React.createElement('div', { style: { maxWidth: '80%', padding: '10px 14px', borderRadius: 10, fontSize: 13, lineHeight: 1.7, background: m.is_staff ? 'var(--accent-bg)' : 'var(--bg2)', border: m.is_staff ? '1px solid rgba(108,99,255,0.3)' : '1px solid var(--border)' } },
            React.createElement('div', { style: { fontSize: 11, color: 'var(--text3)', marginBottom: 4 } }, m.is_staff ? `🛡 Staff · ${relTime(m.created_at)}` : `👤 You · ${relTime(m.created_at)}`),
            React.createElement('div', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, m.body)
          )
        ))
      ),
      viewing.status !== 'closed' && React.createElement('form', { onSubmit: handleReply, className: 'card' },
        React.createElement('label', { style: { display: 'block', fontSize: 13, color: 'var(--text2)', marginBottom: 8 } }, 'Reply'),
        React.createElement('textarea', { className: 'input', rows: 4, value: reply, onChange: e => setReply(e.target.value), placeholder: 'Type your reply...', style: { resize: 'vertical', fontFamily: 'Inter, sans-serif', marginBottom: 12 } }),
        React.createElement('button', { type: 'submit', className: 'btn btn-primary btn-sm', disabled: replying }, replying ? React.createElement(Spinner) : 'Send reply')
      )
    )
  );
}

// ── Tunnel Modal ──────────────────────────────────────────────────────────────
function TunnelModal({ onClose, onCreated, user, existingTunnels }) {
  const [name, setName] = useState('');
  const [targetPort, setTargetPort] = useState('');
  const [protocol, setProtocol] = useState('tcp');
  const [isNested, setIsNested] = useState(false);
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canNest = user && (user.plan === 'annual' || user.role === 'site_owner' || user.role === 'admin');
  const topLevelTunnels = (existingTunnels || []).filter(t => !t.parent_tunnel_id);
  const BASE = 'rslvd.net';

  const selectedParent = topLevelTunnels.find(t => t.id === parentId);
  const fqdnPreview = name
    ? (isNested && selectedParent ? `${name}.${selectedParent.fqdn}` : `${name}.${BASE}`)
    : '';

  const presets = [
    { label: 'Web', port: 80 }, { label: 'HTTPS', port: 443 },
    { label: 'Dev', port: 3000 }, { label: 'Alt', port: 8080 },
    { label: 'Minecraft', port: 25565 }, { label: 'Custom', port: '' },
  ];

  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const body = { name: name.toLowerCase(), target_port: parseInt(targetPort), protocol };
      if (isNested && parentId) body.parent_id = parentId;
      const t = await API.post('/tunnels', body);
      onCreated(t);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return React.createElement(Modal, { title: '🚇 New tunnel', onClose },
    error && React.createElement(Alert, null, error),
    React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, marginBottom: 20 } },
      'Expose any local port to the internet — no SSH, no port-forwarding needed.'
    ),
    React.createElement('form', { onSubmit: submit },

      canNest && topLevelTunnels.length > 0 && React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, 'Tunnel type'),
        React.createElement('div', { style: { display: 'flex', gap: 8 } },
          React.createElement('button', { type: 'button', className: `btn btn-sm ${!isNested ? 'btn-primary' : 'btn-secondary'}`, onClick: () => setIsNested(false) }, '🌐 Top-level subdomain'),
          React.createElement('button', { type: 'button', className: `btn btn-sm ${isNested ? 'btn-primary' : 'btn-secondary'}`, onClick: () => setIsNested(true) }, '🔗 Nested subdomain')
        )
      ),

      isNested && React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, 'Parent tunnel'),
        React.createElement('select', {
          className: 'input', value: parentId, onChange: e => setParentId(e.target.value), required: true
        },
          React.createElement('option', { value: '' }, '— select a parent tunnel —'),
          topLevelTunnels.map(t => React.createElement('option', { key: t.id, value: t.id }, t.fqdn))
        )
      ),

      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, isNested ? 'Subdomain label' : 'Tunnel name'),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center' } },
          React.createElement('input', {
            className: 'input', value: name,
            onChange: e => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')),
            placeholder: isNested ? 'api' : 'mygame', required: true, autoFocus: true,
            style: { borderRadius: '8px 0 0 8px', borderRight: 'none' }
          }),
          React.createElement('span', {
            style: { padding: '10px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '0 8px 8px 0', color: 'var(--text2)', fontSize: 13, whiteSpace: 'nowrap' }
          }, isNested && selectedParent ? `.${selectedParent.fqdn}` : `.${BASE}`)
        ),
        fqdnPreview && React.createElement('div', { style: { fontSize: 12, color: 'var(--accent2)', marginTop: 6, fontFamily: 'monospace' } },
          '→ ', fqdnPreview
        )
      ),

      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, 'Port to expose'),
        React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 } },
          presets.map(p => React.createElement('button', {
            key: p.label, type: 'button',
            className: `btn btn-secondary btn-sm${targetPort == p.port && p.port ? ' active' : ''}`,
            style: { fontSize: 12 },
            onClick: () => p.port && setTargetPort(String(p.port))
          }, p.label + (p.port ? ` (${p.port})` : '')))
        ),
        React.createElement('input', { className: 'input', type: 'number', value: targetPort, onChange: e => setTargetPort(e.target.value), placeholder: 'or type any port...', required: true, min: 1, max: 65535 })
      ),

      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, 'Protocol'),
        React.createElement('div', { style: { display: 'flex', gap: 8 } },
          [
            { key: 'tcp', label: '🔌 TCP', desc: 'Standard tunnel for HTTP/WebSocket' },
            { key: 'udp', label: '📡 UDP', desc: 'For DNS, VoIP, games' },
            { key: 'dns2tcp', label: '🌊 DNS2TCP', desc: 'Tunnels TCP over DNS queries' }
          ].map(p => React.createElement('button', {
            key: p.key, type: 'button',
            className: `btn btn-sm ${protocol === p.key ? 'btn-primary' : 'btn-secondary'}`,
            onClick: () => setProtocol(p.key),
            title: p.desc,
            style: { flex: 1 }
          }, p.label))
        ),
        React.createElement('p', { style: { fontSize: 12, color: 'var(--text3)', marginTop: 6 } },
          protocol === 'tcp' && 'Works with HTTP, HTTPS, WebSockets, SSH, RDP — any TCP protocol.',
          protocol === 'udp' && 'For DNS servers, VoIP, game servers, or any UDP application. Requires UDP-compatible client.',
          protocol === 'dns2tcp' && 'Bypasses firewalls by encoding TCP data in DNS queries. Slow but works almost anywhere.'
        )
      ),

      React.createElement('div', { style: { display: 'flex', gap: 12, justifyContent: 'flex-end' } },
        React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: onClose }, 'Cancel'),
        React.createElement('button', { type: 'submit', className: 'btn btn-primary', disabled: loading },
          loading ? React.createElement(Spinner) : '🚀 Create tunnel'
        )
      )
    )
  );
}

// ── Tunnel Row (1-click UX) ───────────────────────────────────────────────────
function TunnelRow({ tunnel: t, onDelete, isNested }) {
  const [tab, setTab] = useState('client');
  const [showConnect, setShowConnect] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete tunnel ${t.name}?`)) return;
    setDeleting(true);
    try { await API.del(`/tunnels/${t.id}`); onDelete(t.id); }
    catch (err) { alert(err.message); setDeleting(false); }
  };

  const fqdn = t.fqdn || `${t.name}.rslvd.net`;
  const protocol = t.protocol || 'tcp';
  const publicUrl = `https://${fqdn}`;
  const localHost = t.target_host || 'localhost';
  
  // Protocol-specific connection commands
  const protocolFlag = protocol === 'udp' ? '-udp ' : protocol === 'dns2tcp' ? '-dns ' : '';
  const installCmd = `curl -fsSL https://rslvd.net/install.sh | bash`;
  const clientCmd = `rslvd-tunnel ${protocolFlag}${t.token} ${t.target_port}`;
  const winDlUrl = `https://rslvd.net/dl/rslvd-tunnel-windows-amd64.exe`;
  const winCmd = `.\\rslvd-tunnel-windows-amd64.exe ${protocolFlag}${t.token} ${t.target_port}`;
  const dockerCmd = `docker run --rm --network host ghcr.io/rslvd/tunnel ${protocolFlag}${t.token} ${t.target_port}`;

  return React.createElement('div', { className: 'card', style: { marginBottom: 8, marginLeft: isNested ? 24 : 0, borderLeft: isNested ? '3px solid var(--accent)' : undefined } },
    // Header
    React.createElement('div', { className: 'flex-between', style: { marginBottom: showConnect ? 16 : 0 } },
      React.createElement('div', null,
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          isNested && React.createElement('span', { style: { fontSize: 11, color: 'var(--accent)', fontWeight: 600, letterSpacing: 0.5 } }, '└ NESTED'),
          React.createElement('a', { href: publicUrl, target: '_blank', rel: 'noopener noreferrer', style: { fontWeight: 600, fontSize: 15, color: 'var(--text)', textDecoration: 'none' } }, fqdn)
        ),
        React.createElement('div', { style: { fontSize: 13, color: 'var(--text2)', marginTop: 2 } },
          protocol.toUpperCase(), ' ', `localhost:${t.target_port} → `, React.createElement('strong', null, publicUrl)
        )
      ),
      React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        React.createElement('span', { className: 'badge badge-purple', style: { fontSize: 10, textTransform: 'uppercase' } }, protocol),
        React.createElement('span', { className: `badge badge-${t.status === 'active' ? 'green' : 'yellow'}` }, t.status),
        React.createElement('button', {
          className: `btn btn-primary btn-sm`,
          onClick: () => setShowConnect(!showConnect)
        }, showConnect ? 'Hide' : '⚡ Connect'),
        React.createElement('button', { className: 'btn btn-danger btn-sm', onClick: handleDelete, disabled: deleting },
          deleting ? React.createElement(Spinner) : '×'
        )
      )
    ),

    // Connect panel
    showConnect && React.createElement('div', null,
      // Method tabs
      React.createElement('div', { style: { display: 'flex', gap: 0, marginBottom: 16, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', width: 'fit-content' } },
        [['client', '🐧 Linux / Mac / Termux'], ['win', '🪟 Windows'], ['docker', '🐳 Docker'], ['router', '📡 Routers']].map(([key, label]) =>
          React.createElement('button', {
            key, onClick: () => setTab(key),
            style: { padding: '7px 14px', background: tab === key ? 'var(--accent)' : 'var(--bg3)', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: tab === key ? '#fff' : 'var(--text2)', fontFamily: 'Inter, sans-serif' }
          }, label)
        )
      ),

      // Client tab
      tab === 'client' && React.createElement('div', null,
        React.createElement('div', { className: 'connect-step' },
          React.createElement('div', { className: 'step-num' }, '1'),
          React.createElement('div', null,
            React.createElement('div', { className: 'step-title' }, 'Install once'),
            React.createElement(CopyBox, { text: installCmd })
          )
        ),
        React.createElement('div', { className: 'connect-step' },
          React.createElement('div', { className: 'step-num' }, '2'),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { className: 'step-title' }, 'Start tunnel'),
            React.createElement(CopyBox, { text: clientCmd }),
            React.createElement('p', { style: { fontSize: 12, color: 'var(--text3)', marginTop: 6 } },
              `Your ${localHost}:${t.target_port} → `, React.createElement('a', { href: publicUrl, target: '_blank', style: { color: 'var(--accent2)' } }, publicUrl)
            )
          )
        )
      ),

      // Windows tab
      tab === 'win' && React.createElement('div', null,
        React.createElement('div', { className: 'connect-step' },
          React.createElement('div', { className: 'step-num' }, '1'),
          React.createElement('div', null,
            React.createElement('div', { className: 'step-title' }, 'Download the binary'),
            React.createElement('a', { href: winDlUrl, className: 'btn btn-secondary btn-sm', style: { display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4 } },
              '⬇ rslvd-tunnel-windows-amd64.exe'
            ),
            React.createElement('p', { style: { fontSize: 12, color: 'var(--text3)', marginTop: 6 } }, 'No install needed — just download and run. No SSH, no dependencies.')
          )
        ),
        React.createElement('div', { className: 'connect-step' },
          React.createElement('div', { className: 'step-num' }, '2'),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { className: 'step-title' }, 'Open PowerShell in the same folder and run'),
            React.createElement(CopyBox, { text: winCmd }),
            React.createElement('p', { style: { fontSize: 12, color: 'var(--text3)', marginTop: 6 } },
              'Exposes ', React.createElement('strong', null, `localhost:${t.target_port}`), ' → ', React.createElement('a', { href: publicUrl, target: '_blank', style: { color: 'var(--accent2)' } }, publicUrl), '. Auto-reconnects on drop.'
            )
          )
        )
      ),

      // Docker tab
      tab === 'docker' && React.createElement('div', null,
        React.createElement('div', { className: 'connect-step' },
          React.createElement('div', { className: 'step-num' }, '1'),
          React.createElement('div', null,
            React.createElement('div', { className: 'step-title' }, 'Run with Docker — zero install'),
            React.createElement(CopyBox, { text: dockerCmd }),
            React.createElement('p', { style: { fontSize: 12, color: 'var(--text3)', marginTop: 6 } }, 'Works on any OS with Docker. Add --restart=always to run on boot.')
          )
        )
      ),

      // Routers tab
      tab === 'router' && React.createElement('div', null,
        React.createElement('div', { className: 'connect-step' },
          React.createElement('div', { className: 'step-num' }, '1'),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { className: 'step-title' }, 'Install — SSH into your router and run the command for your firmware'),
            React.createElement('div', { style: { marginBottom: 8 } },
              React.createElement('div', { style: { fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 } }, '1a. OpenWRT'),
              React.createElement(CopyBox, { text: 'curl -fsSL https://rslvd.net/install-openwrt.sh | sh' })
            ),
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginBottom: 4 } }, '1b. DD-WRT'),
              React.createElement(CopyBox, { text: 'curl -fsSL https://rslvd.net/install-ddwrt.sh | sh' })
            )
          )
        ),
        React.createElement('div', { className: 'connect-step' },
          React.createElement('div', { className: 'step-num' }, '2'),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { className: 'step-title' }, 'Start the tunnel'),
            React.createElement(CopyBox, { text: clientCmd }),
            React.createElement('p', { style: { fontSize: 12, color: 'var(--text3)', marginTop: 6 } },
              'Exposes a service on your router\'s network → ', React.createElement('a', { href: publicUrl, target: '_blank', style: { color: 'var(--accent2)' } }, publicUrl)
            )
          )
        )
      ),

      React.createElement('div', { style: { marginTop: 12, padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8, fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 8 } },
        '🔗 Public URL: ',
        React.createElement('a', { href: publicUrl, target: '_blank', style: { color: 'var(--accent2)', fontWeight: 600 } }, publicUrl)
      )
    )
  );
}

// ── Add Host Modal ──────────────────────────────────────────────────────────────
function AddHostModal({ onClose, onCreated, user, existingHosts }) {
  const [hostname, setHostname] = useState('');
  const [mode, setMode] = useState('top');        // 'top' | 'nested'
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canNest = user?.plan === 'annual' || user?.role === 'site_owner';
  // Only top-level hosts can be parents
  const topLevelHosts = (existingHosts || []).filter(h => !h.parent_host_id);

  const preview = () => {
    if (!hostname) return '';
    if (mode === 'nested' && parentId) {
      const parent = topLevelHosts.find(h => h.id === parentId);
      return parent ? `${hostname}.${parent.fqdn}` : `${hostname}.<parent>.rslvd.net`;
    }
    return `${hostname}.rslvd.net`;
  };

  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const body = { hostname: hostname.toLowerCase() };
      if (mode === 'nested' && parentId) body.parent_id = parentId;
      const h = await API.post('/hosts', body);
      onCreated(h);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return React.createElement(Modal, { title: 'Add hostname', onClose },
    error && React.createElement(Alert, null, error),

    // Mode toggle (annual+ only)
    canNest && React.createElement('div', { style: { display: 'flex', gap: 0, marginBottom: 20, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', width: 'fit-content' } },
      [['top', '🌐 Top-level'], ['nested', '🔗 Nested (sub.host.rslvd.net)']].map(([key, label]) =>
        React.createElement('button', {
          key, type: 'button', onClick: () => { setMode(key); setHostname(''); },
          style: { padding: '8px 16px', background: mode === key ? 'var(--accent)' : 'var(--bg3)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: mode === key ? '#fff' : 'var(--text2)', fontFamily: 'Inter, sans-serif' }
        }, label)
      )
    ),

    React.createElement('form', { onSubmit: submit },

      // Nested: pick parent first
      mode === 'nested' && React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, 'Parent hostname'),
        topLevelHosts.length === 0
          ? React.createElement(Alert, { type: 'info' }, 'Create a top-level host first, then add nested ones under it.')
          : React.createElement('select', { className: 'input', value: parentId, onChange: e => setParentId(e.target.value), required: true },
              React.createElement('option', { value: '' }, 'Select a parent...'),
              topLevelHosts.map(h => React.createElement('option', { key: h.id, value: h.id }, h.fqdn))
            )
      ),

      // Subdomain label input
      (mode === 'top' || (mode === 'nested' && parentId)) && React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, mode === 'nested' ? 'Sub-label' : 'Subdomain'),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center' } },
          React.createElement('input', {
            className: 'input',
            value: hostname,
            onChange: e => setHostname(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')),
            placeholder: mode === 'nested' ? 'e.g. dev, staging, vpn' : 'myhome',
            required: true, autoFocus: true,
            style: { borderRadius: '8px 0 0 8px', borderRight: 'none' }
          }),
          React.createElement('span', { style: { padding: '10px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '0 8px 8px 0', color: 'var(--text2)', fontSize: 13, whiteSpace: 'nowrap' } },
            mode === 'nested' && parentId
              ? `.${(topLevelHosts.find(h => h.id === parentId) || {}).fqdn || 'parent.rslvd.net'}`
              : '.rslvd.net'
          )
        ),
        hostname && React.createElement('p', { className: 'form-hint', style: { color: 'var(--accent2)' } },
          '🔗 Result: ', React.createElement('strong', null, preview())
        )
      ),

      // Upgrade prompt if can't nest
      mode === 'nested' && !canNest && React.createElement(Alert, { type: 'info' },
        '🔒 Nested subdomains are available on the Annual plan.'
      ),

      React.createElement('div', { style: { display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 } },
        React.createElement('button', { type: 'button', className: 'btn btn-secondary', onClick: onClose }, 'Cancel'),
        React.createElement('button', { type: 'submit', className: 'btn btn-primary', disabled: loading || (mode === 'nested' && !parentId) },
          loading ? React.createElement(Spinner) : 'Create'
        )
      )
    )
  );
}

// ── Host Card ────────────────────────────────────────────────────────────────
function HostCard({ host: h, onDelete, onRegenKey, isNested }) {
  const [showKey, setShowKey] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detectedIp, setDetectedIp] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [manualIp, setManualIp] = useState(['', '', '', '']);
  const [showManualIp, setShowManualIp] = useState(false);

  const manualIpString = manualIp.every(o => o && o >= 0 && o <= 255) ? manualIp.join('.') : null;
  const updateUrl = `https://rslvd.net/api/update?key=${h.update_key}&ip=${manualIpString || detectedIp || h.ip_address || 'auto'}`;

  const handleDelete = async () => {
    if (!confirm(`Delete ${h.fqdn}?`)) return;
    setDeleting(true);
    try { await API.del(`/hosts/${h.id}`); onDelete(h.id); }
    catch (err) { alert(err.message); setDeleting(false); }
  };
  const handleRegen = async () => {
    if (!confirm('Rotate update key? Current DDNS config will stop working.')) return;
    try { const d = await API.post(`/hosts/${h.id}/regenerate-key`); onRegenKey(h.id, d.update_key); }
    catch (err) { alert(err.message); }
  };

  const detectIp = async () => {
    setDetecting(true);
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      setDetectedIp(data.ip);
      setShowManualIp(false);
    } catch (err) {
      alert('Failed to detect IP. Please try again.');
    } finally {
      setDetecting(false);
    }
  };

  const handleOctetChange = (idx, value) => {
    const num = parseInt(value, 10);
    if (value === '') {
      setManualIp(prev => { const next = [...prev]; next[idx] = ''; return next; });
      return;
    }
    if (isNaN(num) || num < 0 || num > 255) return;
    setManualIp(prev => { const next = [...prev]; next[idx] = num.toString(); return next; });
    // Auto-advance to next field if this one is full
    if (value.length >= 3 && idx < 3) {
      const nextInput = document.getElementById(`ip-${h.id}-${idx + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  return React.createElement('div', { className: 'card', style: { marginBottom: 8, marginLeft: isNested ? 24 : 0, borderLeft: isNested ? '3px solid var(--accent)' : undefined } },
    React.createElement('div', { className: 'flex-between', style: { marginBottom: 12 } },
      React.createElement('div', null,
        React.createElement('div', { style: { fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 } },
          isNested && React.createElement('span', { style: { fontSize: 11, color: 'var(--accent2)', fontWeight: 500 } }, '└─'),
          h.fqdn,
          isNested && React.createElement('span', { className: 'badge badge-purple', style: { fontSize: 10 } }, 'nested')
        ),
        React.createElement('div', { style: { fontSize: 13, color: 'var(--text2)', marginTop: 2 } },
          h.ip_address ? `IP: ${h.ip_address}` : 'No IP recorded yet'
        ),
        React.createElement('div', { style: { fontSize: 12, color: 'var(--text3)', marginTop: 2 } },
          h.last_updated ? `Last update: ${new Date(h.last_updated).toLocaleString()}` : 'Never updated'
        )
      ),
      React.createElement('button', { className: 'btn btn-danger btn-sm', onClick: handleDelete, disabled: deleting },
        deleting ? React.createElement(Spinner) : 'Delete'
      )
    ),
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
      React.createElement('label', { style: { fontSize: 12, color: 'var(--text3)' } }, 'Router DDNS URL'),
      React.createElement(CopyBox, { text: updateUrl }),
      React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
        React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: () => setShowKey(!showKey) }, showKey ? 'Hide key' : 'Show key'),
        React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: handleRegen }, 'Rotate key'),
        React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: detectIp, disabled: detecting }, detecting ? React.createElement(Spinner) : '🌐 Detect my IP'),
        React.createElement('button', { className: `btn btn-sm ${showManualIp ? 'btn-primary' : 'btn-secondary'}`, onClick: () => setShowManualIp(!showManualIp) }, '⌨️ Set IP')
      ),
      showManualIp && React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 } },
        React.createElement('span', { style: { fontSize: 12, color: 'var(--text2)' } }, 'Manual IP:'),
        [0, 1, 2, 3].map((idx) => React.createElement(React.Fragment, { key: idx },
          React.createElement('input', {
            id: `ip-${h.id}-${idx}`,
            type: 'text',
            inputMode: 'numeric',
            maxLength: 3,
            value: manualIp[idx],
            onChange: e => handleOctetChange(idx, e.target.value),
            style: { width: 44, textAlign: 'center', padding: '6px 4px', fontSize: 14, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)' }
          }),
          idx < 3 && React.createElement('span', { style: { color: 'var(--text2)', fontWeight: 'bold' } }, '.')
        ))
      ),
      showKey && React.createElement('code', { style: { fontSize: 12, color: 'var(--accent2)', wordBreak: 'break-all', background: 'var(--bg3)', padding: '8px 12px', borderRadius: 6 } }, h.update_key)
    )
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ user, navigate, refreshUser }) {
  const [hosts, setHosts] = useState([]);
  const [tunnels, setTunnels] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('hosts');
  const [showAddHost, setShowAddHost] = useState(false);
  const [showAddTunnel, setShowAddTunnel] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState('');
  const [portalLoading, setPortalLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      setMsg('Payment successful! Your subscription is now active.');
      setTimeout(() => refreshUser(), 2000);
      window.history.replaceState({}, '', '/dashboard');
    }
  }, []);

  useEffect(() => {
    Promise.all([API.get('/hosts'), API.get('/tunnels'), API.get('/billing/plans')])
      .then(([h, t, p]) => { setHosts(h); setTunnels(t); setPlans(p); })
      .finally(() => setLoading(false));
  }, []);

  const onHostCreated = h => { setHosts(x => [h, ...x]); setShowAddHost(false); };
  const onHostDeleted = id => setHosts(x => x.filter(h => h.id !== id));
  const onRegenKey = (id, key) => setHosts(x => x.map(h => h.id === id ? { ...h, update_key: key } : h));
  const onTunnelCreated = t => { setTunnels(x => [t, ...x]); setShowAddTunnel(false); };
  const onTunnelDeleted = id => setTunnels(x => x.filter(t => t.id !== id));

  const handleCheckout = async (planKey) => {
    setCheckoutLoading(planKey);
    try { const d = await API.post('/billing/checkout', { plan: planKey }); window.location.href = d.url; }
    catch (err) { alert(err.message); setCheckoutLoading(''); }
  };
  const handlePortal = async () => {
    setPortalLoading(true);
    try { const d = await API.post('/billing/portal'); window.location.href = d.url; }
    catch (err) { alert(err.message); setPortalLoading(false); }
  };

  const planLabel = { free: 'Free', monthly: 'Monthly', quarterly: 'Quarterly', semi_annual: '6 Months', annual: 'Annual', none: 'No plan' };
  const statusColor = { active: 'green', free: 'purple', past_due: 'yellow', inactive: 'gray' };

  if (loading) return React.createElement('div', { className: 'flex-center', style: { minHeight: 400 } }, React.createElement(Spinner));

  const isPaidActive = user.status === 'active';
  const isFree = user.plan === 'free' || user.status === 'free';
  const canAddHost = hosts.length < (user.maxHosts || 1);
  const canAddTunnel = tunnels.length < (user.maxTunnels || 1);

  return React.createElement('div', { className: 'dashboard' },
    msg && React.createElement(Alert, { type: 'success' }, msg),

    React.createElement('div', { className: 'dashboard-header' },
      React.createElement('div', null,
        React.createElement('h1', { style: { fontSize: 24, marginBottom: 4 } }, 'Dashboard'),
        React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14 } }, user.email)
      ),
      React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        React.createElement('span', { className: `badge badge-${statusColor[user.status] || 'gray'}` },
          planLabel[user.plan] || user.plan
        ),
        user.role === 'site_owner' && React.createElement('span', { className: 'badge badge-yellow' }, '★ Site Owner'),
        user.role === 'admin' && React.createElement('span', { className: 'badge badge-purple' }, '⚙ Admin'),
      )
    ),

    React.createElement('div', { className: 'stats-grid' },
      React.createElement('div', { className: 'stat-card' },
        React.createElement('div', { className: 'stat-value' }, `${hosts.length}/${user.maxHosts || 1}`),
        React.createElement('div', { className: 'stat-label' }, 'Hostnames used')
      ),
      React.createElement('div', { className: 'stat-card' },
        React.createElement('div', { className: 'stat-value' }, `${tunnels.length}/${user.maxTunnels || 1}`),
        React.createElement('div', { className: 'stat-label' }, 'Tunnels used')
      ),
      React.createElement('div', { className: 'stat-card' },
        React.createElement('div', { className: 'stat-value' }, hosts.filter(h => h.ip_address).length),
        React.createElement('div', { className: 'stat-label' }, 'Active IPs')
      )
    ),

    // Tabs
    React.createElement('div', { style: { display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)' } },
      ['hosts', 'tunnels', 'billing'].map(t => React.createElement('button', {
        key: t, onClick: () => setTab(t),
        style: { padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: tab === t ? 'var(--text)' : 'var(--text2)', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1 }
      }, t.charAt(0).toUpperCase() + t.slice(1)))
    ),

    // Hosts tab
    tab === 'hosts' && React.createElement('div', null,
      React.createElement('div', { className: 'flex-between mb-4' },
        React.createElement('h2', { className: 'section-title', style: { margin: 0 } }, 'Hostnames'),
        canAddHost && React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: () => setShowAddHost(true) }, '+ Add hostname')
      ),
      isFree && React.createElement(Alert, { type: 'info' },
        '🎁 Free plan: 1 subdomain included. Upgrade for more.'
      ),
      hosts.length === 0
        ? React.createElement('div', { className: 'card', style: { textAlign: 'center', padding: 48 } },
          React.createElement('div', { style: { fontSize: 40, marginBottom: 12 } }, '🌐'),
          React.createElement('h3', { style: { marginBottom: 8 } }, 'No hostnames yet'),
          React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, marginBottom: 16 } }, 'Create a free subdomain on rslvd.net'),
          React.createElement('button', { className: 'btn btn-primary', onClick: () => setShowAddHost(true) }, '+ Add hostname')
        )
        : (() => {
            const topLevel = hosts.filter(h => !h.parent_host_id);
            const children = hosts.filter(h => !!h.parent_host_id);
            return topLevel.flatMap(h => [
              React.createElement(HostCard, { key: h.id, host: h, onDelete: onHostDeleted, onRegenKey, isNested: false }),
              ...children.filter(c => c.parent_host_id === h.id).map(c =>
                React.createElement(HostCard, { key: c.id, host: c, onDelete: onHostDeleted, onRegenKey, isNested: true })
              )
            ]);
          })(),
      !canAddHost && hosts.length > 0 && React.createElement('div', { className: 'card', style: { textAlign: 'center', padding: 24, marginTop: 12 } },
        React.createElement('p', { style: { color: 'var(--text2)', marginBottom: 12 } }, `Hostname limit reached (${user.maxHosts}). Upgrade for more.`),
        React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: () => setTab('billing') }, 'Upgrade')
      )
    ),

    // Tunnels tab
    tab === 'tunnels' && React.createElement('div', null,
      React.createElement('div', { className: 'flex-between mb-4' },
        React.createElement('h2', { className: 'section-title', style: { margin: 0 } }, 'Tunnels'),
        canAddTunnel && React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: () => setShowAddTunnel(true) }, '+ New tunnel')
      ),
      React.createElement(Alert, { type: 'info' },
        '🚇 Tunnels expose any local port to your own subdomain on rslvd.net — no SSH, no port-forwarding. Download the rslvd-tunnel binary and run one command.'
      ),
      tunnels.length === 0
        ? React.createElement('div', { className: 'card', style: { textAlign: 'center', padding: 48 } },
          React.createElement('div', { style: { fontSize: 40, marginBottom: 12 } }, '🚇'),
          React.createElement('h3', { style: { marginBottom: 8 } }, 'No tunnels yet'),
          React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, marginBottom: 16 } }, 'Expose any local service — even behind CGNAT or double NAT'),
          React.createElement('button', { className: 'btn btn-primary', onClick: () => setShowAddTunnel(true) }, '+ Create tunnel')
        )
        : (() => {
            const topLevel = tunnels.filter(t => !t.parent_tunnel_id);
            const children = tunnels.filter(t => !!t.parent_tunnel_id);
            return topLevel.flatMap(t => [
              React.createElement(TunnelRow, { key: t.id, tunnel: t, onDelete: onTunnelDeleted, isNested: false }),
              ...children.filter(c => c.parent_tunnel_id === t.id).map(c =>
                React.createElement(TunnelRow, { key: c.id, tunnel: c, onDelete: onTunnelDeleted, isNested: true })
              )
            ]);
          })(),
      !canAddTunnel && tunnels.length > 0 && React.createElement('div', { className: 'card', style: { textAlign: 'center', padding: 24, marginTop: 12 } },
        React.createElement('p', { style: { color: 'var(--text2)', marginBottom: 12 } }, `Tunnel limit reached (${user.maxTunnels}). Upgrade for more.`),
        React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: () => setTab('billing') }, 'Upgrade')
      )
    ),

    // Billing tab
    tab === 'billing' && React.createElement('div', null,
      isPaidActive
        ? React.createElement('div', null,
          React.createElement('div', { className: 'card mb-4' },
            React.createElement('div', { className: 'flex-between' },
              React.createElement('div', null,
                React.createElement('h3', { style: { marginBottom: 4 } }, `${planLabel[user.plan]} plan`),
                React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14 } }, `${user.maxHosts} hostnames · ${user.maxTunnels} tunnels`),
                user.planExpiresAt && React.createElement('p', { style: { color: 'var(--text3)', fontSize: 13, marginTop: 4 } }, `Renews ${new Date(user.planExpiresAt).toLocaleDateString()}`)
              ),
              React.createElement('button', { className: 'btn btn-secondary', onClick: handlePortal, disabled: portalLoading },
                portalLoading ? React.createElement(Spinner) : 'Manage billing'
              )
            )
          )
        )
        : React.createElement('div', null,
          React.createElement('div', { className: 'card mb-4', style: { borderColor: 'var(--border2)' } },
            React.createElement('div', { style: { display: 'flex', gap: 12, alignItems: 'flex-start' } },
              React.createElement('div', { style: { fontSize: 24 } }, '🎁'),
              React.createElement('div', null,
                React.createElement('h3', { style: { marginBottom: 4 } }, 'Current: Free Plan'),
                React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14 } }, '1 hostname · 1 tunnel · always free')
              )
            )
          ),
          React.createElement('h2', { className: 'section-title' }, 'Upgrade for more'),
          React.createElement('div', { className: 'pricing-grid' },
            plans.map(p => React.createElement('div', { key: p.key, className: 'pricing-card' },
              React.createElement('h3', { style: { color: 'var(--text2)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 } }, p.label),
              React.createElement('div', { className: 'price-amount' }, p.amount.split('/')[0]),
              React.createElement('div', { className: 'price-period' }, '/' + p.amount.split('/')[1]),
              React.createElement('ul', { className: 'price-features' },
                React.createElement('li', null, `${p.maxHosts} hostnames`),
                React.createElement('li', null, `${p.maxTunnels} tunnels`),
                React.createElement('li', null, 'IPv4 + IPv6'),
                p.key === 'annual' && React.createElement('li', { style: { color: 'var(--accent2)', fontWeight: 600 } }, '🔗 Nested subdomains & tunnels'),
              ),
              React.createElement('button', { className: 'btn btn-primary w-full', onClick: () => handleCheckout(p.key), disabled: !!checkoutLoading },
                checkoutLoading === p.key ? React.createElement(Spinner) : 'Subscribe'
              )
            ))
          )
        )
    ),

    showAddHost && React.createElement(AddHostModal, { onClose: () => setShowAddHost(false), onCreated: onHostCreated, user, existingHosts: hosts }),
    showAddTunnel && React.createElement(TunnelModal, { onClose: () => setShowAddTunnel(false), onCreated: onTunnelCreated, user, existingTunnels: tunnels })
  );
}

// ── Admin Dashboard ───────────────────────────────────────────────────────────
function AdminDashboard({ user, navigate }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [tunnels, setTunnels] = useState([]);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState(null);
  const [search, setSearch] = useState('');
  const [reservedKey, setReservedKey] = useState(0);
  const [activity, setActivity] = useState([]);
  
  // Site owner only states
  const [services, setServices] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [dbTables, setDbTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableData, setTableData] = useState(null);
  const [backups, setBackups] = useState([]);
  const [serverStats, setServerStats] = useState(null);
  
  const load = async () => {
    setLoading(true);
    try {
      const [s, u] = await Promise.all([API.get('/admin/stats'), API.get('/admin/users')]);
      setStats(s); setUsers(u);
    } catch (e) { alert(e.message); }
    finally { setLoading(false); }
  };

  const loadHosts = async () => {
    try { setHosts(await API.get('/admin/hosts')); } catch (e) { console.error(e); }
  };
  const loadTunnels = async () => {
    try { setTunnels(await API.get('/admin/tunnels')); } catch (e) { console.error(e); }
  };

  const loadActivity = async () => {
    try { setActivity(await API.get('/admin/activity?limit=200')); } catch (e) { console.error(e); }
  };
  
  // Site owner data loaders
  const loadServices = async () => {
    try { setServices(await API.get('/admin/services')); } catch (e) { console.error(e); }
  };
  const loadConfigs = async () => {
    try { setConfigs(await API.get('/admin/configs')); } catch (e) { console.error(e); }
  };
  const loadDbTables = async () => {
    try { 
      const tables = await API.get('/admin/db/tables');
      setDbTables(tables);
      if (tables.length > 0 && !selectedTable) setSelectedTable(tables[0]);
    } catch (e) { console.error(e); }
  };
  const loadTableData = async (table, page = 0) => {
    if (!table) return;
    try { 
      const data = await API.get(`/admin/db/${table}/rows?limit=50&offset=${page * 50}`);
      setTableData(data);
    } catch (e) { console.error(e); }
  };
  const loadBackups = async () => {
    try { setBackups(await API.get('/admin/backups')); } catch (e) { console.error(e); }
  };
  const loadServerStats = async () => {
    try { setServerStats(await API.get('/admin/server-stats')); } catch (e) { console.error(e); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (tab === 'hosts' && hosts.length === 0) loadHosts();
    if (tab === 'tunnels' && tunnels.length === 0) loadTunnels();
    if (tab === 'activity' && activity.length === 0) loadActivity();
    if (tab === 'services' && services.length === 0) loadServices();
    if (tab === 'configs' && configs.length === 0) loadConfigs();
    if (tab === 'database' && dbTables.length === 0) loadDbTables();
    if (tab === 'backups' && backups.length === 0) loadBackups();
    if (tab === 'server' && !serverStats) loadServerStats();
  }, [tab]);
  
  useEffect(() => {
    if (selectedTable && tab === 'database') loadTableData(selectedTable);
  }, [selectedTable]);

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleDeleteUser = async (id) => {
    if (!confirm('Delete this user and all their data?')) return;
    try { await API.del(`/admin/users/${id}`); setUsers(u => u.filter(x => x.id !== id)); }
    catch (e) { alert(e.message); }
  };

  if (loading) return React.createElement('div', { className: 'flex-center', style: { minHeight: 400 } }, React.createElement(Spinner));

  const isSiteOwner = user.role === 'site_owner';

  return React.createElement('div', { className: 'dashboard' },
    React.createElement('div', { className: 'dashboard-header' },
      React.createElement('div', null,
        React.createElement('h1', { style: { fontSize: 24, marginBottom: 4 } },
          isSiteOwner ? '★ Site Owner Panel' : '⚙ Admin Panel'
        ),
        React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14 } }, user.email)
      ),
      React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: () => navigate('/dashboard') }, '← Dashboard')
    ),

    stats && React.createElement('div', { className: 'stats-grid' },
      React.createElement('div', { className: 'stat-card' },
        React.createElement('div', { className: 'stat-value' }, stats.totalUsers),
        React.createElement('div', { className: 'stat-label' }, 'Total users')
      ),
      React.createElement('div', { className: 'stat-card' },
        React.createElement('div', { className: 'stat-value' }, stats.totalHosts),
        React.createElement('div', { className: 'stat-label' }, 'Total hosts')
      ),
      React.createElement('div', { className: 'stat-card' },
        React.createElement('div', { className: 'stat-value' }, stats.totalTunnels),
        React.createElement('div', { className: 'stat-label' }, 'Active tunnels')
      ),
      React.createElement('div', { className: 'stat-card' },
        React.createElement('div', { className: 'stat-value', style: { color: 'var(--green)' } }, stats.activeSubscribers),
        React.createElement('div', { className: 'stat-label' }, 'Paid subscribers')
      )
    ),

    // Tabs
    React.createElement('div', { style: { display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', flexWrap: 'wrap', overflowX: 'auto' } },
      [
        { key: 'overview', label: 'Overview' },
        { key: 'users', label: 'Users' },
        { key: 'hosts', label: 'Hosts' },
        { key: 'tunnels', label: 'Tunnels' },
        { key: 'activity', label: '📋 Activity' },
        ...(isSiteOwner ? [
          { key: 'services', label: '🔧 Services' },
          { key: 'configs', label: '⚙ Configs' },
          { key: 'database', label: '🗄 Database' },
          { key: 'backups', label: '💾 Backups' },
          { key: 'server', label: '📊 Server' },
          { key: 'reserved', label: '🔒 Reserved' }
        ] : [])
      ].map(t =>
        React.createElement('button', {
          key: t.key, onClick: () => setTab(t.key),
          style: { padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: tab === t.key ? 'var(--text)' : 'var(--text2)', borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap' }
        }, t.label)
      )
    ),

    // Overview
    tab === 'overview' && stats && React.createElement('div', null,
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 } },
        React.createElement('div', { className: 'card' },
          React.createElement('h3', { style: { marginBottom: 16 } }, 'Users by plan'),
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            stats.byPlan.map(p => React.createElement('div', { key: p.plan, className: 'flex-between', style: { fontSize: 14 } },
              React.createElement('span', { style: { color: 'var(--text2)' } }, p.plan || 'none'),
              React.createElement('span', { style: { fontWeight: 600 } }, p.count)
            ))
          )
        ),
        React.createElement('div', { className: 'card' },
          React.createElement('h3', { style: { marginBottom: 16 } }, 'Recent signups'),
          React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            stats.recentUsers.map(u => React.createElement('div', { key: u.id, style: { fontSize: 13 } },
              React.createElement('div', { style: { fontWeight: 500 } }, u.email),
              React.createElement('div', { style: { color: 'var(--text3)', fontSize: 12 } },
                `${u.plan} · ${new Date(u.created_at).toLocaleDateString()}`
              )
            ))
          )
        )
      )
    ),

    // Users tab
    tab === 'users' && React.createElement('div', null,
      React.createElement('div', { className: 'flex-between mb-4' },
        React.createElement('input', { className: 'input', style: { maxWidth: 300 }, placeholder: '🔍 Search users...', value: search, onChange: e => setSearch(e.target.value) }),
        React.createElement('span', { style: { color: 'var(--text2)', fontSize: 14 } }, `${filteredUsers.length} users`)
      ),
      React.createElement('div', { className: 'card', style: { padding: 0, overflowX: 'auto' } },
        React.createElement('table', { className: 'host-table' },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Email'),
              React.createElement('th', null, 'Plan'),
              React.createElement('th', null, 'Status'),
              React.createElement('th', null, 'Limits'),
              React.createElement('th', null, 'Role'),
              React.createElement('th', null, 'Joined'),
              React.createElement('th', null, 'Actions'),
            )
          ),
          React.createElement('tbody', null,
            filteredUsers.map(u => React.createElement('tr', { key: u.id },
              React.createElement('td', null, React.createElement('span', { style: { fontWeight: 500, fontSize: 13 } }, u.email)),
              React.createElement('td', null, React.createElement('span', { className: 'badge badge-purple' }, u.plan)),
              React.createElement('td', null, React.createElement('span', { className: `badge badge-${u.subscription_status === 'active' ? 'green' : u.subscription_status === 'free' ? 'purple' : 'gray'}` }, u.subscription_status)),
              React.createElement('td', null, React.createElement('span', { style: { fontSize: 12, color: 'var(--text2)' } }, `${u.max_hosts}h / ${u.max_tunnels}t`)),
              React.createElement('td', null,
                u.is_site_owner ? React.createElement('span', { className: 'badge badge-yellow' }, '★ Owner')
                  : u.is_admin ? React.createElement('span', { className: 'badge badge-purple' }, 'Admin')
                  : React.createElement('span', { className: 'badge badge-gray' }, 'User')
              ),
              React.createElement('td', null, React.createElement('span', { style: { fontSize: 12, color: 'var(--text3)' } }, new Date(u.created_at).toLocaleDateString())),
              React.createElement('td', null,
                React.createElement('div', { style: { display: 'flex', gap: 6 } },
                  React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: () => setEditUser(u) }, 'Edit'),
                  isSiteOwner && !u.is_site_owner && React.createElement('button', { className: 'btn btn-danger btn-sm', onClick: () => handleDeleteUser(u.id) }, 'Del')
                )
              )
            ))
          )
        )
      )
    ),

    // Hosts tab
    tab === 'hosts' && React.createElement('div', null,
      React.createElement('div', { className: 'card', style: { padding: 0, overflowX: 'auto' } },
        React.createElement('table', { className: 'host-table' },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'FQDN'),
              React.createElement('th', null, 'IP'),
              React.createElement('th', null, 'Owner'),
              React.createElement('th', null, 'Last update'),
            )
          ),
          React.createElement('tbody', null,
            hosts.map(h => React.createElement('tr', { key: h.id },
              React.createElement('td', null, React.createElement('code', { style: { fontSize: 12 } }, h.fqdn)),
              React.createElement('td', null, h.ip_address || '—'),
              React.createElement('td', null, React.createElement('span', { style: { fontSize: 12, color: 'var(--text2)' } }, h.email)),
              React.createElement('td', null, React.createElement('span', { style: { fontSize: 12, color: 'var(--text3)' } }, h.last_updated ? new Date(h.last_updated).toLocaleString() : '—'))
            ))
          )
        )
      )
    ),

    // Tunnels tab
    tab === 'tunnels' && React.createElement('div', null,
      React.createElement('div', { className: 'card', style: { padding: 0, overflowX: 'auto' } },
        React.createElement('table', { className: 'host-table' },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Name / FQDN'),
              React.createElement('th', null, 'Port'),
              React.createElement('th', null, 'Status'),
              React.createElement('th', null, 'Owner'),
              React.createElement('th', null, 'Created'),
            )
          ),
          React.createElement('tbody', null,
            tunnels.map(t => React.createElement('tr', { key: t.id },
              React.createElement('td', null,
                React.createElement('div', { style: { fontWeight: 500, fontSize: 13 } }, t.name),
                React.createElement('div', { style: { fontSize: 11, color: 'var(--text3)' } }, t.fqdn)
              ),
              React.createElement('td', null, React.createElement('code', { style: { fontSize: 12 } }, t.tunnel_port)),
              React.createElement('td', null, React.createElement('span', { className: `badge badge-${t.status === 'active' ? 'green' : 'gray'}` }, t.status)),
              React.createElement('td', null, React.createElement('span', { style: { fontSize: 12, color: 'var(--text2)' } }, t.email)),
              React.createElement('td', null, React.createElement('span', { style: { fontSize: 12, color: 'var(--text3)' } }, new Date(t.created_at).toLocaleDateString()))
            ))
          )
        )
      )
    ),

    // Activity log tab
    tab === 'activity' && React.createElement(ActivityLog, { logs: activity, onRefresh: loadActivity }),

    // Reserved subdomains tab
    tab === 'reserved' && isSiteOwner && React.createElement(ReservedPanel, { key: reservedKey }),
    
    // Services tab (site_owner only)
    tab === 'services' && isSiteOwner && React.createElement(ServicesPanel, { services, onRefresh: loadServices }),
    
    // Configs tab (site_owner only)
    tab === 'configs' && isSiteOwner && React.createElement(ConfigsPanel, { configs, onRefresh: loadConfigs }),
    
    // Database tab (site_owner only)
    tab === 'database' && isSiteOwner && React.createElement(DatabasePanel, { 
      tables: dbTables, 
      selectedTable, 
      onSelectTable: setSelectedTable, 
      tableData, 
      onRefresh: () => loadTableData(selectedTable)
    }),
    
    // Backups tab (site_owner only)
    tab === 'backups' && isSiteOwner && React.createElement(BackupsPanel, { backups, onRefresh: loadBackups }),
    
    // Server stats tab (site_owner only)
    tab === 'server' && isSiteOwner && React.createElement(ServerPanel, { stats: serverStats, onRefresh: loadServerStats }),

    // Edit user modal
    editUser && React.createElement(EditUserModal, {
      user: editUser,
      isSiteOwner,
      onClose: () => setEditUser(null),
      onSaved: (updated) => {
        setUsers(u => u.map(x => x.id === updated.id ? { ...x, ...updated } : x));
        setEditUser(null);
      }
    })
  );
}

// ── Activity Log Component ────────────────────────────────────────────────────
const EVENT_META = {
  'user.register':        { icon: '👤', color: 'var(--green)',   label: 'Register' },
  'user.login':           { icon: '🔑', color: 'var(--accent2)', label: 'Login' },
  'host.create':          { icon: '🌐', color: 'var(--green)',   label: 'Host added' },
  'host.delete':          { icon: '🗑',  color: 'var(--red)',    label: 'Host deleted' },
  'tunnel.create':        { icon: '🚇', color: 'var(--green)',   label: 'Tunnel created' },
  'tunnel.delete':        { icon: '🗑',  color: 'var(--red)',    label: 'Tunnel deleted' },
  'tunnel.key_register':  { icon: '🔐', color: 'var(--accent2)', label: 'Key registered' },
};

function ActivityLog({ logs, onRefresh }) {
  const [filter, setFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  const events = [...new Set(logs.map(l => l.event))].sort();

  const filtered = logs.filter(l => {
    const matchText = !filter || l.email?.includes(filter) || l.detail?.includes(filter) || l.ip_address?.includes(filter);
    const matchEvent = !eventFilter || l.event === eventFilter;
    return matchText && matchEvent;
  });

  const relTime = (ts) => {
    const diff = Date.now() - new Date(ts);
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  return React.createElement('div', null,
    React.createElement('div', { style: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' } },
      React.createElement('input', { className: 'input', style: { maxWidth: 220 }, placeholder: '🔍 User / detail / IP...', value: filter, onChange: e => setFilter(e.target.value) }),
      React.createElement('select', { className: 'input', style: { maxWidth: 180 }, value: eventFilter, onChange: e => setEventFilter(e.target.value) },
        React.createElement('option', { value: '' }, 'All events'),
        events.map(e => React.createElement('option', { key: e, value: e }, EVENT_META[e]?.label || e))
      ),
      React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: handleRefresh, disabled: refreshing },
        refreshing ? React.createElement(Spinner) : '↻ Refresh'
      ),
      React.createElement('span', { style: { color: 'var(--text3)', fontSize: 13, marginLeft: 'auto' } },
        `${filtered.length} events`
      )
    ),

    filtered.length === 0
      ? React.createElement('div', { className: 'card', style: { textAlign: 'center', padding: 48, color: 'var(--text2)' } },
          React.createElement('div', { style: { fontSize: 32, marginBottom: 8 } }, '📋'),
          React.createElement('p', null, 'No activity yet')
        )
      : React.createElement('div', { className: 'card', style: { padding: 0, overflowX: 'auto' } },
          React.createElement('table', { className: 'host-table' },
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, 'Event'),
                React.createElement('th', null, 'User'),
                React.createElement('th', null, 'Detail'),
                React.createElement('th', null, 'IP'),
                React.createElement('th', null, 'Time'),
              )
            ),
            React.createElement('tbody', null,
              filtered.map(l => {
                const meta = EVENT_META[l.event] || { icon: '•', color: 'var(--text2)', label: l.event };
                return React.createElement('tr', { key: l.id },
                  React.createElement('td', null,
                    React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 } },
                      React.createElement('span', null, meta.icon),
                      React.createElement('span', { style: { color: meta.color, fontWeight: 500 } }, meta.label)
                    )
                  ),
                  React.createElement('td', null, React.createElement('span', { style: { fontSize: 12, color: 'var(--text2)' } }, l.email || '—')),
                  React.createElement('td', null, React.createElement('span', { style: { fontSize: 12, color: 'var(--text3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap' } }, l.detail || '—')),
                  React.createElement('td', null, React.createElement('code', { style: { fontSize: 11, color: 'var(--text3)' } }, l.ip_address || '—')),
                  React.createElement('td', null,
                    React.createElement('span', { style: { fontSize: 12, color: 'var(--text3)' }, title: new Date(l.created_at).toLocaleString() }, relTime(l.created_at))
                  )
                );
              })
            )
          )
        )
  );
}

// ── Reserved Subdomains Panel ───────────────────────────────────────────────
function ReservedPanel() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subdomain, setSubdomain] = useState('');
  const [reason, setReason] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try { setList(await API.get('/admin/reserved')); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault(); setError(''); setAdding(true);
    try {
      const item = await API.post('/admin/reserved', { subdomain: subdomain.toLowerCase().trim(), reason });
      setList(l => [...l, item].sort((a, b) => a.subdomain.localeCompare(b.subdomain)));
      setSubdomain(''); setReason('');
    } catch (e) { setError(e.message); }
    finally { setAdding(false); }
  };

  const handleRemove = async (id, sub) => {
    if (!confirm(`Unreserve "${sub}"? Users will be able to register it.`)) return;
    try {
      await API.del(`/admin/reserved/${id}`);
      setList(l => l.filter(x => x.id !== id));
    } catch (e) { alert(e.message); }
  };

  const filtered = list.filter(r => r.subdomain.includes(search.toLowerCase()));

  if (loading) return React.createElement('div', { className: 'flex-center', style: { padding: 40 } }, React.createElement(Spinner));

  return React.createElement('div', null,
    React.createElement('div', { className: 'card mb-4' },
      React.createElement('h3', { style: { marginBottom: 4 } }, 'Reserve a subdomain'),
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 13, marginBottom: 16 } },
        'Blocked subdomains cannot be registered by users. Site owner can bypass.'
      ),
      error && React.createElement(Alert, null, error),
      React.createElement('form', { onSubmit: handleAdd, style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' } },
        React.createElement('div', { className: 'form-group', style: { margin: 0, flex: '1 1 160px' } },
          React.createElement('label', { className: 'form-label' }, 'Subdomain'),
          React.createElement('div', { style: { display: 'flex', alignItems: 'center' } },
            React.createElement('input', {
              className: 'input',
              value: subdomain,
              onChange: e => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')),
              placeholder: 'mysubdomain',
              required: true,
              style: { borderRadius: '8px 0 0 8px', borderRight: 'none' }
            }),
            React.createElement('span', { style: { padding: '10px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '0 8px 8px 0', color: 'var(--text3)', fontSize: 12, whiteSpace: 'nowrap' } }, '.rslvd.net')
          )
        ),
        React.createElement('div', { className: 'form-group', style: { margin: 0, flex: '2 1 200px' } },
          React.createElement('label', { className: 'form-label' }, 'Reason (optional)'),
          React.createElement('input', { className: 'input', value: reason, onChange: e => setReason(e.target.value), placeholder: 'e.g. Internal use' })
        ),
        React.createElement('button', { className: 'btn btn-primary', type: 'submit', disabled: adding, style: { marginBottom: 1 } },
          adding ? React.createElement(Spinner) : '+ Reserve'
        )
      )
    ),

    React.createElement('div', { className: 'flex-between mb-4' },
      React.createElement('input', { className: 'input', style: { maxWidth: 260 }, placeholder: '🔍 Filter...', value: search, onChange: e => setSearch(e.target.value) }),
      React.createElement('span', { style: { color: 'var(--text2)', fontSize: 13 } }, `${filtered.length} / ${list.length} reserved`)
    ),

    React.createElement('div', { className: 'card', style: { padding: 0, overflowX: 'auto' } },
      React.createElement('table', { className: 'host-table' },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', null, 'Subdomain'),
            React.createElement('th', null, 'Reason'),
            React.createElement('th', null, 'Added by'),
            React.createElement('th', null, 'Date'),
            React.createElement('th', null, 'Action')
          )
        ),
        React.createElement('tbody', null,
          filtered.map(r => React.createElement('tr', { key: r.id },
            React.createElement('td', null,
              React.createElement('code', { style: { fontSize: 13, color: 'var(--accent2)', fontWeight: 600 } }, r.subdomain),
              React.createElement('span', { style: { fontSize: 11, color: 'var(--text3)', marginLeft: 6 } }, '.rslvd.net')
            ),
            React.createElement('td', null, React.createElement('span', { style: { fontSize: 13, color: 'var(--text2)' } }, r.reason || '—')),
            React.createElement('td', null, React.createElement('span', { style: { fontSize: 12, color: 'var(--text3)' } }, r.created_by_email || 'system')),
            React.createElement('td', null, React.createElement('span', { style: { fontSize: 12, color: 'var(--text3)' } }, new Date(r.created_at).toLocaleDateString())),
            React.createElement('td', null,
              React.createElement('button', { className: 'btn btn-danger btn-sm', onClick: () => handleRemove(r.id, r.subdomain) }, 'Unreserve')
            )
          ))
        )
      )
    )
  );
}

// ── Services Panel ────────────────────────────────────────────────────────────
function ServicesPanel({ services, onRefresh }) {
  const [loading, setLoading] = useState({});
  
  const handleAction = async (name, action) => {
    setLoading({ ...loading, [name]: action });
    try {
      await API.post(`/admin/services/${name}/toggle`, { action });
      onRefresh();
    } catch (e) { alert(e.message); }
    finally { setLoading({ ...loading, [name]: null }); }
  };
  
  return React.createElement('div', null,
    React.createElement('div', { className: 'flex-between mb-4' },
      React.createElement('h3', { style: { margin: 0 } }, 'Service Status'),
      React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: onRefresh }, '↻ Refresh')
    ),
    React.createElement('div', { style: { display: 'grid', gap: 12 } },
      services.map(svc => React.createElement('div', { key: svc.name, className: 'card', style: { display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' } },
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('div', { style: { fontWeight: 600, fontSize: 15 } }, svc.displayName),
          React.createElement('div', { style: { fontSize: 12, color: 'var(--text2)' } }, svc.description)
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          React.createElement('span', { className: `badge badge-${svc.status === 'active' ? 'green' : svc.status === 'failed' ? 'red' : 'gray'}` }, svc.status),
          svc.enabled && React.createElement('span', { className: 'badge badge-blue' }, 'enabled'),
          svc.critical && React.createElement('span', { className: 'badge badge-yellow' }, 'critical')
        ),
        React.createElement('div', { style: { display: 'flex', gap: 6 } },
          svc.status !== 'active' && !svc.loading && React.createElement('button', { 
            className: 'btn btn-primary btn-sm', 
            onClick: () => handleAction(svc.name, 'start'),
            disabled: loading[svc.name] 
          }, loading[svc.name] === 'start' ? React.createElement(Spinner) : '▶ Start'),
          svc.status === 'active' && !svc.loading && React.createElement('button', { 
            className: 'btn btn-secondary btn-sm', 
            onClick: () => handleAction(svc.name, 'restart'),
            disabled: loading[svc.name] 
          }, loading[svc.name] === 'restart' ? React.createElement(Spinner) : '↻ Restart'),
          svc.status === 'active' && !svc.critical && !svc.loading && React.createElement('button', { 
            className: 'btn btn-danger btn-sm', 
            onClick: () => handleAction(svc.name, 'stop'),
            disabled: loading[svc.name] 
          }, loading[svc.name] === 'stop' ? React.createElement(Spinner) : '■ Stop')
        )
      ))
    ),
    React.createElement('p', { style: { fontSize: 12, color: 'var(--text3)', marginTop: 16 } },
      'Critical services cannot be stopped via web interface. Use SSH for emergency maintenance.'
    )
  );
}

// ── Configs Panel ──────────────────────────────────────────────────────────────
function ConfigsPanel({ configs, onRefresh }) {
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  useEffect(() => {
    if (selected) {
      const cfg = configs.find(c => c.key === selected);
      setContent(cfg?.content || '');
    }
  }, [selected, configs]);
  
  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await API.post(`/admin/config/${selected}`, { content, restart: true });
      alert('Configuration saved and validated successfully');
      onRefresh();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };
  
  const selectedCfg = configs.find(c => c.key === selected);
  
  return React.createElement('div', null,
    React.createElement('div', { className: 'flex-between mb-4' },
      React.createElement('h3', { style: { margin: 0 } }, 'Configuration Editor'),
      React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: onRefresh }, '↻ Refresh')
    ),
    
    error && React.createElement(Alert, null, error),
    
    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 } },
      // Sidebar
      React.createElement('div', { className: 'card', style: { padding: 12 } },
        React.createElement('h4', { style: { fontSize: 13, marginBottom: 12, color: 'var(--text2)' } }, 'Select Config'),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          configs.map(cfg => React.createElement('button', {
            key: cfg.key,
            className: `btn btn-sm ${selected === cfg.key ? 'btn-primary' : 'btn-secondary'}`,
            onClick: () => setSelected(cfg.key),
            style: { textAlign: 'left', justifyContent: 'flex-start' }
          }, cfg.sensitive ? '🔒 ' : '📄 ', cfg.description))
        )
      ),
      
      // Editor
      selectedCfg && React.createElement('div', null,
        React.createElement('div', { className: 'card', style: { marginBottom: 12 } },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
            React.createElement('div', null,
              React.createElement('h4', { style: { margin: 0 } }, selectedCfg.description),
              React.createElement('code', { style: { fontSize: 11, color: 'var(--text3)' } }, selectedCfg.path)
            ),
            React.createElement('div', { style: { display: 'flex', gap: 8 } },
              selectedCfg.sensitive && React.createElement('span', { className: 'badge badge-red' }, 'SENSITIVE'),
              selectedCfg.validateCmd && React.createElement('span', { className: 'badge badge-green' }, 'VALIDATED')
            )
          ),
          React.createElement('textarea', {
            className: 'input',
            value: content,
            onChange: e => setContent(e.target.value),
            style: { fontFamily: 'monospace', fontSize: 13, minHeight: 400, whiteSpace: 'pre', overflowWrap: 'normal', overflowX: 'auto' }
          }),
          React.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 } },
            React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: () => setContent(selectedCfg.content) }, 'Reset'),
            React.createElement('button', { className: 'btn btn-primary', onClick: handleSave, disabled: saving }, 
              saving ? React.createElement(Spinner) : '💾 Save Changes')
          )
        ),
        selectedCfg.sensitive && React.createElement('p', { style: { fontSize: 12, color: 'var(--red)' } },
          '⚠️ This file contains sensitive data. Changes are logged and backups are created automatically.'
        )
      )
    )
  );
}

// ── Database Panel ────────────────────────────────────────────────────────────
function DatabasePanel({ tables, selectedTable, onSelectTable, tableData, onRefresh }) {
  const [editing, setEditing] = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  
  const handleEdit = (row) => {
    setEditing(row.id);
    setEditData({ ...row });
  };
  
  const handleSave = async (id) => {
    setSaving(true);
    try {
      // Remove id from updates
      const { id: _, ...updates } = editData;
      await API.patch(`/admin/db/${selectedTable}/${id}`, updates);
      setEditing(null);
      onRefresh();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };
  
  const handleDelete = async (id) => {
    if (!confirm(`Delete row ${id} from ${selectedTable}?`)) return;
    try {
      await API.del(`/admin/db/${selectedTable}/${id}`);
      onRefresh();
    } catch (e) { alert(e.message); }
  };
  
  return React.createElement('div', null,
    React.createElement('div', { className: 'flex-between mb-4' },
      React.createElement('h3', { style: { margin: 0 } }, 'Database Editor'),
      React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: onRefresh }, '↻ Refresh')
    ),
    
    React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '180px 1fr', gap: 20 } },
      // Table list
      React.createElement('div', { className: 'card', style: { padding: 12 } },
        React.createElement('h4', { style: { fontSize: 13, marginBottom: 12, color: 'var(--text2)' } }, 'Tables'),
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          tables.map(t => React.createElement('button', {
            key: t,
            className: `btn btn-sm ${selectedTable === t ? 'btn-primary' : 'btn-secondary'}`,
            onClick: () => onSelectTable(t),
            style: { textAlign: 'left', justifyContent: 'flex-start', textTransform: 'capitalize' }
          }, t))
        )
      ),
      
      // Data table
      selectedTable && tableData && React.createElement('div', null,
        React.createElement('div', { className: 'card', style: { padding: 0, overflowX: 'auto' } },
          React.createElement('table', { className: 'host-table' },
            React.createElement('thead', null,
              React.createElement('tr', null,
                tableData.columns.map(col => React.createElement('th', { key: col, style: { fontSize: 11 } }, col)),
                React.createElement('th', null, 'Actions')
              )
            ),
            React.createElement('tbody', null,
              tableData.rows.map(row => React.createElement('tr', { key: row.id },
                tableData.columns.map(col => React.createElement('td', { key: col },
                  editing === row.id 
                    ? React.createElement('input', { 
                        className: 'input', 
                        value: editData[col] || '', 
                        onChange: e => setEditData({ ...editData, [col]: e.target.value }),
                        style: { padding: '4px 8px', fontSize: 12 }
                      })
                    : React.createElement('span', { style: { fontSize: 12, fontFamily: 'monospace' } }, 
                        String(row[col]).substring(0, 50) + (String(row[col]).length > 50 ? '...' : ''))
                )),
                React.createElement('td', null,
                  editing === row.id 
                    ? React.createElement('div', { style: { display: 'flex', gap: 4 } },
                        React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: () => handleSave(row.id), disabled: saving }, '✓'),
                        React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: () => setEditing(null) }, '✕')
                      )
                    : React.createElement('div', { style: { display: 'flex', gap: 4 } },
                        React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: () => handleEdit(row) }, 'Edit'),
                        selectedTable !== 'users' && React.createElement('button', { className: 'btn btn-danger btn-sm', onClick: () => handleDelete(row.id) }, 'Del')
                      )
                )
              ))
            )
          )
        ),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 } },
          React.createElement('span', { style: { fontSize: 12, color: 'var(--text2)' } }, 
            `Showing ${tableData.rows.length} of ${tableData.total} rows`),
          React.createElement('div', { style: { display: 'flex', gap: 8 } },
            React.createElement('button', { className: 'btn btn-secondary btn-sm', disabled: page === 0, onClick: () => setPage(p => p - 1) }, '← Prev'),
            React.createElement('span', { style: { fontSize: 13, padding: '4px 12px' } }, `Page ${page + 1}`),
            React.createElement('button', { className: 'btn btn-secondary btn-sm', disabled: (page + 1) * 50 >= tableData.total, onClick: () => setPage(p => p + 1) }, 'Next →')
          )
        )
      )
    ),
    
    React.createElement('p', { style: { fontSize: 12, color: 'var(--text3)', marginTop: 16 } },
      '🔒 Sensitive fields (password_hash, stripe_customer_id, token) are hidden. User deletion is disabled here - use the Users tab.'
    )
  );
}

// ── Backups Panel ─────────────────────────────────────────────────────────────
function BackupsPanel({ backups, onRefresh }) {
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(null);
  
  const handleCreate = async (type) => {
    setCreating(true);
    try {
      await API.post('/admin/backups/create', { type });
      alert(`${type} backup created successfully`);
      onRefresh();
    } catch (e) { alert(e.message); }
    finally { setCreating(false); }
  };
  
  const handleRestore = async (filename) => {
    if (!confirm(`Restore ${filename}?\n\nThis will overwrite existing data. Ensure you have a backup first!`)) return;
    setRestoring(filename);
    try {
      await API.post(`/admin/backups/${encodeURIComponent(filename)}/restore`);
      alert('Restore completed. Services may need restart.');
      onRefresh();
    } catch (e) { alert(e.message); }
    finally { setRestoring(null); }
  };
  
  const handleDelete = async (filename) => {
    if (!confirm(`Delete ${filename}?`)) return;
    try {
      await API.del(`/admin/backups/${encodeURIComponent(filename)}`);
      onRefresh();
    } catch (e) { alert(e.message); }
  };
  
  return React.createElement('div', null,
    React.createElement('div', { className: 'flex-between mb-4' },
      React.createElement('h3', { style: { margin: 0 } }, 'Backup & Restore'),
      React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: onRefresh }, '↻ Refresh')
    ),
    
    React.createElement('div', { className: 'card mb-4' },
      React.createElement('h4', { style: { marginBottom: 12 } }, 'Create New Backup'),
      React.createElement('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap' } },
        React.createElement('button', { className: 'btn btn-primary', onClick: () => handleCreate('full'), disabled: creating },
          creating ? React.createElement(Spinner) : '📦 Full Backup'),
        React.createElement('button', { className: 'btn btn-secondary', onClick: () => handleCreate('database'), disabled: creating },
          creating ? React.createElement(Spinner) : '🗄 Database Only'),
        React.createElement('button', { className: 'btn btn-secondary', onClick: () => handleCreate('config'), disabled: creating },
          creating ? React.createElement(Spinner) : '⚙ Config Only')
      ),
      React.createElement('p', { style: { fontSize: 12, color: 'var(--text2)', marginTop: 12, marginBottom: 0 } },
        'Full backup includes: app files, database, and configurations. Backups are stored in /opt/rslvd/backups/'
      )
    ),
    
    backups.length === 0 
      ? React.createElement('div', { className: 'card', style: { textAlign: 'center', padding: 40 } },
          React.createElement('p', { style: { color: 'var(--text2)' } }, 'No backups yet')
        )
      : React.createElement('div', { className: 'card', style: { padding: 0, overflowX: 'auto' } },
          React.createElement('table', { className: 'host-table' },
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, 'Filename'),
                React.createElement('th', null, 'Size'),
                React.createElement('th', null, 'Date'),
                React.createElement('th', null, 'Actions')
              )
            ),
            React.createElement('tbody', null,
              backups.map(b => React.createElement('tr', { key: b.filename },
                React.createElement('td', null, React.createElement('code', { style: { fontSize: 12 } }, b.filename)),
                React.createElement('td', null, React.createElement('span', { style: { fontSize: 12 } }, b.size)),
                React.createElement('td', null, React.createElement('span', { style: { fontSize: 12, color: 'var(--text2)' } }, b.date)),
                React.createElement('td', null,
                  React.createElement('div', { style: { display: 'flex', gap: 6 } },
                    React.createElement('a', { 
                      className: 'btn btn-secondary btn-sm',
                      href: `/admin/backups/${encodeURIComponent(b.filename)}/download`,
                      download: true
                    }, 'Download'),
                    !b.filename.includes('full') && React.createElement('button', {
                      className: 'btn btn-primary btn-sm',
                      onClick: () => handleRestore(b.filename),
                      disabled: restoring === b.filename
                    }, restoring === b.filename ? React.createElement(Spinner) : 'Restore'),
                    React.createElement('button', {
                      className: 'btn btn-danger btn-sm',
                      onClick: () => handleDelete(b.filename)
                    }, 'Delete')
                  )
                )
              ))
            )
          )
        )
  );
}

// ── Server Panel ────────────────────────────────────────────────────────────────
function ServerPanel({ stats, onRefresh }) {
  const [logs, setLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState('app');
  const [loading, setLoading] = useState(false);
  
  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await API.get(`/admin/logs/${selectedLog}?lines=100`);
      setLogs(data.logs || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  
  useEffect(() => { loadLogs(); }, [selectedLog]);
  
  return React.createElement('div', null,
    React.createElement('div', { className: 'flex-between mb-4' },
      React.createElement('h3', { style: { margin: 0 } }, 'Server Status & Logs'),
      React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: () => { onRefresh(); loadLogs(); } }, '↻ Refresh')
    ),
    
    // Stats cards
    stats && React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 } },
      React.createElement('div', { className: 'stat-card' },
        React.createElement('div', { className: 'stat-value', style: { fontSize: 20 } }, stats.disk),
        React.createElement('div', { className: 'stat-label' }, 'Disk Usage')
      ),
      React.createElement('div', { className: 'stat-card' },
        React.createElement('div', { className: 'stat-value', style: { fontSize: 20 } }, stats.memory),
        React.createElement('div', { className: 'stat-label' }, 'Memory')
      ),
      React.createElement('div', { className: 'stat-card' },
        React.createElement('div', { className: 'stat-value', style: { fontSize: 18 } }, stats.load),
        React.createElement('div', { className: 'stat-label' }, 'Load Average')
      ),
      React.createElement('div', { className: 'stat-card' },
        React.createElement('div', { className: 'stat-value', style: { fontSize: 16 } }, stats.uptime),
        React.createElement('div', { className: 'stat-label' }, 'Uptime')
      )
    ),
    
    // Logs section
    React.createElement('div', { className: 'card' },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
        React.createElement('h4', { style: { margin: 0 } }, 'System Logs'),
        React.createElement('select', { 
          className: 'input', 
          style: { width: 'auto', minWidth: 150 },
          value: selectedLog, 
          onChange: e => setSelectedLog(e.target.value) 
        },
          React.createElement('option', { value: 'app' }, '📱 RSLVD App'),
          React.createElement('option', { value: 'nginx' }, '🌐 Nginx'),
          React.createElement('option', { value: 'postgresql' }, '🗄 PostgreSQL'),
          React.createElement('option', { value: 'error' }, '❌ Nginx Errors'),
          React.createElement('option', { value: 'ssh' }, '🔐 SSH'),
          React.createElement('option', { value: 'ufw' }, '🛡 UFW')
        )
      ),
      loading 
        ? React.createElement('div', { className: 'flex-center', style: { padding: 40 } }, React.createElement(Spinner))
        : React.createElement('pre', { 
            style: { 
              background: 'var(--bg3)', 
              padding: 12, 
              borderRadius: 8, 
              fontSize: 11, 
              fontFamily: 'monospace',
              maxHeight: 500,
              overflow: 'auto',
              margin: 0,
              color: 'var(--text2)'
            } 
          }, logs.length === 0 ? 'No logs' : logs.join('\n'))
    )
  );
}

// ── Edit User Modal ───────────────────────────────────────────────────────────
function EditUserModal({ user: u, isSiteOwner, onClose, onSaved }) {
  const [plan, setPlan] = useState(u.plan);
  const [maxHosts, setMaxHosts] = useState(u.max_hosts);
  const [maxTunnels, setMaxTunnels] = useState(u.max_tunnels);
  const [status, setStatus] = useState(u.subscription_status);
  const [isAdmin, setIsAdmin] = useState(u.is_admin);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setLoading(true); setError('');
    try {
      const body = { plan, maxHosts: parseInt(maxHosts), maxTunnels: parseInt(maxTunnels), subscriptionStatus: status };
      if (isSiteOwner) body.isAdmin = isAdmin;
      await API.patch(`/admin/users/${u.id}`, body);
      onSaved({ ...u, plan, max_hosts: parseInt(maxHosts), max_tunnels: parseInt(maxTunnels), subscription_status: status, is_admin: isAdmin });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return React.createElement(Modal, { title: `Edit: ${u.email}`, onClose },
    error && React.createElement(Alert, null, error),
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, 'Plan'),
        React.createElement('select', { className: 'input', value: plan, onChange: e => setPlan(e.target.value) },
          ['free', 'monthly', 'quarterly', 'semi_annual', 'annual', 'none'].map(p =>
            React.createElement('option', { key: p, value: p }, p)
          )
        )
      ),
      React.createElement('div', { className: 'form-group' },
        React.createElement('label', { className: 'form-label' }, 'Subscription status'),
        React.createElement('select', { className: 'input', value: status, onChange: e => setStatus(e.target.value) },
          ['free', 'active', 'inactive', 'past_due', 'cancelled'].map(s =>
            React.createElement('option', { key: s, value: s }, s)
          )
        )
      ),
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Max hostnames'),
          React.createElement('input', { className: 'input', type: 'number', value: maxHosts, onChange: e => setMaxHosts(e.target.value), min: 0, max: 1000 })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Max tunnels'),
          React.createElement('input', { className: 'input', type: 'number', value: maxTunnels, onChange: e => setMaxTunnels(e.target.value), min: 0, max: 1000 })
        )
      ),
      isSiteOwner && React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
        React.createElement('input', { type: 'checkbox', id: 'isAdmin', checked: isAdmin, onChange: e => setIsAdmin(e.target.checked), style: { width: 16, height: 16 } }),
        React.createElement('label', { htmlFor: 'isAdmin', style: { fontSize: 14 } }, 'Admin privileges')
      ),
      React.createElement('div', { style: { display: 'flex', gap: 12, justifyContent: 'flex-end' } },
        React.createElement('button', { className: 'btn btn-secondary', onClick: onClose }, 'Cancel'),
        React.createElement('button', { className: 'btn btn-primary', onClick: save, disabled: loading },
          loading ? React.createElement(Spinner) : 'Save changes'
        )
      )
    )
  );
}

// ── Account Page ─────────────────────────────────────────────────────────────
function AccountPage({ user, navigate, refreshUser }) {
  const [tab, setTab] = useState('profile');
  return React.createElement('div', { className: 'dashboard' },
    React.createElement('div', { className: 'dashboard-header' },
      React.createElement('div', null,
        React.createElement('h1', { style: { fontSize: 24, marginBottom: 4 } }, '⚙️ Account Settings'),
        React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14 } }, user.email)
      ),
      React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: () => navigate('/dashboard') }, '← Dashboard')
    ),
    React.createElement('div', { style: { display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' } },
      [['profile', '👤 Profile'], ['security', '🔐 Security'], ['activity', '📋 Login history']].map(([key, label]) =>
        React.createElement('button', {
          key, onClick: () => setTab(key),
          style: { padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: tab === key ? 'var(--text)' : 'var(--text2)', borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1 }
        }, label)
      )
    ),
    tab === 'profile'  && React.createElement(ProfileTab,       { user, refreshUser }),
    tab === 'security' && React.createElement(SecurityTab,      { user, refreshUser }),
    tab === 'activity' && React.createElement(LoginHistoryTab,  {})
  );
}

function ProfileTab({ user, refreshUser }) {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const save = async (e) => {
    e.preventDefault(); setLoading(true); setMsg(''); setError('');
    try { await API.patch('/auth/profile', { displayName }); await refreshUser(); setMsg('Profile saved.'); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return React.createElement('div', { style: { maxWidth: 480 } },
    React.createElement('div', { className: 'card mb-4' },
      React.createElement('h3', { style: { marginBottom: 20 } }, 'Public profile'),
      msg && React.createElement(Alert, { type: 'success' }, msg),
      error && React.createElement(Alert, null, error),
      React.createElement('form', { onSubmit: save },
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Email'),
          React.createElement('input', { className: 'input', value: user.email, disabled: true, style: { opacity: 0.5 } })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Display name'),
          React.createElement('input', { className: 'input', value: displayName, onChange: e => setDisplayName(e.target.value), placeholder: 'Optional — shown in admin views', maxLength: 100 })
        ),
        React.createElement('button', { className: 'btn btn-primary', type: 'submit', disabled: loading },
          loading ? React.createElement(Spinner) : 'Save profile'
        )
      )
    ),
    React.createElement('div', { className: 'card' },
      React.createElement('h3', { style: { marginBottom: 12 } }, 'Account info'),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        [['Plan', user.plan], ['Status', user.status], ['Hostnames', user.maxHosts], ['Tunnels', user.maxTunnels], ['Role', user.role]].map(([k, v]) =>
          React.createElement('div', { key: k, className: 'flex-between', style: { fontSize: 14 } },
            React.createElement('span', { style: { color: 'var(--text2)' } }, k),
            React.createElement('span', { style: { fontWeight: 500 } }, String(v))
          )
        )
      )
    )
  );
}

function SecurityTab({ user, refreshUser }) {
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwNew2, setPwNew2] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  const [tfaState, setTfaState] = useState(null);
  const [tfaCode, setTfaCode] = useState('');
  const [tfaLoading, setTfaLoading] = useState(false);
  const [tfaMsg, setTfaMsg] = useState('');
  const [tfaErr, setTfaErr] = useState('');
  const [disablePw, setDisablePw] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);

  const changePassword = async (e) => {
    e.preventDefault(); setPwLoading(true); setPwMsg(''); setPwErr('');
    if (pwNew !== pwNew2) { setPwErr('New passwords do not match'); setPwLoading(false); return; }
    try {
      await API.post('/auth/change-password', { currentPassword: pwCurrent, newPassword: pwNew });
      setPwMsg('Password changed successfully.'); setPwCurrent(''); setPwNew(''); setPwNew2('');
    } catch (err) { setPwErr(err.message); }
    finally { setPwLoading(false); }
  };

  const startSetup2fa = async () => {
    setTfaLoading(true); setTfaErr('');
    try { const d = await API.post('/auth/2fa/setup'); setTfaState(d); }
    catch (err) { setTfaErr(err.message); }
    finally { setTfaLoading(false); }
  };

  const verify2fa = async (e) => {
    e.preventDefault(); setTfaLoading(true); setTfaErr('');
    try {
      await API.post('/auth/2fa/verify', { code: tfaCode });
      setTfaMsg('✅ Two-factor authentication is now active.');
      setTfaState(null); setTfaCode(''); await refreshUser();
    } catch (err) { setTfaErr(err.message); }
    finally { setTfaLoading(false); }
  };

  const disable2fa = async (e) => {
    e.preventDefault(); setDisableLoading(true); setTfaErr('');
    try {
      await API.post('/auth/2fa/disable', { password: disablePw });
      setTfaMsg('Two-factor authentication disabled.'); setDisablePw(''); await refreshUser();
    } catch (err) { setTfaErr(err.message); }
    finally { setDisableLoading(false); }
  };

  return React.createElement('div', { style: { maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 20 } },
    React.createElement('div', { className: 'card' },
      React.createElement('h3', { style: { marginBottom: 20 } }, '🔑 Change password'),
      pwMsg && React.createElement(Alert, { type: 'success' }, pwMsg),
      pwErr && React.createElement(Alert, null, pwErr),
      React.createElement('form', { onSubmit: changePassword },
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Current password'),
          React.createElement('input', { className: 'input', type: 'password', value: pwCurrent, onChange: e => setPwCurrent(e.target.value), required: true })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'New password'),
          React.createElement('input', { className: 'input', type: 'password', value: pwNew, onChange: e => setPwNew(e.target.value), placeholder: 'At least 8 characters', required: true, minLength: 8 })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Confirm new password'),
          React.createElement('input', { className: 'input', type: 'password', value: pwNew2, onChange: e => setPwNew2(e.target.value), required: true })
        ),
        React.createElement('button', { className: 'btn btn-primary', type: 'submit', disabled: pwLoading },
          pwLoading ? React.createElement(Spinner) : 'Change password'
        )
      )
    ),

    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'flex-between', style: { marginBottom: 16 } },
        React.createElement('div', null,
          React.createElement('h3', { style: { marginBottom: 4 } }, '🔐 Two-factor authentication'),
          React.createElement('p', { style: { fontSize: 13, color: 'var(--text2)' } }, 'Protect your account with a TOTP authenticator app.')
        ),
        user.totpEnabled
          ? React.createElement('span', { className: 'badge badge-green' }, '✓ Enabled')
          : React.createElement('span', { className: 'badge badge-gray' }, 'Disabled')
      ),
      tfaMsg && React.createElement(Alert, { type: 'success' }, tfaMsg),
      tfaErr && React.createElement(Alert, null, tfaErr),

      !user.totpEnabled && !tfaState && React.createElement('button', { className: 'btn btn-primary', onClick: startSetup2fa, disabled: tfaLoading },
        tfaLoading ? React.createElement(Spinner) : 'Set up authenticator'
      ),

      !user.totpEnabled && tfaState && React.createElement('div', null,
        React.createElement('p', { style: { fontSize: 13, color: 'var(--text2)', marginBottom: 12 } },
          'Scan with ', React.createElement('strong', null, 'Google Authenticator'), ', ', React.createElement('strong', null, 'Authy'), ', or any TOTP app:'
        ),
        React.createElement('div', { style: { textAlign: 'center', marginBottom: 16 } },
          React.createElement('img', {
            src: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(tfaState.otpauth_url)}`,
            alt: 'QR Code', width: 200, height: 200,
            style: { borderRadius: 12, border: '4px solid var(--bg3)' }
          })
        ),
        React.createElement('p', { style: { fontSize: 12, color: 'var(--text3)', marginBottom: 8 } }, 'Or enter this key manually:'),
        React.createElement(CopyBox, { text: tfaState.secret }),
        React.createElement('form', { onSubmit: verify2fa, style: { marginTop: 16 } },
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Enter 6-digit code to confirm'),
            React.createElement('input', { className: 'input', type: 'text', inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6, value: tfaCode, onChange: e => setTfaCode(e.target.value.replace(/\D/g, '')), placeholder: '000000', required: true, style: { letterSpacing: 6, fontSize: 20, textAlign: 'center' } })
          ),
          React.createElement('div', { style: { display: 'flex', gap: 10 } },
            React.createElement('button', { className: 'btn btn-primary', type: 'submit', disabled: tfaLoading },
              tfaLoading ? React.createElement(Spinner) : 'Activate 2FA'
            ),
            React.createElement('button', { className: 'btn btn-secondary', type: 'button', onClick: () => setTfaState(null) }, 'Cancel')
          )
        )
      ),

      user.totpEnabled && React.createElement('form', { onSubmit: disable2fa, style: { marginTop: 8 } },
        React.createElement('p', { style: { fontSize: 13, color: 'var(--text2)', marginBottom: 12 } }, 'Enter your password to disable 2FA:'),
        React.createElement('div', { style: { display: 'flex', gap: 10 } },
          React.createElement('input', { className: 'input', type: 'password', value: disablePw, onChange: e => setDisablePw(e.target.value), placeholder: 'Current password', required: true }),
          React.createElement('button', { className: 'btn btn-danger', type: 'submit', disabled: disableLoading },
            disableLoading ? React.createElement(Spinner) : 'Disable'
          )
        )
      )
    )
  );
}

function LoginHistoryTab() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get('/auth/activity').then(setLogs).catch(console.error).finally(() => setLoading(false));
  }, []);

  const relTime = (ts) => {
    const diff = Date.now() - new Date(ts);
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleString();
  };

  const ICONS = { 'user.login': '🔑', 'user.register': '👤', 'user.2fa_enabled': '🔐', 'user.2fa_disabled': '⚠️', 'user.profile_update': '✏️', 'host.create': '🌐', 'host.delete': '🗑', 'tunnel.create': '🚇', 'tunnel.delete': '🗑' };

  if (loading) return React.createElement('div', { className: 'flex-center', style: { padding: 48 } }, React.createElement(Spinner));

  return React.createElement('div', null,
    React.createElement('p', { style: { color: 'var(--text2)', fontSize: 13, marginBottom: 16 } }, 'Your last 50 account events:'),
    logs.length === 0
      ? React.createElement('div', { className: 'card', style: { textAlign: 'center', padding: 48, color: 'var(--text2)' } }, 'No activity recorded yet.')
      : React.createElement('div', { className: 'card', style: { padding: 0 } },
          logs.map((l, i) => React.createElement('div', {
            key: l.id,
            style: { display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: i < logs.length - 1 ? '1px solid var(--border)' : 'none' }
          },
            React.createElement('span', { style: { fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 } }, ICONS[l.event] || '•'),
            React.createElement('div', { style: { flex: 1, minWidth: 0 } },
              React.createElement('div', { style: { fontSize: 13, fontWeight: 500 } }, l.event.replace(/\./g, ' › ').replace(/_/g, ' ')),
              l.detail && React.createElement('div', { style: { fontSize: 12, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, l.detail)
            ),
            React.createElement('div', { style: { textAlign: 'right', flexShrink: 0 } },
              React.createElement('div', { style: { fontSize: 12, color: 'var(--text3)' }, title: new Date(l.created_at).toLocaleString() }, relTime(l.created_at)),
              l.ip_address && React.createElement('div', { style: { fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace' } }, l.ip_address)
            )
          ))
        )
  );
}

// ── Legal page wrapper ────────────────────────────────────────────────────────
function LegalPage({ title, children, navigate }) {
  return React.createElement('div', { style: { maxWidth: 800, margin: '0 auto', padding: '60px 24px 80px' } },
    React.createElement('button', { className: 'btn btn-secondary btn-sm', style: { marginBottom: 32 }, onClick: () => navigate('/') }, '← Back'),
    React.createElement('h1', { style: { fontSize: 28, marginBottom: 8 } }, title),
    React.createElement('p', { style: { color: 'var(--text3)', fontSize: 13, marginBottom: 40 } }, 'Last updated: May 26, 2026'),
    children,
    React.createElement('div', { style: { marginTop: 48, paddingTop: 24, borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text3)' } },
      'Questions? Contact us at ', React.createElement('a', { href: 'mailto:legal@rslvd.net', style: { color: 'var(--accent2)' } }, 'legal@rslvd.net')
    )
  );
}

function Section({ title, children }) {
  return React.createElement('div', { style: { marginBottom: 32 } },
    React.createElement('h2', { style: { fontSize: 17, fontWeight: 600, marginBottom: 10, color: 'var(--text)' } }, title),
    children
  );
}

function P({ children }) {
  return React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.8, marginBottom: 10 } }, children);
}

function Li({ items }) {
  return React.createElement('ul', { style: { paddingLeft: 20, color: 'var(--text2)', fontSize: 14, lineHeight: 2 } },
    ...items.map((item, i) => React.createElement('li', { key: i }, item))
  );
}

// ── Terms of Service ─────────────────────────────────────────────────────────
function TermsPage({ navigate }) {
  return React.createElement(LegalPage, { title: 'Terms of Service', navigate },
    React.createElement(P, null, 'Last updated: June 4, 2026'),
    React.createElement(P, null, 'These Terms of Service (the "Terms") govern your access to and use of rslvd.net, including our websites, dashboards, APIs, Dynamic DNS services, tunnel services, downloadable software, scripts, documentation, support services, and related features (collectively, the "Service"). By creating an account, accessing, installing, downloading, or using any part of the Service, you agree to these Terms. If you do not agree, do not use the Service.'),
    React.createElement(P, null, 'These Terms are intended to be a binding legal agreement between you and rslvd.net ("rslvd.net", "we", "us", or "our"). If you use the Service on behalf of a company, organization, or other entity, you represent that you have authority to bind that entity, and "you" includes that entity.'),

    React.createElement(Section, { title: '1. Description of Service' },
      React.createElement(P, null, 'rslvd.net provides Dynamic DNS, CGNAT tunnel, subdomain routing, API, dashboard, client software, and related networking services that may allow users to make local or private network services reachable through names under the rslvd.net domain or related infrastructure. The Service may include DNS updates, tunnel relays, HTTP/WebSocket forwarding, TCP/UDP-related functionality, router installation scripts, downloadable binaries, account management, billing, and support tools.'),
      React.createElement(P, null, 'The Service is provided for lawful remote access, development, self-hosting, networking, and related uses. The Service is not a backup service, storage service, emergency service, public safety system, high-availability guarantee, or managed security service. Features may be added, changed, limited, suspended, deprecated, or discontinued at any time.')
    ),

    React.createElement(Section, { title: '2. Eligibility and Account Registration' },
      React.createElement(P, null, 'You must be at least 13 years old, or the minimum age required in your jurisdiction, to use the Service. If you are under the age of majority where you live, you may use the Service only with permission and supervision from a parent or legal guardian.'),
      React.createElement(P, null, 'You agree to provide accurate, current, and complete account information and to keep that information updated. We may refuse registration, suspend accounts, reclaim usernames or subdomains, or require verification at our discretion, including where we suspect abuse, fraud, impersonation, trademark misuse, security risk, or violation of these Terms.')
    ),

    React.createElement(Section, { title: '3. Account Security and Responsibility' },
      React.createElement(P, null, 'You are responsible for maintaining the confidentiality and security of your account credentials, passwords, API keys, update keys, tunnel tokens, 2FA devices, client binaries, configuration files, and any devices where the Service is installed. You are responsible for all activity under your account, whether authorized by you or not, unless caused solely by our willful misconduct.'),
      React.createElement(P, null, 'You must promptly notify us at legal@rslvd.net or support@rslvd.net if you suspect unauthorized access, compromised credentials, exposed tunnel tokens, malicious activity, or any other security incident involving the Service. We may rotate, revoke, disable, or require you to rotate credentials, keys, tokens, hostnames, tunnels, or sessions when we believe it is necessary to protect you, other users, us, or third parties.')
    ),

    React.createElement(Section, { title: '4. Your Services, Content, and Exposed Systems' },
      React.createElement(P, null, 'You are solely responsible for any device, server, application, website, camera, router, NAS, service, port, protocol, data, content, or system that you expose, proxy, route, publish, connect, or make reachable through rslvd.net. You are responsible for ensuring that your exposed services are secure, patched, lawful, properly authenticated, and appropriate for internet exposure.'),
      React.createElement(P, null, 'You understand that using Dynamic DNS or tunnels may make your systems reachable by third parties on the internet. We are not responsible for unauthorized access to your devices or services, weak passwords, vulnerable software, exposed admin panels, misconfigured routers, insecure cameras, open databases, malware on your systems, or any consequences of exposing your services.'),
      React.createElement(P, null, 'You retain ownership of content and systems you control. You grant us a limited, worldwide, non-exclusive, royalty-free license to transmit, route, proxy, cache transiently, process, and display technical information solely as necessary to provide, secure, troubleshoot, bill for, and improve the Service and comply with law.')
    ),

    React.createElement(Section, { title: '5. Acceptable Use Policy' },
      React.createElement(P, null, 'You agree not to use, attempt to use, or allow others to use the Service for unlawful, harmful, abusive, deceptive, infringing, or disruptive activity. Prohibited activity includes, without limitation:'),
      React.createElement(Li, { items: [
        'Hosting, transmitting, distributing, linking to, or facilitating malware, ransomware, botnets, credential stealers, phishing kits, exploit kits, command-and-control systems, spam infrastructure, or malicious payloads.',
        'Child sexual abuse material, sexual exploitation, non-consensual intimate content, human trafficking, terrorist content, credible threats, or content that is illegal to possess, distribute, or access.',
        'Phishing, credential harvesting, impersonation, social engineering, fraud, scams, deceptive login pages, fake payment pages, or misleading affiliation with rslvd.net or any third party.',
        'Denial-of-service attacks, stress testing without authorization, amplification attacks, port scanning of third-party networks, vulnerability scanning of systems you do not own or have permission to test, brute force attacks, or network abuse.',
        'Spam, unsolicited bulk messaging, abusive email, SMS abuse, comment spam, bot activity, scraping, or traffic intended to manipulate rankings, metrics, advertisements, votes, or reviews.',
        'Copyright, trademark, trade secret, privacy, publicity, or other intellectual property violations, including unauthorized distribution of copyrighted media or software.',
        'Exposing services that are intentionally deceptive, harmful, illegal, or designed to evade detection, takedowns, sanctions, law enforcement, or abuse controls.',
        'Interfering with, probing, reverse engineering, bypassing, overloading, or attempting to gain unauthorized access to rslvd.net systems, other users\' accounts, tunnels, DNS records, APIs, infrastructure, or third-party systems.',
        'Using the Service in violation of export controls, sanctions laws, court orders, regulatory restrictions, or applicable local, state, national, or international law.',
        'Reselling, sublicensing, white-labeling, renting, sharing, or commercially redistributing the Service without our prior written permission.',
        'Using free accounts, automation, multiple accounts, or rotated identities to avoid limits, abuse controls, billing, suspensions, or enforcement actions.',
        'Excessive or abusive bandwidth, connection volume, DNS update volume, tunnel churn, automated registrations, or resource consumption that degrades the Service or harms other users.'
      ] })
    ),

    React.createElement(Section, { title: '6. DNS, Subdomains, Hostnames, and Tunnels' },
      React.createElement(P, null, 'Subdomains, hostnames, tunnel names, update keys, tunnel tokens, and related identifiers are assigned, licensed, or made available to you for use with the Service. They are not sold to you, do not become your property, and may not be transferred, sold, leased, or sublicensed without our written permission.'),
      React.createElement(P, null, 'We may reject, reserve, reclaim, rename, suspend, or remove any hostname, subdomain, tunnel, record, token, or route at any time if we believe it violates these Terms, infringes rights, creates security or operational risk, is confusing, is inactive, is needed for platform operations, or may expose us or others to liability. Free-plan subdomains and tunnels may be reclaimed after extended inactivity, currently defined as 90 days unless otherwise stated in the dashboard.'),
      React.createElement(P, null, 'DNS propagation, third-party resolver behavior, certificate issuance, browser behavior, ISP routing, NAT traversal, and tunnel reachability may vary. We do not guarantee that any hostname, tunnel, DNS record, certificate, route, port, protocol, or connection will be continuously available, accepted by third parties, or reachable from every network.')
    ),

    React.createElement(Section, { title: '7. Software, Scripts, and Client Tools' },
      React.createElement(P, null, 'We may provide downloadable binaries, source snippets, shell scripts, router installers, API examples, or other software tools. Subject to your compliance with these Terms, we grant you a limited, revocable, non-exclusive, non-transferable license to use those tools solely to access the Service.'),
      React.createElement(P, null, 'You are responsible for reviewing commands, scripts, binaries, firewall rules, router configuration, startup services, and system changes before running them. You should not install software or expose services on systems you do not own or administer. We are not responsible for damage, data loss, misconfiguration, downtime, security incidents, or other harm caused by your installation, configuration, use, modification, or redistribution of client tools except to the extent prohibited by law.')
    ),

    React.createElement(Section, { title: '8. Service Limits, Fair Use, and Changes' },
      React.createElement(P, null, 'Plans may include limits on hostnames, tunnels, users, DNS updates, bandwidth, requests, protocols, ports, connection duration, concurrent connections, API calls, support, or other features. Published limits may be enforced technically or manually. We may apply temporary or permanent limits to protect Service reliability, prevent abuse, control costs, comply with law, or protect users and third parties.'),
      React.createElement(P, null, 'Unlimited or high-limit features, if any, are subject to reasonable fair use. We may throttle, rate-limit, queue, block, suspend, or terminate activity that we determine is abusive, harmful, unusually high-risk, or materially above normal usage for the plan. We are not required to provide advance notice where immediate action is necessary.')
    ),

    React.createElement(Section, { title: '9. Billing, Subscriptions, Taxes, and Refunds' },
      React.createElement(P, null, 'Paid plans are billed in advance through Stripe or another payment processor. By purchasing a paid plan, you authorize us and our payment processor to charge your payment method for recurring fees, applicable taxes, and other charges associated with your plan until you cancel. Billing intervals, plan limits, and prices are shown at checkout or in the dashboard.'),
      React.createElement(P, null, 'Except where required by law or expressly stated otherwise, fees are non-refundable and non-creditable. Downgrades, cancellations, and feature reductions generally take effect at the end of the current billing period. If payment fails, we may suspend, downgrade, or terminate paid features, hostnames, tunnels, or account access.'),
      React.createElement(P, null, 'We may change pricing, plan features, free-tier limits, or billing terms with reasonable notice where required. You are responsible for taxes, duties, bank fees, currency conversion fees, and payment processor fees that may apply.')
    ),

    React.createElement(Section, { title: '10. Suspension, Termination, and Enforcement' },
      React.createElement(P, null, 'We may investigate suspected violations and may suspend, disable, block, rate-limit, delete, reclaim, or terminate accounts, subdomains, tunnels, DNS records, tokens, sessions, traffic, or access to the Service at any time if we believe you violated these Terms, created risk, caused harm, failed to pay, or exposed us, users, infrastructure, or third parties to liability.'),
      React.createElement(P, null, 'We may also act in response to abuse reports, court orders, law enforcement requests, intellectual property complaints, sanctions requirements, security incidents, payment disputes, or operational emergencies. We are not liable for losses resulting from good-faith enforcement actions. Upon termination, your right to use the Service ends immediately, and your hostnames, DNS records, tunnels, and data may be deactivated or deleted.')
    ),

    React.createElement(Section, { title: '11. Abuse Reports, Law Enforcement, and Compliance' },
      React.createElement(P, null, 'You may report abuse to abuse@rslvd.net. We may review account information, DNS records, connection metadata, logs, billing records, support messages, and other relevant information to investigate abuse, security incidents, fraud, or violations. We may preserve or disclose information when we believe it is required by law, necessary to protect rights or safety, necessary to operate the Service, or appropriate to respond to valid legal process.'),
      React.createElement(P, null, 'We reserve the right to cooperate with law enforcement, regulators, payment processors, DNS providers, certificate authorities, hosting providers, network operators, and rights holders. We may notify affected users of legal requests where permitted, but we are not required to do so where prohibited, impractical, or unsafe.')
    ),

    React.createElement(Section, { title: '12. Privacy and Data' },
      React.createElement(P, null, 'Our Privacy Policy explains how we collect, use, store, and disclose information. By using the Service, you agree that we may process information as described in the Privacy Policy. You acknowledge that DNS records are inherently public and that Dynamic DNS may publish your IP address. If you require IP privacy, use tunnel functionality rather than publishing an A or AAAA record, subject to plan availability and technical limitations.')
    ),

    React.createElement(Section, { title: '13. Intellectual Property' },
      React.createElement(P, null, 'The Service, including software, code, design, text, graphics, logos, trademarks, service marks, domain names, documentation, APIs, and related materials, is owned by rslvd.net or its licensors and is protected by intellectual property laws. These Terms do not grant you ownership of any rslvd.net intellectual property.'),
      React.createElement(P, null, 'You may not copy, modify, reverse engineer, decompile, disassemble, scrape, frame, mirror, or create derivative works of the Service except as permitted by law or by an applicable open-source license for specific components. You may not use rslvd.net branding, logos, or confusingly similar names without prior written permission.')
    ),

    React.createElement(Section, { title: '14. Third-Party Services' },
      React.createElement(P, null, 'The Service may depend on third-party providers such as DNS providers, certificate authorities, hosting providers, payment processors, email providers, cloud platforms, domain registrars, operating systems, router firmware, and network operators. We are not responsible for third-party services, outages, policies, fees, terms, security incidents, or changes. Your use of third-party services may be subject to their own terms and privacy policies.')
    ),

    React.createElement(Section, { title: '15. Disclaimers' },
      React.createElement(P, null, 'THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS. TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, SECURITY, AVAILABILITY, RELIABILITY, ACCURACY, AND ERROR-FREE OR UNINTERRUPTED OPERATION.'),
      React.createElement(P, null, 'We do not warrant that the Service will prevent unauthorized access, secure your exposed systems, satisfy compliance obligations, operate without downtime, maintain any particular speed or latency, support every protocol or device, preserve data, or be available from every network or jurisdiction. You use the Service and expose systems at your own risk.')
    ),

    React.createElement(Section, { title: '16. Limitation of Liability' },
      React.createElement(P, null, 'TO THE MAXIMUM EXTENT PERMITTED BY LAW, RSLVD.NET AND ITS OWNERS, OFFICERS, EMPLOYEES, CONTRACTORS, AFFILIATES, LICENSORS, SUPPLIERS, AND PROVIDERS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES; LOSS OF PROFITS, REVENUE, GOODWILL, DATA, USE, BUSINESS, OR SECURITY; SERVICE INTERRUPTION; COST OF SUBSTITUTE SERVICES; DEVICE COMPROMISE; THIRD-PARTY CLAIMS; OR DAMAGES ARISING FROM EXPOSED SERVICES, DNS RECORDS, TUNNELS, TOKENS, SOFTWARE, OR NETWORK ACCESS.'),
      React.createElement(P, null, 'TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE OR THESE TERMS WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID TO US FOR THE SERVICE IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM, OR (B) USD $100. Some jurisdictions do not allow certain limitations, so some limitations may not apply to you.')
    ),

    React.createElement(Section, { title: '17. Indemnification' },
      React.createElement(P, null, 'You agree to defend, indemnify, and hold harmless rslvd.net and its owners, officers, employees, contractors, affiliates, licensors, suppliers, and providers from and against any claims, liabilities, damages, losses, costs, expenses, and fees, including reasonable attorneys\' fees, arising out of or related to: your use of the Service; your exposed services, content, devices, or systems; your violation of these Terms or law; your infringement or misappropriation of rights; your security failures or compromised credentials; your billing disputes; or any activity under your account.')
    ),

    React.createElement(Section, { title: '18. Governing Law and Disputes' },
      React.createElement(P, null, 'These Terms are governed by the laws of the jurisdiction in which rslvd.net is legally organized or principally operates, without regard to conflict-of-law rules, unless applicable consumer protection law requires otherwise. Courts located in that jurisdiction will have exclusive jurisdiction over disputes, except where arbitration or another dispute process is required by a separate written agreement or applicable law.'),
      React.createElement(P, null, 'Before filing a claim, you agree to contact us at legal@rslvd.net and attempt to resolve the dispute informally. You and rslvd.net agree that any claim must be brought within one year after the claim arises, unless a longer period is required by law.')
    ),

    React.createElement(Section, { title: '19. Changes to These Terms' },
      React.createElement(P, null, 'We may update these Terms from time to time. If changes are material, we will make reasonable efforts to notify users through the Service, dashboard, email, or another appropriate method. Your continued use of the Service after updated Terms become effective constitutes acceptance. If you do not agree to updated Terms, you must stop using the Service and cancel any paid subscription.')
    ),

    React.createElement(Section, { title: '20. Miscellaneous' },
      React.createElement(P, null, 'These Terms, together with the Privacy Policy and any plan-specific terms displayed at checkout or in the dashboard, are the entire agreement between you and rslvd.net regarding the Service. If any provision is found unenforceable, the remaining provisions remain in effect. Our failure to enforce a provision is not a waiver. You may not assign these Terms without our consent; we may assign them as part of a merger, acquisition, reorganization, sale of assets, or by operation of law. Section headings are for convenience only.'),
      React.createElement(P, null, 'Questions about these Terms may be sent to legal@rslvd.net. Abuse reports may be sent to abuse@rslvd.net. Support requests may be sent to support@rslvd.net.')
    )
  );
}

// ── Privacy Policy ────────────────────────────────────────────────────────────
function PrivacyPage({ navigate }) {
  return React.createElement(LegalPage, { title: 'Privacy Policy', navigate },
    React.createElement(P, null, 'This Privacy Policy describes how rslvd.net ("we", "us", "our") collects, uses, and protects information about you when you use the Service.'),

    React.createElement(Section, { title: '1. Information We Collect' },
      React.createElement(P, null, 'We collect the following information when you use the Service:'),
      React.createElement(Li, { items: [
        'Account information: email address and hashed password when you register.',
        'Usage data: IP addresses, DNS update requests, tunnel connection timestamps, and error logs.',
        'Billing data: payment details are handled by Stripe and never stored on our servers.',
        'Device/platform data: the binary platform you use to connect (e.g. linux-amd64) for diagnostic purposes.',
      ]})
    ),

    React.createElement(Section, { title: '2. How We Use Your Information' },
      React.createElement(P, null, 'We use the information we collect to:'),
      React.createElement(Li, { items: [
        'Provide, operate, and improve the Service.',
        'Authenticate your account and validate tunnel tokens.',
        'Update DNS records on your behalf.',
        'Send transactional emails (account, billing, security).',
        'Detect and prevent abuse, fraud, and violations of our Terms of Service.',
        'Comply with legal obligations.',
      ]})
    ),

    React.createElement(Section, { title: '3. Tunnel Traffic' },
      React.createElement(P, null, 'Tunnel traffic is proxied through our servers in order to reach your local service. We do not inspect, log, or store the content of your tunnelled traffic. Connection metadata (timestamps, bytes transferred) may be retained for up to 30 days for abuse detection purposes.')
    ),

    React.createElement(Section, { title: '4. DNS Records' },
      React.createElement(P, null, 'Your IP address is stored in our DNS provider (IONOS) to resolve your subdomain. This IP is publicly visible to anyone who queries your subdomain\'s DNS record. If you require IP privacy, use the tunnel feature instead of Dynamic DNS.')
    ),

    React.createElement(Section, { title: '5. Data Sharing' },
      React.createElement(P, null, 'We do not sell, rent, or trade your personal information. We may share data with:'),
      React.createElement(Li, { items: [
        'Stripe — for payment processing.',
        'IONOS — for DNS record management.',
        'Law enforcement or government authorities — if required by law or to protect the safety of users.',
      ]})
    ),

    React.createElement(Section, { title: '6. Data Retention' },
      React.createElement(P, null, 'Account data is retained for as long as your account is active. If you delete your account, your email and personal data will be removed within 30 days. DNS records and tunnel configurations are deleted immediately upon account deletion. Anonymised usage statistics may be retained indefinitely.')
    ),

    React.createElement(Section, { title: '7. Security' },
      React.createElement(P, null, 'We use industry-standard security practices including TLS encryption in transit, hashed passwords (bcrypt), and per-resource token authentication. No security system is perfect; we cannot guarantee absolute security of your data.')
    ),

    React.createElement(Section, { title: '8. Cookies' },
      React.createElement(P, null, 'We use a single session cookie to keep you logged in. We do not use tracking cookies, analytics cookies, or third-party advertising cookies. We do not use Google Analytics or any similar third-party tracking service.')
    ),

    React.createElement(Section, { title: '9. Your Rights' },
      React.createElement(P, null, 'You have the right to access, correct, or delete your personal data at any time. You can manage your data from your dashboard or by contacting us at legal@rslvd.net. If you are located in the EU/EEA, you have additional rights under GDPR including the right to data portability and to lodge a complaint with a supervisory authority.')
    ),

    React.createElement(Section, { title: '10. Children' },
      React.createElement(P, null, 'The Service is not directed at children under 13. We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, please contact us and we will delete it.')
    ),

    React.createElement(Section, { title: '11. Changes to this Policy' },
      React.createElement(P, null, 'We may update this Privacy Policy from time to time. We will notify you of significant changes by posting a notice on the Service or by email. Continued use of the Service after changes constitutes acceptance of the updated policy.')
    )
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const { path, navigate } = useRoute();
  const auth = useAuth();
  window.navigate = navigate;

  if (auth.loading) return React.createElement('div', { className: 'flex-center', style: { minHeight: '100vh' } }, React.createElement(Spinner));

  if ((['/dashboard', '/admin', '/account'].includes(path)) && !auth.user) { navigate('/login'); return null; }
  if (path === '/admin' && auth.user && auth.user.role === 'user') { navigate('/dashboard'); return null; }
  if ((path === '/login' || path === '/register') && auth.user) { navigate('/dashboard'); return null; }

  return React.createElement('div', null,
    React.createElement(Nav, { user: auth.user, logout: auth.logout, navigate }),
    path === '/' && React.createElement(Landing, { navigate }),
    path === '/pricing' && React.createElement(Landing, { navigate }),
    path === '/login' && React.createElement(AuthPage, { mode: 'login', login: auth.login, navigate }),
    path === '/register' && React.createElement(AuthPage, { mode: 'register', register: auth.register, navigate }),
    path === '/forgot-password' && React.createElement(ForgotPasswordPage, { navigate }),
    path === '/reset-password' && React.createElement(ResetPasswordPage, { navigate }),
    path === '/dashboard' && auth.user && React.createElement(Dashboard, { user: auth.user, navigate, refreshUser: auth.refreshUser }),
    path === '/account' && auth.user && React.createElement(AccountPage, { user: auth.user, navigate, refreshUser: auth.refreshUser }),
    path === '/admin' && auth.user && (auth.user.role === 'admin' || auth.user.role === 'site_owner') &&
      React.createElement(AdminDashboard, { user: auth.user, navigate }),
    path === '/terms'   && React.createElement(TermsPage,   { navigate }),
    path === '/privacy' && React.createElement(PrivacyPage, { navigate }),
    !['/', '/login', '/register', '/dashboard', '/admin', '/pricing', '/account', '/terms', '/privacy', '/forgot-password', '/reset-password'].includes(path) &&
      React.createElement('div', { className: 'flex-center', style: { minHeight: 400, flexDirection: 'column', gap: 16 } },
        React.createElement('h1', null, '404'),
        React.createElement('p', { style: { color: 'var(--text2)' } }, 'Page not found'),
        React.createElement('button', { className: 'btn btn-primary', onClick: () => navigate('/') }, 'Go home')
      )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
