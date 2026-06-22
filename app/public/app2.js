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
function Nav({ user, logout, navigate, pwa }) {
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
        pwa && pwa.canInstall && React.createElement('button', { key: 'install', className: 'btn btn-secondary btn-sm', onClick: pwa.install, style: { gap: 4 } }, 'Install'),
        React.createElement('button', { key: 'in', className: 'btn btn-secondary btn-sm', onClick: () => navigate('/login') }, 'Sign in'),
        React.createElement('button', { key: 'up', className: 'btn btn-primary btn-sm', onClick: () => navigate('/register') }, 'Free signup'),
      ]
    )
  );
}

// ── Landing ───────────────────────────────────────────────────────────────────
function Landing({ navigate }) {
  const plans = [
    { key: 'free',       name: 'Free',      price: '$0',    period: 'forever',    hosts: 2,  tunnels: 2,  highlight: false },
    { key: 'monthly',    name: 'Monthly',   price: '$0.99', period: '/month',     hosts: 4,  tunnels: 4,  highlight: false },
    { key: 'quarterly',  name: 'Quarterly', price: '$1.99', period: '/3 months',  hosts: 12, tunnels: 12, highlight: false },
    { key: 'semi_annual',name: '6 Months',  price: '$4.99', period: '/6 months',  hosts: 24, tunnels: 24, highlight: true  },
    { key: 'annual',     name: 'Annual',    price: '$8.99', period: '/year',       hosts: 'Unlimited', tunnels: 'Unlimited', highlight: false },
  ];

  const features = [
    { icon: '🌐', title: 'Dynamic DNS', desc: 'Your subdomain on rslvd.net always follows your home or office IP. Updates propagate in under 60 seconds.' },
    { icon: '🚇', title: 'CGNAT Tunnel', desc: 'Stuck behind carrier-grade NAT? Our TCP tunnel punches right through — no port forwarding, no ISP cooperation needed.' },
    { icon: '🔌', title: 'WebSocket Ready', desc: 'Full HTTP/WS proxy — WebSockets, Server-Sent Events, and binary protocols all work out of the box.' },
    { icon: '📡', title: 'Router Native', desc: 'One-command installer for OpenWRT and DD-WRT routers. MIPS, ARM, x86 — all covered.' },
    { icon: '🔗', title: 'DynDNS Compatible', desc: 'Drop-in replacement for any DynDNS client. Works with Asus, Synology, Ubiquiti, pfSense, and more.' },
    { icon: '🔒', title: 'Token Security', desc: 'Each host and tunnel gets its own unique token. Revoke or rotate instantly from your dashboard.' },
    { icon: '📱', title: 'Every Platform', desc: 'Single binary for Linux, macOS, Windows, Android (Termux), and routers. No dependencies, no runtime.' },
    { icon: '⚡', title: 'Instant Setup', desc: 'Register, grab your token, run one command. Your tunnel is live in under 30 seconds.' },
  ];

  const useCases = [
    { icon: '🏠', title: 'Home Lab', desc: 'Expose your Proxmox, Home Assistant, Plex, or self-hosted services to the internet without touching your ISP.' },
    { icon: '💻', title: 'Dev & Testing', desc: 'Share a localhost dev server with a client or teammate instantly. No VPN, no ngrok account, no bandwidth limits.' },
    { icon: '📹', title: 'IP Cameras & NVRs', desc: 'Access your cameras remotely without a static IP. Point rslvd.net at your NVR and you\'re done.' },
    { icon: '🌍', title: 'Remote Access', desc: 'SSH, RDP, VNC — tunnel any protocol. Access your home PC or office server from anywhere.' },
  ];

  const faqs = [
    { q: 'What is CGNAT?', a: 'Carrier-Grade NAT is when your ISP shares a single public IP across many customers. Port forwarding doesn\'t work because you don\'t actually own the public IP. Our tunnel bypasses this entirely.' },
    { q: 'How is this different from ngrok?', a: 'rslvd.net gives you a permanent subdomain (not a random URL), supports WebSockets, works on routers and Android, has no session time limits, and costs a fraction of the price.' },
    { q: 'Does the tunnel support HTTPS?', a: 'Yes. All tunnels are served over HTTPS via *.rslvd.net — our wildcard SSL certificate covers every subdomain. Your traffic is encrypted end-to-end from browser to server.' },
    { q: 'Can I run multiple tunnels?', a: 'Yes. Free tier gets 2 tunnels. Paid plans scale up to unlimited. Each tunnel gets its own subdomain and token.' },
    { q: 'Does it work on OpenWRT / DD-WRT?', a: 'Yes — dedicated one-line installers for both. Auto-detects your router\'s architecture (MIPS, ARM, x86) and persistent storage location.' },
  ];

  const [openFaq, setOpenFaq] = React.useState(null);

  return React.createElement('div', null,

    // ── Hero ──────────────────────────────────────────────────────────────────
    React.createElement('div', { className: 'hero' },
      React.createElement('div', { style: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', background: 'var(--accent-bg)', border: '1px solid rgba(108,99,255,0.3)', borderRadius: 999, fontSize: 13, color: 'var(--accent2)', marginBottom: 24 } },
        '⚡ Free tier — 2 hosts + 2 tunnels, no credit card required'
      ),
      React.createElement('h1', null,
        'Your home server,\n',
        React.createElement('span', { style: { color: 'var(--accent2)' } }, 'on the internet.')
      ),
      React.createElement('p', null,
        'Dynamic DNS + CGNAT tunnel in one. Get a permanent ', React.createElement('strong', null, 'yourname.rslvd.net'), ' subdomain that always points to your machine — even behind carrier-grade NAT.'
      ),
      React.createElement('div', { style: { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 48 } },
        React.createElement('button', { className: 'btn btn-primary btn-lg', onClick: () => navigate('/register') }, 'Get started free →'),
        React.createElement('button', { className: 'btn btn-secondary btn-lg', onClick: () => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }) }, 'See pricing')
      ),
      // Quick install strip
      React.createElement('div', { style: { maxWidth: 560, margin: '0 auto', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', textAlign: 'left' } },
        React.createElement('div', { style: { fontSize: 11, color: 'var(--text3)', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' } }, 'Quick install'),
        React.createElement(CopyBox, { text: 'curl -fsSL https://rslvd.net/install.sh | bash' })
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
      React.createElement('h2', { style: { fontSize: 28, marginBottom: 8 } }, 'Simple, honest pricing'),
      React.createElement('p', { style: { color: 'var(--text2)', marginBottom: 40 } }, 'Start free. Upgrade when you need more. Cancel anytime.'),
      React.createElement('div', { className: 'pricing-grid' },
        plans.map(p => React.createElement('div', { key: p.key, className: `pricing-card${p.highlight ? ' popular' : ''}` },
          p.highlight && React.createElement('div', { className: 'popular-badge' }, 'Best value'),
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
      React.createElement('h2', { style: { fontSize: 32, marginBottom: 12 } }, 'Ready to get online?'),
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 16, marginBottom: 32 } }, 'Free forever for 2 hosts + 2 tunnels. No credit card. Live in under a minute.'),
      React.createElement('button', { className: 'btn btn-primary btn-lg', onClick: () => navigate('/register') }, 'Create your free account →')
    ),

    // ── Footer ────────────────────────────────────────────────────────────────
    React.createElement('footer', { style: { borderTop: '1px solid var(--border)', padding: '32px 24px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 } },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap', marginBottom: 16 } },
        React.createElement('a', { href: '#pricing', onClick: e => { e.preventDefault(); document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' }); }, style: { color: 'var(--text3)', textDecoration: 'none' } }, 'Pricing'),
        React.createElement('a', { href: '/login', onClick: e => { e.preventDefault(); navigate('/login'); }, style: { color: 'var(--text3)', textDecoration: 'none' } }, 'Login'),
        React.createElement('a', { href: '/register', onClick: e => { e.preventDefault(); navigate('/register'); }, style: { color: 'var(--text3)', textDecoration: 'none' } }, 'Register'),
        React.createElement('a', { href: '/tutorials', onClick: e => { e.preventDefault(); navigate('/tutorials'); }, style: { color: 'var(--text3)', textDecoration: 'none' } }, 'Tutorials'),
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
        : mode === 'login' ? 'Sign in to manage your hostnames and tunnels' : 'Free — 2 subdomains + 2 CGNAT tunnels, no credit card needed'
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
function TunnelRow({ tunnel: t, onDelete, onHttpsToggle, isNested }) {
  const [tab, setTab] = useState('client');
  const [showConnect, setShowConnect] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete tunnel ${t.name}?`)) return;
    setDeleting(true);
    try { await API.del(`/tunnels/${t.id}`); onDelete(t.id); }
    catch (err) { alert(err.message); setDeleting(false); }
  };

  const handleHttpsToggle = async () => {
    const next = !useHttps;
    setToggling(true);
    try {
      await API.patch(`/tunnels/${t.id}/https`, { force_https: next });
      if (onHttpsToggle) onHttpsToggle(t.id, next);
    } catch (err) { alert(err.message); }
    finally { setToggling(false); }
  };

  const fqdn = t.fqdn || `${t.name}.rslvd.net`;
  const protocol = t.protocol || 'tcp';
  const useHttps = t.force_https !== false;
  const publicUrl = `${useHttps ? 'https' : 'http'}://${fqdn}`;
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
        React.createElement('button', {
          className: `btn btn-sm ${useHttps ? 'btn-secondary' : 'btn-secondary'}`,
          onClick: handleHttpsToggle, disabled: toggling,
          title: useHttps ? 'HTTPS enabled (click to switch to HTTP)' : 'HTTP only (click to enable HTTPS)',
          style: { fontSize: 11, padding: '2px 8px', minWidth: 60, opacity: toggling ? 0.6 : 1 }
        }, toggling ? '...' : (useHttps ? '🔒 HTTPS' : '🔓 HTTP')),
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
function HostCard({ host: h, onDelete, onRegenKey, onHttpsToggle, isNested }) {
  const [showKey, setShowKey] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detectedIp, setDetectedIp] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [manualIp, setManualIp] = useState(['', '', '', '']);
  const [showManualIp, setShowManualIp] = useState(false);
  const [toggling, setToggling] = useState(false);

  const useHttps = h.force_https !== false;
  const manualIpString = manualIp.every(o => o && o >= 0 && o <= 255) ? manualIp.join('.') : null;
  const updateUrl = `https://rslvd.net/api/update?key=${h.update_key}&ip=${manualIpString || detectedIp || h.ip_address || 'auto'}`;

  const handleHttpsToggle = async () => {
    const next = !useHttps;
    setToggling(true);
    try {
      await API.patch(`/hosts/${h.id}/https`, { force_https: next });
      if (onHttpsToggle) onHttpsToggle(h.id, next);
    } catch (err) { alert(err.message); }
    finally { setToggling(false); }
  };

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
      React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        React.createElement('button', {
          className: 'btn btn-sm btn-secondary',
          onClick: handleHttpsToggle, disabled: toggling,
          title: useHttps ? 'HTTPS enabled (click to switch to HTTP)' : 'HTTP only (click to enable HTTPS)',
          style: { fontSize: 11, padding: '2px 8px', minWidth: 60, opacity: toggling ? 0.6 : 1 }
        }, toggling ? '...' : (useHttps ? '\ud83d\udd12 HTTPS' : '\ud83d\udd13 HTTP')),
        React.createElement('button', { className: 'btn btn-danger btn-sm', onClick: handleDelete, disabled: deleting },
          deleting ? React.createElement(Spinner) : 'Delete'
        )
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
function Dashboard({ user, navigate, refreshUser, pwa }) {
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
  const onHostHttpsToggle = (id, val) => setHosts(x => x.map(h => h.id === id ? { ...h, force_https: val } : h));
  const onTunnelCreated = t => { setTunnels(x => [t, ...x]); setShowAddTunnel(false); };
  const onTunnelDeleted = id => setTunnels(x => x.filter(t => t.id !== id));
  const onTunnelHttpsToggle = (id, val) => setTunnels(x => x.map(t => t.id === id ? { ...t, force_https: val } : t));

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
  const canAddHost = hosts.length < (user.maxHosts || 2);
  const canAddTunnel = tunnels.length < (user.maxTunnels || 2);

  return React.createElement('div', { className: 'dashboard' },
    msg && React.createElement(Alert, { type: 'success' }, msg),
    pwa && pwa.canInstall && React.createElement(InstallBanner, { install: pwa.install }),

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
        React.createElement('div', { className: 'stat-value' }, `${hosts.length}/${user.maxHosts >= 999999 ? '∞' : (user.maxHosts || 2)}`),
        React.createElement('div', { className: 'stat-label' }, 'Hostnames used')
      ),
      React.createElement('div', { className: 'stat-card' },
        React.createElement('div', { className: 'stat-value' }, `${tunnels.length}/${user.maxTunnels >= 999999 ? '∞' : (user.maxTunnels || 2)}`),
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
        '🎁 Free plan: 2 subdomains + 2 tunnels included. Upgrade for more. ',
        React.createElement('a', { href: '/tutorials/linux-subdomain', onClick: e => { e.preventDefault(); navigate('/tutorials/linux-subdomain'); }, style: { color: 'var(--accent2)', fontWeight: 600 } }, '🐧 Linux tutorial'),
        ' · ',
        React.createElement('a', { href: '/tutorials/windows-subdomain', onClick: e => { e.preventDefault(); navigate('/tutorials/windows-subdomain'); }, style: { color: 'var(--accent2)', fontWeight: 600 } }, '🪟 Windows tutorial')
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
              React.createElement(HostCard, { key: h.id, host: h, onDelete: onHostDeleted, onRegenKey, onHttpsToggle: onHostHttpsToggle, isNested: false }),
              ...children.filter(c => c.parent_host_id === h.id).map(c =>
                React.createElement(HostCard, { key: c.id, host: c, onDelete: onHostDeleted, onRegenKey, onHttpsToggle: onHostHttpsToggle, isNested: true })
              )
            ]);
          })(),
      !canAddHost && hosts.length > 0 && React.createElement('div', { className: 'card', style: { textAlign: 'center', padding: 24, marginTop: 12 } },
        React.createElement('p', { style: { color: 'var(--text2)', marginBottom: 12 } }, `Hostname limit reached (${user.maxHosts >= 999999 ? 'Unlimited' : user.maxHosts}). Upgrade for more.`),
        React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: () => setTab('billing') }, 'Upgrade')
      ),
      hosts.length > 0 && React.createElement(DDNSAutoUpdater, { hosts })
    ),

    // Tunnels tab
    tab === 'tunnels' && React.createElement('div', null,
      React.createElement('div', { className: 'flex-between mb-4' },
        React.createElement('h2', { className: 'section-title', style: { margin: 0 } }, 'Tunnels'),
        canAddTunnel && React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: () => setShowAddTunnel(true) }, '+ New tunnel')
      ),
      React.createElement(Alert, { type: 'info' },
        '🚇 Tunnels expose any local port to your own subdomain on rslvd.net — no SSH, no port-forwarding. Download the rslvd-tunnel binary and run one command. ',
        React.createElement('a', { href: '/tutorials/linux-tunnel', onClick: e => { e.preventDefault(); navigate('/tutorials/linux-tunnel'); }, style: { color: 'var(--accent2)', fontWeight: 600 } }, '🐧 Linux tutorial'),
        ' · ',
        React.createElement('a', { href: '/tutorials/windows-tunnel', onClick: e => { e.preventDefault(); navigate('/tutorials/windows-tunnel'); }, style: { color: 'var(--accent2)', fontWeight: 600 } }, '🪟 Windows tutorial')
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
              React.createElement(TunnelRow, { key: t.id, tunnel: t, onDelete: onTunnelDeleted, onHttpsToggle: onTunnelHttpsToggle, isNested: false }),
              ...children.filter(c => c.parent_tunnel_id === t.id).map(c =>
                React.createElement(TunnelRow, { key: c.id, tunnel: c, onDelete: onTunnelDeleted, onHttpsToggle: onTunnelHttpsToggle, isNested: true })
              )
            ]);
          })(),
      !canAddTunnel && tunnels.length > 0 && React.createElement('div', { className: 'card', style: { textAlign: 'center', padding: 24, marginTop: 12 } },
        React.createElement('p', { style: { color: 'var(--text2)', marginBottom: 12 } }, `Tunnel limit reached (${user.maxTunnels >= 999999 ? 'Unlimited' : user.maxTunnels}). Upgrade for more.`),
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
                React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14 } }, `${user.maxHosts >= 999999 ? 'Unlimited' : user.maxHosts} hostnames · ${user.maxTunnels >= 999999 ? 'Unlimited' : user.maxTunnels} tunnels`),
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
                React.createElement('li', null, `${p.maxHosts >= 999999 ? 'Unlimited' : p.maxHosts} hostnames`),
                React.createElement('li', null, `${p.maxTunnels >= 999999 ? 'Unlimited' : p.maxTunnels} tunnels`),
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

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (tab === 'hosts' && hosts.length === 0) loadHosts();
    if (tab === 'tunnels' && tunnels.length === 0) loadTunnels();
    if (tab === 'activity' && activity.length === 0) loadActivity();
  }, [tab]);

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
    React.createElement('div', { style: { display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' } },
      (isSiteOwner
        ? ['overview', 'users', 'hosts', 'tunnels', 'activity', 'reserved']
        : ['overview', 'users', 'hosts', 'tunnels', 'activity']
      ).map(t =>
        React.createElement('button', {
          key: t, onClick: () => setTab(t),
          style: { padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'Inter, sans-serif', color: tab === t ? 'var(--text)' : 'var(--text2)', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1 }
        }, t === 'reserved' ? '🔒 Reserved' : t === 'activity' ? '📋 Activity' : t.charAt(0).toUpperCase() + t.slice(1))
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
        [['Plan', user.plan], ['Status', user.status], ['Hostnames', user.maxHosts >= 999999 ? 'Unlimited' : user.maxHosts], ['Tunnels', user.maxTunnels >= 999999 ? 'Unlimited' : user.maxTunnels], ['Role', user.role]].map(([k, v]) =>
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

// ── Terms of Service ──────────────────────────────────────────────────────────
function TermsPage({ navigate }) {
  return React.createElement(LegalPage, { title: 'Terms of Service', navigate },
    React.createElement(P, null, 'By accessing or using rslvd.net (the "Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.'),

    React.createElement(Section, { title: '1. Description of Service' },
      React.createElement(P, null, 'rslvd.net provides Dynamic DNS, CGNAT tunnel, and related networking services that allow users to expose local network services to the internet via a permanent subdomain on the rslvd.net domain. The Service is provided "as is" and is subject to change at any time.')
    ),

    React.createElement(Section, { title: '2. Eligibility' },
      React.createElement(P, null, 'You must be at least 13 years of age to use the Service. By registering, you represent that you meet this requirement and that all information you provide is accurate and complete.')
    ),

    React.createElement(Section, { title: '3. Accounts' },
      React.createElement(P, null, 'You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must notify us immediately of any unauthorised use. We reserve the right to suspend or terminate accounts that violate these Terms.')
    ),

    React.createElement(Section, { title: '4. Acceptable Use' },
      React.createElement(P, null, 'You agree not to use the Service to:'),
      React.createElement(Li, { items: [
        'Host or transmit illegal content, including but not limited to malware, child exploitation material, or content that violates applicable law.',
        'Launch denial-of-service attacks, port scans, or any form of network abuse.',
        'Spam, phish, or conduct any fraudulent activity.',
        'Circumvent security controls or attempt to gain unauthorised access to any system.',
        'Resell or sublicense access to the Service without written permission.',
        'Consume excessive bandwidth or resources in a manner that degrades service for other users.',
      ]})
    ),

    React.createElement(Section, { title: '5. Tunnels and Subdomains' },
      React.createElement(P, null, 'Subdomains and tunnel tokens are assigned to your account and may not be transferred. We reserve the right to reclaim any subdomain that violates these Terms or has been inactive for more than 90 days on a free plan. Tunnel traffic is proxied through our servers; you are solely responsible for the content and services you expose.')
    ),

    React.createElement(Section, { title: '6. Billing and Refunds' },
      React.createElement(P, null, 'Paid plans are billed in advance through Stripe. All charges are non-refundable except where required by applicable law. Downgrading or cancelling a plan takes effect at the end of the current billing period. We reserve the right to change pricing with 30 days notice.')
    ),

    React.createElement(Section, { title: '7. Intellectual Property' },
      React.createElement(P, null, 'rslvd.net and all associated software, branding, and content are the property of rslvd.net. You retain ownership of any content you transmit through the Service. You grant us a limited, non-exclusive licence to route and proxy your traffic solely for the purpose of providing the Service.')
    ),

    React.createElement(Section, { title: '8. Uptime and Availability' },
      React.createElement(P, null, 'We do not guarantee uninterrupted or error-free operation of the Service. Planned and unplanned maintenance may cause downtime. The Service is provided without warranty of any kind, express or implied, including warranties of merchantability or fitness for a particular purpose.')
    ),

    React.createElement(Section, { title: '9. Limitation of Liability' },
      React.createElement(P, null, 'To the maximum extent permitted by law, rslvd.net shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of data, revenue, or profits, arising from your use of the Service. Our total liability to you shall not exceed the amount you paid us in the 12 months preceding the claim.')
    ),

    React.createElement(Section, { title: '10. Termination' },
      React.createElement(P, null, 'We may suspend or terminate your access to the Service at any time, with or without notice, for any violation of these Terms. Upon termination, your subdomains and tunnels will be deactivated and DNS records removed. You may delete your account at any time from your dashboard.')
    ),

    React.createElement(Section, { title: '11. Governing Law' },
      React.createElement(P, null, 'These Terms are governed by the laws of the jurisdiction in which rslvd.net operates, without regard to conflict of law principles. Any disputes shall be resolved in the courts of that jurisdiction.')
    ),

    React.createElement(Section, { title: '12. Changes to Terms' },
      React.createElement(P, null, 'We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance. We will notify users of material changes by email where possible.')
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

// ── PWA Install Prompt ──────────────────────────────────────────────────────
let _deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  window.dispatchEvent(new Event('pwa-installable'));
});

function useInstallPrompt() {
  const [canInstall, setCanInstall] = useState(!!_deferredInstallPrompt);
  const [isInstalled, setIsInstalled] = useState(
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  );
  useEffect(() => {
    const h = () => setCanInstall(true);
    window.addEventListener('pwa-installable', h);
    return () => window.removeEventListener('pwa-installable', h);
  }, []);
  const install = async () => {
    if (!_deferredInstallPrompt) return;
    _deferredInstallPrompt.prompt();
    const result = await _deferredInstallPrompt.userChoice;
    if (result.outcome === 'accepted') { setCanInstall(false); setIsInstalled(true); }
    _deferredInstallPrompt = null;
  };
  return { canInstall, isInstalled, install };
}

function InstallBanner({ install }) {
  const [dismissed, setDismissed] = useState(localStorage.getItem('pwa-banner-dismissed') === '1');
  if (dismissed) return null;
  const dismiss = () => { localStorage.setItem('pwa-banner-dismissed', '1'); setDismissed(true); };
  return React.createElement('div', {
    style: { background: 'var(--accent-bg)', border: '1px solid var(--accent)', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }
  },
    React.createElement('div', null,
      React.createElement('div', { style: { fontWeight: 600, fontSize: 15, marginBottom: 2 } }, 'Install rslvd.net'),
      React.createElement('div', { style: { fontSize: 13, color: 'var(--text2)' } }, 'Get the app on your device — manage DNS & tunnels offline, auto-update your IP in the background.')
    ),
    React.createElement('div', { style: { display: 'flex', gap: 8 } },
      React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: install }, 'Install app'),
      React.createElement('button', { className: 'btn btn-secondary btn-sm', onClick: dismiss, style: { padding: '6px 10px' } }, '×')
    )
  );
}

// ── DDNS Auto-Updater ──────────────────────────────────────────────────────
function DDNSAutoUpdater({ hosts }) {
  const [enabled, setEnabled] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ddns-auto-update') || 'false'); } catch { return false; }
  });
  const [selectedHosts, setSelectedHosts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ddns-auto-hosts') || '[]'); } catch { return []; }
  });
  const [lastIp, setLastIp] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState('');

  const hostsWithKey = hosts.filter(h => h.update_key);

  // Listen for SW messages
  useEffect(() => {
    if (!navigator.serviceWorker) return;
    const handler = (e) => {
      if (e.data?.type === 'ddns-updated') {
        setLastIp(e.data.ip);
        setLastUpdate(new Date().toLocaleTimeString());
        setStatus('Updated via background sync');
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // Save config to localStorage + SW IndexedDB
  useEffect(() => {
    localStorage.setItem('ddns-auto-update', JSON.stringify(enabled));
    localStorage.setItem('ddns-auto-hosts', JSON.stringify(selectedHosts));

    // Update SW config
    if (navigator.serviceWorker?.controller) {
      const config = {
        hosts: selectedHosts.map(id => {
          const h = hosts.find(x => x.id === id);
          return h ? { id: h.id, fqdn: h.fqdn, updateKey: h.update_key, enabled: true, lastIp: null } : null;
        }).filter(Boolean)
      };
      // Write to IndexedDB for SW access
      const req = indexedDB.open('rslvd-sw', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(config, 'ddns-config');
      };
    }

    // Register periodic background sync if supported
    if (enabled && navigator.serviceWorker?.ready) {
      navigator.serviceWorker.ready.then(reg => {
        if (reg.periodicSync) {
          reg.periodicSync.register('ddns-update', { minInterval: 15 * 60 * 1000 }).catch(() => {});
        }
      });
    }
  }, [enabled, selectedHosts]);

  const toggleHost = (id) => {
    setSelectedHosts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const updateNow = async () => {
    if (selectedHosts.length === 0) return;
    setUpdating(true); setStatus('');
    try {
      const ipRes = await fetch('/api/ip');
      if (!ipRes.ok) throw new Error('Could not detect IP');
      const { ip } = await ipRes.json();
      setLastIp(ip);

      let updated = 0;
      for (const id of selectedHosts) {
        const h = hosts.find(x => x.id === id);
        if (!h?.update_key) continue;
        const res = await fetch(`/api/update?key=${encodeURIComponent(h.update_key)}&ip=${encodeURIComponent(ip)}`);
        if (res.ok) updated++;
      }
      setLastUpdate(new Date().toLocaleTimeString());
      setStatus(`Updated ${updated} host(s) to ${ip}`);
    } catch (err) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };

  if (hostsWithKey.length === 0) return null;

  return React.createElement('div', { className: 'card', style: { marginBottom: 24 } },
    React.createElement('div', { className: 'flex-between', style: { marginBottom: 16 } },
      React.createElement('div', null,
        React.createElement('h3', { style: { fontSize: 16, marginBottom: 4 } }, 'DDNS Auto-Updater'),
        React.createElement('p', { style: { fontSize: 13, color: 'var(--text2)' } },
          'Keep your subdomains pointed at this device\'s IP — works in the background when the app is installed.'
        )
      ),
      React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' } },
        React.createElement('input', {
          type: 'checkbox', checked: enabled,
          onChange: () => setEnabled(!enabled),
          style: { width: 18, height: 18, accentColor: 'var(--accent)' }
        }),
        React.createElement('span', { style: { fontSize: 13, fontWeight: 500 } }, enabled ? 'Enabled' : 'Disabled')
      )
    ),

    enabled && React.createElement('div', null,
      React.createElement('div', { style: { fontSize: 13, fontWeight: 500, color: 'var(--text2)', marginBottom: 8 } }, 'Select hosts to auto-update:'),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 } },
        hostsWithKey.map(h => React.createElement('label', {
          key: h.id,
          style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: selectedHosts.includes(h.id) ? 'var(--accent-bg)' : 'var(--bg3)', borderRadius: 8, cursor: 'pointer', border: '1px solid', borderColor: selectedHosts.includes(h.id) ? 'var(--accent)' : 'var(--border)' }
        },
          React.createElement('input', {
            type: 'checkbox', checked: selectedHosts.includes(h.id),
            onChange: () => toggleHost(h.id),
            style: { width: 16, height: 16, accentColor: 'var(--accent)' }
          }),
          React.createElement('span', { style: { fontSize: 14, fontWeight: 500 } }, h.fqdn),
          h.ip_address && React.createElement('span', { style: { fontSize: 12, color: 'var(--text3)', marginLeft: 'auto' } }, h.ip_address)
        ))
      ),

      React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        React.createElement('button', {
          className: 'btn btn-primary btn-sm',
          onClick: updateNow,
          disabled: updating || selectedHosts.length === 0
        }, updating ? React.createElement(Spinner) : 'Update now'),
        lastIp && React.createElement('span', { style: { fontSize: 12, color: 'var(--text3)' } },
          `IP: ${lastIp}`, lastUpdate && ` (${lastUpdate})`
        )
      ),

      status && React.createElement('div', {
        style: { marginTop: 8, fontSize: 12, color: status.startsWith('Error') ? 'var(--red)' : 'var(--green)' }
      }, status),

      !window.matchMedia('(display-mode: standalone)').matches &&
        React.createElement('p', { style: { fontSize: 12, color: 'var(--text3)', marginTop: 12, fontStyle: 'italic' } },
          'Tip: Install this app for automatic background updates even when the browser is closed.'
        )
    )
  );
}

// ── Tutorial shared helpers ──────────────────────────────────────────────────
function TutorialLayout({ title, navigate, children }) {
  return React.createElement('div', { className: 'page', style: { maxWidth: 800, margin: '0 auto', padding: '32px 24px' } },
    React.createElement('button', { className: 'btn btn-secondary btn-sm', style: { marginBottom: 24 }, onClick: () => navigate('/') }, '← Back'),
    React.createElement('h1', { style: { fontSize: 28, marginBottom: 8 } }, title),
    React.createElement('div', { style: { color: 'var(--text2)', fontSize: 14, marginBottom: 32 } },
      'All tokens and keys shown in screenshots below are ', React.createElement('span', { style: { background: '#ef4444', color: '#fff', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600, letterSpacing: 1 } }, 'REDACTED'), ' for security.'
    ),
    children
  );
}

function TutorialStep({ num, title, children }) {
  return React.createElement('div', { style: { display: 'flex', gap: 16, marginBottom: 32 } },
    React.createElement('div', { style: { width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0, marginTop: 2 } }, num),
    React.createElement('div', { style: { flex: 1 } },
      React.createElement('h3', { style: { fontSize: 16, marginBottom: 8 } }, title),
      children
    )
  );
}

function TutorialScreenshot({ src, alt }) {
  return React.createElement('img', {
    src, alt: alt || '',
    style: { width: '100%', borderRadius: 8, border: '1px solid var(--border)', marginTop: 12, marginBottom: 8 },
    loading: 'lazy'
  });
}

function TutorialNote({ children }) {
  return React.createElement('div', { style: { background: 'rgba(108,99,255,.08)', border: '1px solid rgba(108,99,255,.2)', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: 'var(--text2)', marginTop: 8, marginBottom: 8 } }, children);
}

// ── Tutorial: Linux Subdomain Setup ─────────────────────────────────────────
function TutorialLinuxSubdomain({ navigate }) {
  return React.createElement(TutorialLayout, { title: '🐧 Linux — Dynamic DNS Subdomain Setup', navigate },
    React.createElement('p', { style: { color: 'var(--text2)', fontSize: 15, lineHeight: 1.7, marginBottom: 32 } },
      'This guide walks you through setting up a free rslvd.net subdomain on Linux so your home server is always reachable by name — even when your IP changes. Takes about 2 minutes.'
    ),

    React.createElement(TutorialStep, { num: '1', title: 'Create a free account' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Go to ', React.createElement('a', { href: 'https://rslvd.net/register', style: { color: 'var(--accent2)' } }, 'rslvd.net/register'), ' and create your account. The free tier includes 1 subdomain — no credit card needed.'
      ),
      React.createElement(TutorialScreenshot, { src: '/img/tutorials/register.png', alt: 'Registration page' })
    ),

    React.createElement(TutorialStep, { num: '2', title: 'Create a hostname' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'After logging in, go to your Dashboard → Hosts tab and click ', React.createElement('strong', null, '+ Add hostname'), '. Enter your desired subdomain name (e.g. "myserver") and click Create.'
      ),
      React.createElement(TutorialScreenshot, { src: '/img/tutorials/add-host.png', alt: 'Add hostname modal' }),
      React.createElement(TutorialNote, null, 'Your subdomain will be yourname.rslvd.net — choose something memorable.')
    ),

    React.createElement(TutorialStep, { num: '3', title: 'Copy your update URL' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Once created, your host card shows a ', React.createElement('strong', null, 'Router DDNS URL'), '. This is the URL you\'ll use to update your IP. Click ', React.createElement('strong', null, 'Copy'), ' to grab it.'
      ),
      React.createElement(TutorialScreenshot, { src: '/img/tutorials/dashboard-hosts.png', alt: 'Dashboard hosts tab with update URL' }),
      React.createElement(TutorialNote, null,
        'The URL format is: https://rslvd.net/api/update?key=YOUR_KEY&ip=auto — the "auto" parameter tells the server to detect your public IP automatically.'
      )
    ),

    React.createElement(TutorialStep, { num: '4', title: 'Test the update' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Open a terminal and run the curl command with your update URL to verify it works:'
      ),
      React.createElement('div', { className: 'card', style: { fontFamily: 'monospace', fontSize: 13, padding: '12px 16px', background: 'var(--bg3)', marginTop: 8 } },
        React.createElement('code', null, 'curl -s "https://rslvd.net/api/update?key=YOUR_UPDATE_KEY&ip=auto"')
      ),
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, marginTop: 8 } },
        'You should see a JSON response confirming the update:'
      ),
      React.createElement('div', { className: 'card', style: { fontFamily: 'monospace', fontSize: 13, padding: '12px 16px', background: 'var(--bg3)', color: '#3fb950', marginTop: 8 } },
        React.createElement('code', null, '{"success":true,"ip":"203.0.113.42","fqdn":"myserver.rslvd.net"}')
      ),
      React.createElement(TutorialScreenshot, { src: '/img/tutorials/terminal-linux-subdomain.png', alt: 'Terminal showing curl update and cron setup' })
    ),

    React.createElement(TutorialStep, { num: '5', title: 'Set up automatic updates with cron' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'To keep your subdomain always pointing to your current IP, set up a cron job that runs every 5 minutes:'
      ),
      React.createElement('div', { className: 'card', style: { fontFamily: 'monospace', fontSize: 13, padding: '12px 16px', background: 'var(--bg3)', marginTop: 8 } },
        React.createElement('code', null, 'crontab -e')
      ),
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, marginTop: 8 } },
        'Add this line at the bottom of your crontab (replace YOUR_UPDATE_KEY with your actual key):'
      ),
      React.createElement('div', { className: 'card', style: { fontFamily: 'monospace', fontSize: 13, padding: '12px 16px', background: 'var(--bg3)', marginTop: 8 } },
        React.createElement('code', null, '*/5 * * * * curl -s "https://rslvd.net/api/update?key=YOUR_UPDATE_KEY&ip=auto" > /dev/null')
      ),
      React.createElement(TutorialNote, null,
        'This runs every 5 minutes. If your IP changes, it updates within 5 minutes automatically. You can also use systemd timers for more control.'
      )
    ),

    React.createElement(TutorialStep, { num: '6', title: 'Verify and test' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Confirm your cron job is saved:'
      ),
      React.createElement('div', { className: 'card', style: { fontFamily: 'monospace', fontSize: 13, padding: '12px 16px', background: 'var(--bg3)', marginTop: 8 } },
        React.createElement('code', null, 'crontab -l | grep rslvd')
      ),
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, marginTop: 8 } },
        'Then verify DNS resolution:'
      ),
      React.createElement('div', { className: 'card', style: { fontFamily: 'monospace', fontSize: 13, padding: '12px 16px', background: 'var(--bg3)', marginTop: 8 } },
        React.createElement('code', null, 'dig +short myserver.rslvd.net')
      ),
      React.createElement(TutorialNote, null, 'DNS propagation usually happens within 60 seconds. If it doesn\'t resolve yet, wait a minute and try again.')
    ),

    React.createElement('div', { style: { marginTop: 40, padding: '20px 24px', background: 'var(--bg3)', borderRadius: 12, textAlign: 'center' } },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, marginBottom: 12 } }, 'Done! Your subdomain will now always point to your current IP.'),
      React.createElement('div', { style: { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' } },
        React.createElement('button', { className: 'btn btn-primary', onClick: () => navigate('/tutorials/linux-tunnel') }, 'Next: Set up a tunnel →'),
        React.createElement('button', { className: 'btn btn-secondary', onClick: () => navigate('/dashboard') }, 'Go to Dashboard')
      )
    )
  );
}

// ── Tutorial: Windows Subdomain Setup ───────────────────────────────────────
function TutorialWindowsSubdomain({ navigate }) {
  return React.createElement(TutorialLayout, { title: '🪟 Windows — Dynamic DNS Subdomain Setup', navigate },
    React.createElement('p', { style: { color: 'var(--text2)', fontSize: 15, lineHeight: 1.7, marginBottom: 32 } },
      'This guide walks you through setting up a free rslvd.net subdomain on Windows so your home server is always reachable by name — even when your IP changes. Takes about 2 minutes.'
    ),

    React.createElement(TutorialStep, { num: '1', title: 'Create a free account' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Go to ', React.createElement('a', { href: 'https://rslvd.net/register', style: { color: 'var(--accent2)' } }, 'rslvd.net/register'), ' and create your account. The free tier includes 1 subdomain — no credit card needed.'
      ),
      React.createElement(TutorialScreenshot, { src: '/img/tutorials/register.png', alt: 'Registration page' })
    ),

    React.createElement(TutorialStep, { num: '2', title: 'Create a hostname' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'After logging in, go to your Dashboard → Hosts tab and click ', React.createElement('strong', null, '+ Add hostname'), '. Enter your desired subdomain name (e.g. "myserver") and click Create.'
      ),
      React.createElement(TutorialScreenshot, { src: '/img/tutorials/add-host.png', alt: 'Add hostname modal' }),
      React.createElement(TutorialNote, null, 'Your subdomain will be yourname.rslvd.net — choose something memorable.')
    ),

    React.createElement(TutorialStep, { num: '3', title: 'Copy your update URL' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Your host card shows a ', React.createElement('strong', null, 'Router DDNS URL'), '. Click ', React.createElement('strong', null, 'Copy'), ' to grab it.'
      ),
      React.createElement(TutorialScreenshot, { src: '/img/tutorials/dashboard-hosts.png', alt: 'Dashboard hosts tab' })
    ),

    React.createElement(TutorialStep, { num: '4', title: 'Test the update in PowerShell' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Open ', React.createElement('strong', null, 'PowerShell'), ' (right-click Start → Windows PowerShell) and run:'
      ),
      React.createElement('div', { className: 'card', style: { fontFamily: 'monospace', fontSize: 13, padding: '12px 16px', background: 'var(--bg3)', marginTop: 8 } },
        React.createElement('code', null, 'Invoke-RestMethod "https://rslvd.net/api/update?key=YOUR_UPDATE_KEY&ip=auto"')
      ),
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, marginTop: 8 } },
        'You should see:'
      ),
      React.createElement('div', { className: 'card', style: { fontFamily: 'monospace', fontSize: 13, padding: '12px 16px', background: 'var(--bg3)', color: '#3fb950', marginTop: 8 } },
        React.createElement('code', null, 'success : True\nip      : 203.0.113.42\nfqdn    : myserver.rslvd.net')
      ),
      React.createElement(TutorialScreenshot, { src: '/img/tutorials/terminal-windows-subdomain.png', alt: 'PowerShell DDNS update' })
    ),

    React.createElement(TutorialStep, { num: '5', title: 'Set up automatic updates with Task Scheduler' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Run these PowerShell commands ', React.createElement('strong', null, 'as Administrator'), ' to create a scheduled task that updates every 5 minutes:'
      ),
      React.createElement('div', { className: 'card', style: { fontFamily: 'monospace', fontSize: 12, padding: '12px 16px', background: 'var(--bg3)', marginTop: 8, lineHeight: 1.8 } },
        React.createElement('code', null,
          '$action = New-ScheduledTaskAction `\n',
          '  -Execute "powershell.exe" `\n',
          '  -Argument \'-Command "Invoke-RestMethod \'\'https://rslvd.net/api/update?key=YOUR_UPDATE_KEY&ip=auto\'\'"\'\n\n',
          '$trigger = New-ScheduledTaskTrigger `\n',
          '  -RepetitionInterval (New-TimeSpan -Minutes 5) `\n',
          '  -Once -At (Get-Date)\n\n',
          'Register-ScheduledTask -TaskName "rslvd-ddns" `\n',
          '  -Action $action -Trigger $trigger `\n',
          '  -Description "Update rslvd.net DDNS"'
        )
      ),
      React.createElement(TutorialNote, null,
        'Replace YOUR_UPDATE_KEY with the key from your dashboard. The task runs every 5 minutes even when you\'re not logged in.'
      )
    ),

    React.createElement(TutorialStep, { num: '6', title: 'Verify and test' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Verify the scheduled task was created:'
      ),
      React.createElement('div', { className: 'card', style: { fontFamily: 'monospace', fontSize: 13, padding: '12px 16px', background: 'var(--bg3)', marginTop: 8 } },
        React.createElement('code', null, 'Get-ScheduledTask -TaskName "rslvd-ddns"')
      ),
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, marginTop: 8 } },
        'Test DNS resolution:'
      ),
      React.createElement('div', { className: 'card', style: { fontFamily: 'monospace', fontSize: 13, padding: '12px 16px', background: 'var(--bg3)', marginTop: 8 } },
        React.createElement('code', null, 'nslookup myserver.rslvd.net')
      ),
      React.createElement(TutorialNote, null, 'DNS propagation usually happens within 60 seconds.')
    ),

    React.createElement('div', { style: { marginTop: 40, padding: '20px 24px', background: 'var(--bg3)', borderRadius: 12, textAlign: 'center' } },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, marginBottom: 12 } }, 'Done! Your subdomain will now always point to your current IP.'),
      React.createElement('div', { style: { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' } },
        React.createElement('button', { className: 'btn btn-primary', onClick: () => navigate('/tutorials/windows-tunnel') }, 'Next: Set up a tunnel →'),
        React.createElement('button', { className: 'btn btn-secondary', onClick: () => navigate('/dashboard') }, 'Go to Dashboard')
      )
    )
  );
}

// ── Tutorial: Linux Tunnel Setup ────────────────────────────────────────────
function TutorialLinuxTunnel({ navigate }) {
  return React.createElement(TutorialLayout, { title: '🐧 Linux — CGNAT Tunnel Setup', navigate },
    React.createElement('p', { style: { color: 'var(--text2)', fontSize: 15, lineHeight: 1.7, marginBottom: 32 } },
      'This guide shows you how to expose a local service (like a web server on localhost:3000) to the internet using an rslvd.net tunnel — even if you\'re behind CGNAT or double NAT. Takes about 1 minute.'
    ),

    React.createElement(TutorialStep, { num: '1', title: 'Create a free account' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Go to ', React.createElement('a', { href: 'https://rslvd.net/register', style: { color: 'var(--accent2)' } }, 'rslvd.net/register'), ' and sign up. Free tier includes 2 tunnels — no credit card required.'
      ),
      React.createElement(TutorialScreenshot, { src: '/img/tutorials/register.png', alt: 'Registration page' })
    ),

    React.createElement(TutorialStep, { num: '2', title: 'Create a tunnel' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Go to Dashboard → Tunnels tab and click ', React.createElement('strong', null, '+ New tunnel'), '. Choose a subdomain name, set the target port (the local port your service runs on, e.g. 3000), and select the protocol (TCP is the default).'
      ),
      React.createElement(TutorialNote, null, 'TCP works for HTTP, HTTPS, WebSockets, SSH, and most protocols. Use UDP for game servers or VoIP. Use DNS2TCP only if your network blocks all other traffic.')
    ),

    React.createElement(TutorialStep, { num: '3', title: 'Install the tunnel client' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Click ', React.createElement('strong', null, '⚡ Connect'), ' on your tunnel card and select the ', React.createElement('strong', null, '🐧 Linux / Mac / Termux'), ' tab. Run the install command:'
      ),
      React.createElement('div', { className: 'card', style: { fontFamily: 'monospace', fontSize: 13, padding: '12px 16px', background: 'var(--bg3)', marginTop: 8 } },
        React.createElement('code', null, 'curl -fsSL https://rslvd.net/install.sh | bash')
      ),
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, marginTop: 8 } },
        'This downloads the correct binary for your architecture (amd64, arm64, etc.) and installs it to /usr/local/bin.'
      ),
      React.createElement(TutorialScreenshot, { src: '/img/tutorials/dashboard-tunnels-linux.png', alt: 'Tunnel connect panel — Linux tab' })
    ),

    React.createElement(TutorialStep, { num: '4', title: 'Start the tunnel' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Run the tunnel command shown in your dashboard (Step 2 in the connect panel):'
      ),
      React.createElement('div', { className: 'card', style: { fontFamily: 'monospace', fontSize: 13, padding: '12px 16px', background: 'var(--bg3)', marginTop: 8 } },
        React.createElement('code', null, 'rslvd-tunnel YOUR_TUNNEL_TOKEN 3000')
      ),
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, marginTop: 8 } },
        'Replace 3000 with whatever port your service runs on. The tunnel auto-reconnects if the connection drops.'
      ),
      React.createElement(TutorialScreenshot, { src: '/img/tutorials/terminal-linux-tunnel.png', alt: 'Terminal showing tunnel running' }),
      React.createElement(TutorialNote, null,
        'For UDP services, use: rslvd-tunnel -udp YOUR_TOKEN PORT\n' +
        'For DNS2TCP mode, use: rslvd-tunnel -dns YOUR_TOKEN PORT'
      )
    ),

    React.createElement(TutorialStep, { num: '5', title: 'Access your service' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Your service is now live at ', React.createElement('strong', null, 'https://yourname.rslvd.net'), '. Open it in any browser from anywhere in the world. All traffic is encrypted via our wildcard SSL certificate.'
      ),
      React.createElement(TutorialNote, null, 'The tunnel stays active as long as the rslvd-tunnel process is running. To run it as a background service, see Step 6.')
    ),

    React.createElement(TutorialStep, { num: '6', title: 'Run on boot (optional)' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Create a systemd service to start the tunnel automatically on boot:'
      ),
      React.createElement('div', { className: 'card', style: { fontFamily: 'monospace', fontSize: 12, padding: '12px 16px', background: 'var(--bg3)', marginTop: 8, lineHeight: 1.8 } },
        React.createElement('code', null,
          'sudo tee /etc/systemd/system/rslvd-tunnel.service << EOF\n' +
          '[Unit]\n' +
          'Description=rslvd.net tunnel\n' +
          'After=network-online.target\n' +
          'Wants=network-online.target\n\n' +
          '[Service]\n' +
          'ExecStart=/usr/local/bin/rslvd-tunnel YOUR_TOKEN 3000\n' +
          'Restart=always\n' +
          'RestartSec=5\n\n' +
          '[Install]\n' +
          'WantedBy=multi-user.target\n' +
          'EOF\n\n' +
          'sudo systemctl enable --now rslvd-tunnel'
        )
      ),
      React.createElement(TutorialNote, null, 'The service auto-restarts if it crashes and starts on every boot.')
    ),

    React.createElement('div', { style: { marginTop: 40, padding: '20px 24px', background: 'var(--bg3)', borderRadius: 12, textAlign: 'center' } },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, marginBottom: 12 } }, 'Your local service is now accessible from anywhere on the internet!'),
      React.createElement('div', { style: { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' } },
        React.createElement('button', { className: 'btn btn-primary', onClick: () => navigate('/tutorials/linux-subdomain') }, '← Subdomain setup'),
        React.createElement('button', { className: 'btn btn-secondary', onClick: () => navigate('/dashboard') }, 'Go to Dashboard')
      )
    )
  );
}

// ── Tutorial: Windows Tunnel Setup ──────────────────────────────────────────
function TutorialWindowsTunnel({ navigate }) {
  return React.createElement(TutorialLayout, { title: '🪟 Windows — CGNAT Tunnel Setup', navigate },
    React.createElement('p', { style: { color: 'var(--text2)', fontSize: 15, lineHeight: 1.7, marginBottom: 32 } },
      'This guide shows you how to expose a local service (like a web server on localhost:3000) to the internet using an rslvd.net tunnel on Windows — even behind CGNAT. Takes about 1 minute.'
    ),

    React.createElement(TutorialStep, { num: '1', title: 'Create a free account' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Go to ', React.createElement('a', { href: 'https://rslvd.net/register', style: { color: 'var(--accent2)' } }, 'rslvd.net/register'), ' and sign up. Free tier includes 2 tunnels — no credit card required.'
      ),
      React.createElement(TutorialScreenshot, { src: '/img/tutorials/register.png', alt: 'Registration page' })
    ),

    React.createElement(TutorialStep, { num: '2', title: 'Create a tunnel' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Go to Dashboard → Tunnels tab and click ', React.createElement('strong', null, '+ New tunnel'), '. Choose a subdomain, set the target port (e.g. 3000), and select TCP protocol.'
      ),
      React.createElement(TutorialNote, null, 'TCP works for HTTP, HTTPS, WebSockets, SSH, RDP, and most protocols.')
    ),

    React.createElement(TutorialStep, { num: '3', title: 'Download the tunnel client' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Click ', React.createElement('strong', null, '⚡ Connect'), ' on your tunnel card and select the ', React.createElement('strong', null, '🪟 Windows'), ' tab. Click the download button to get the .exe file.'
      ),
      React.createElement('div', { style: { marginTop: 8 } },
        React.createElement('a', {
          href: 'https://rslvd.net/dl/rslvd-tunnel-windows-amd64.exe',
          className: 'btn btn-secondary btn-sm',
          style: { display: 'inline-flex', alignItems: 'center', gap: 6 }
        }, '⬇ Download rslvd-tunnel-windows-amd64.exe')
      ),
      React.createElement(TutorialScreenshot, { src: '/img/tutorials/dashboard-tunnels-windows.png', alt: 'Tunnel connect panel — Windows tab' }),
      React.createElement(TutorialNote, null, 'No installation required — it\'s a single portable .exe file. No dependencies, no admin rights needed.')
    ),

    React.createElement(TutorialStep, { num: '4', title: 'Run the tunnel' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Open ', React.createElement('strong', null, 'PowerShell'), ' in the folder where you downloaded the file and run:'
      ),
      React.createElement('div', { className: 'card', style: { fontFamily: 'monospace', fontSize: 13, padding: '12px 16px', background: 'var(--bg3)', marginTop: 8 } },
        React.createElement('code', null, '.\\rslvd-tunnel-windows-amd64.exe YOUR_TUNNEL_TOKEN 3000')
      ),
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6, marginTop: 8 } },
        'Replace 3000 with your service\'s port. The tunnel auto-reconnects if the connection drops.'
      ),
      React.createElement(TutorialScreenshot, { src: '/img/tutorials/terminal-windows-tunnel.png', alt: 'PowerShell running tunnel' }),
      React.createElement(TutorialNote, null,
        'For UDP: .\\rslvd-tunnel-windows-amd64.exe -udp YOUR_TOKEN PORT\n' +
        'For DNS2TCP: .\\rslvd-tunnel-windows-amd64.exe -dns YOUR_TOKEN PORT'
      )
    ),

    React.createElement(TutorialStep, { num: '5', title: 'Access your service' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'Your service is now live at ', React.createElement('strong', null, 'https://yourname.rslvd.net'), '. Open it in any browser from anywhere. HTTPS is automatic via our wildcard SSL certificate.'
      )
    ),

    React.createElement(TutorialStep, { num: '6', title: 'Run on startup (optional)' },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, lineHeight: 1.6 } },
        'To auto-start the tunnel when Windows boots, create a scheduled task:'
      ),
      React.createElement('div', { className: 'card', style: { fontFamily: 'monospace', fontSize: 12, padding: '12px 16px', background: 'var(--bg3)', marginTop: 8, lineHeight: 1.8 } },
        React.createElement('code', null,
          '$action = New-ScheduledTaskAction `\n' +
          '  -Execute "C:\\path\\to\\rslvd-tunnel-windows-amd64.exe" `\n' +
          '  -Argument "YOUR_TOKEN 3000"\n\n' +
          '$trigger = New-ScheduledTaskTrigger -AtStartup\n\n' +
          'Register-ScheduledTask -TaskName "rslvd-tunnel" `\n' +
          '  -Action $action -Trigger $trigger `\n' +
          '  -RunLevel Highest `\n' +
          '  -Description "rslvd.net tunnel"'
        )
      ),
      React.createElement(TutorialNote, null, 'Replace the path and token with your actual values. The task runs at system startup with elevated privileges.')
    ),

    React.createElement('div', { style: { marginTop: 40, padding: '20px 24px', background: 'var(--bg3)', borderRadius: 12, textAlign: 'center' } },
      React.createElement('p', { style: { color: 'var(--text2)', fontSize: 14, marginBottom: 12 } }, 'Your local service is now accessible from anywhere on the internet!'),
      React.createElement('div', { style: { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' } },
        React.createElement('button', { className: 'btn btn-primary', onClick: () => navigate('/tutorials/windows-subdomain') }, '← Subdomain setup'),
        React.createElement('button', { className: 'btn btn-secondary', onClick: () => navigate('/dashboard') }, 'Go to Dashboard')
      )
    )
  );
}

// ── Tutorials Index ─────────────────────────────────────────────────────────
function TutorialsPage({ navigate }) {
  const tutorials = [
    { path: '/tutorials/linux-subdomain', icon: '🐧', title: 'Linux — Subdomain Setup', desc: 'Set up a free dynamic DNS subdomain on Linux with automatic IP updates via cron.' },
    { path: '/tutorials/windows-subdomain', icon: '🪟', title: 'Windows — Subdomain Setup', desc: 'Set up a free dynamic DNS subdomain on Windows with automatic IP updates via Task Scheduler.' },
    { path: '/tutorials/linux-tunnel', icon: '🐧', title: 'Linux — Tunnel Setup', desc: 'Expose a local service to the internet on Linux — even behind CGNAT or double NAT.' },
    { path: '/tutorials/windows-tunnel', icon: '🪟', title: 'Windows — Tunnel Setup', desc: 'Expose a local service to the internet on Windows — even behind CGNAT or double NAT.' },
  ];

  return React.createElement('div', { style: { maxWidth: 800, margin: '0 auto', padding: '32px 24px' } },
    React.createElement('button', { className: 'btn btn-secondary btn-sm', style: { marginBottom: 24 }, onClick: () => navigate('/') }, '← Back'),
    React.createElement('h1', { style: { fontSize: 28, marginBottom: 8 } }, 'Tutorials'),
    React.createElement('p', { style: { color: 'var(--text2)', fontSize: 15, marginBottom: 32 } }, 'Step-by-step guides to get up and running with rslvd.net.'),
    tutorials.map(t =>
      React.createElement('div', {
        key: t.path,
        className: 'card',
        style: { marginBottom: 12, cursor: 'pointer', transition: 'border-color 0.15s' },
        onClick: () => navigate(t.path),
        onMouseEnter: e => e.currentTarget.style.borderColor = 'var(--accent)',
        onMouseLeave: e => e.currentTarget.style.borderColor = 'var(--border)'
      },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } },
          React.createElement('div', { style: { fontSize: 32 } }, t.icon),
          React.createElement('div', null,
            React.createElement('h3', { style: { fontSize: 16, marginBottom: 4 } }, t.title),
            React.createElement('p', { style: { color: 'var(--text2)', fontSize: 13 } }, t.desc)
          )
        )
      )
    )
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const { path, navigate } = useRoute();
  const auth = useAuth();
  const pwa = useInstallPrompt();
  window.navigate = navigate;

  if (auth.loading) return React.createElement('div', { className: 'flex-center', style: { minHeight: '100vh' } }, React.createElement(Spinner));

  if ((['/dashboard', '/admin', '/account'].includes(path)) && !auth.user) { navigate('/login'); return null; }
  if (path === '/admin' && auth.user && auth.user.role === 'user') { navigate('/dashboard'); return null; }
  if ((path === '/login' || path === '/register') && auth.user) { navigate('/dashboard'); return null; }

  return React.createElement('div', null,
    React.createElement(Nav, { user: auth.user, logout: auth.logout, navigate, pwa }),
    path === '/' && React.createElement(Landing, { navigate }),
    path === '/pricing' && React.createElement(Landing, { navigate }),
    path === '/login' && React.createElement(AuthPage, { mode: 'login', login: auth.login, navigate }),
    path === '/register' && React.createElement(AuthPage, { mode: 'register', register: auth.register, navigate }),
    path === '/forgot-password' && React.createElement(ForgotPasswordPage, { navigate }),
    path === '/reset-password' && React.createElement(ResetPasswordPage, { navigate }),
    path === '/dashboard' && auth.user && React.createElement(Dashboard, { user: auth.user, navigate, refreshUser: auth.refreshUser, pwa }),
    path === '/account' && auth.user && React.createElement(AccountPage, { user: auth.user, navigate, refreshUser: auth.refreshUser }),
    path === '/admin' && auth.user && (auth.user.role === 'admin' || auth.user.role === 'site_owner') &&
      React.createElement(AdminDashboard, { user: auth.user, navigate }),
    path === '/terms'   && React.createElement(TermsPage,   { navigate }),
    path === '/privacy' && React.createElement(PrivacyPage, { navigate }),
    path === '/tutorials' && React.createElement(TutorialsPage, { navigate }),
    path === '/tutorials/linux-subdomain' && React.createElement(TutorialLinuxSubdomain, { navigate }),
    path === '/tutorials/windows-subdomain' && React.createElement(TutorialWindowsSubdomain, { navigate }),
    path === '/tutorials/linux-tunnel' && React.createElement(TutorialLinuxTunnel, { navigate }),
    path === '/tutorials/windows-tunnel' && React.createElement(TutorialWindowsTunnel, { navigate }),
    !['/', '/login', '/register', '/dashboard', '/admin', '/pricing', '/account', '/terms', '/privacy', '/forgot-password', '/reset-password', '/tutorials', '/tutorials/linux-subdomain', '/tutorials/windows-subdomain', '/tutorials/linux-tunnel', '/tutorials/windows-tunnel'].includes(path) &&
      React.createElement('div', { className: 'flex-center', style: { minHeight: 400, flexDirection: 'column', gap: 16 } },
        React.createElement('h1', null, '404'),
        React.createElement('p', { style: { color: 'var(--text2)' } }, 'Page not found'),
        React.createElement('button', { className: 'btn btn-primary', onClick: () => navigate('/') }, 'Go home')
      )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
