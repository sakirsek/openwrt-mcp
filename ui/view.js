// openwrt-mcp status view for the GL.iNet web UI.
//
// The SPA's router fetches this file as text, eval()s it, and uses the resulting value as the
// route component (see /www/js/app.*.js, loadViewBeforeEnter). So this is not a webpack
// bundle and does not need to be one: an IIFE returning a Vue 2 options object satisfies the
// loader directly. Vue is 2.6.12 on this firmware, so render functions are used rather than
// templates -- there is no template compiler available at eval time.
//
// Data comes from the openwrt-mcp.status RPC method, called over /rpc with the session id
// from the Admin-Token cookie. That is deliberately a plain fetch rather than the app's
// internal window.$rpcRequest: the /rpc contract is defined in oui-rpc.lua and stable, while
// the internal helper is minified and free to change between firmware releases.
//
// Read-only. Pairing and granting stay CLI-only so that nothing reachable over the network
// can widen a grant.
(function () {
  // The shell publishes its palette as CSS custom properties on :root and swaps the whole
  // stylesheet when the user picks a theme (default / classic / dark on 4.x). Referencing
  // those variables rather than hardcoding hex keeps this view in step with whichever theme
  // is active, including ones added after this was written. Each var() carries the Element
  // UI light value the view used before as its fallback, so a firmware that does not define
  // them -- stock OpenWrt's LuCI, GL 3.x -- renders exactly as it did.
  var C = {
    primary: 'var(--primary, #409eff)',
    danger: 'var(--error, #f56c6c)',
    text: 'var(--text-regular, #303133)',
    muted: 'var(--text-weak, #909399)',
    border: 'var(--divider, #dcdfe6)',
    rule: 'var(--divider, #f5f7fa)',
    panel: 'var(--background-card, #ffffff)',
    bg: 'var(--background-title, #f5f7fa)'
  };

  // Tag colours. The old code tinted the background by appending '1a' to a hex literal,
  // which cannot work once the colour is a var() reference. Deriving the tint from the
  // foreground with color-mix() keeps that behaviour and stays correct in any theme.
  //
  // The shell's own *-background tokens are deliberately not used here: each is the ground
  // for its matching foreground, and --info-background pairs with --info, not --primary --
  // so --primary on it measures about 2.3:1 in the dark theme. A tint of the foreground
  // itself is both closer to the original design and more legible: on this firmware it
  // moves the dark theme to 3.1:1 for tool tags and 6.5:1 for a running daemon.
  //
  // `tint` is the flat fallback for browsers without color-mix(), and reproduces the exact
  // 10% wash the view had before.
  var T = {
    ok: { fg: 'var(--success, #67c23a)', tint: 'rgba(103, 194, 58, 0.1)' },
    danger: { fg: 'var(--error, #f56c6c)', tint: 'rgba(245, 108, 108, 0.1)' },
    warn: { fg: 'var(--warning, #e6a23c)', tint: 'rgba(230, 162, 60, 0.1)' },
    primary: { fg: 'var(--primary, #409eff)', tint: 'rgba(64, 158, 255, 0.1)' },
    muted: { fg: 'var(--text-weak, #909399)', tint: 'rgba(144, 147, 153, 0.1)' }
  };

  function sessionId() {
    var m = document.cookie.match(/(?:^|;\s*)Admin-Token=([^;]*)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function callStatus(auditLines) {
    return fetch('/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'call',
        params: [sessionId(), 'openwrt-mcp', 'status', { audit: auditLines }]
      })
    }).then(function (r) {
      return r.json();
    }).then(function (j) {
      if (j && j.error) {
        throw new Error(j.error.message + ' (' + j.error.code + ')');
      }
      if (!j || !j.result) throw new Error('empty response');
      // A daemon that is not installed still answers, so surface its own error text.
      if (j.result.err_msg) throw new Error(j.result.err_msg);
      return j.result;
    });
  }

  return {
    name: 'openwrt-mcp',

    data: function () {
      return { st: null, err: '', loading: true, auditLines: 20 };
    },

    created: function () {
      this.load();
    },

    methods: {
      load: function () {
        var self = this;
        self.loading = true;
        self.err = '';
        callStatus(self.auditLines).then(function (st) {
          self.st = st;
          self.loading = false;
        }).catch(function (e) {
          self.err = e.message || String(e);
          self.loading = false;
        });
      }
    },

    render: function (h) {
      var self = this;

      function panel(title, children, extra) {
        return h('div', {
          style: Object.assign({
            background: C.panel,
            border: '1px solid ' + C.border,
            borderRadius: '4px',
            padding: '16px 20px',
            marginBottom: '16px'
          }, extra || {})
        }, [
          h('div', {
            style: {
              fontSize: '15px', fontWeight: '600', color: C.text,
              marginBottom: '12px', paddingBottom: '10px',
              borderBottom: '1px solid ' + C.border
            }
          }, title)
        ].concat(children));
      }

      function tag(text, pair) {
        return h('span', {
          style: {
            display: 'inline-block', padding: '1px 8px', borderRadius: '3px',
            fontSize: '12px', lineHeight: '20px', color: pair.fg,
            border: '1px solid ' + pair.fg,
            // Declaration order is the fallback: the shorthand lands the flat tint, then
            // background-color overrides it where color-mix() parses. A browser that does
            // not know color-mix() drops the second declaration and keeps the first.
            background: pair.tint,
            backgroundColor: 'color-mix(in srgb, ' + pair.fg + ' 16%, transparent)',
            marginRight: '6px', whiteSpace: 'nowrap'
          }
        }, text);
      }

      function table(headers, rows, empty) {
        if (!rows.length) {
          return h('div', { style: { color: C.muted, fontSize: '13px', padding: '8px 0' } }, empty);
        }
        var th = headers.map(function (t) {
          return h('th', {
            style: {
              textAlign: 'left', padding: '8px 10px', color: C.muted,
              fontWeight: '500', fontSize: '12px', textTransform: 'uppercase',
              borderBottom: '1px solid ' + C.border, whiteSpace: 'nowrap'
            }
          }, t);
        });
        var tr = rows.map(function (cells) {
          return h('tr', cells.map(function (c) {
            return h('td', {
              style: {
                padding: '8px 10px', borderBottom: '1px solid ' + C.rule,
                fontSize: '13px', color: C.text, verticalAlign: 'top'
              }
            }, [c]);
          }));
        });
        return h('div', { style: { overflowX: 'auto' } }, [
          h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            [h('thead', [h('tr', th)]), h('tbody', tr)])
        ]);
      }

      function mono(s) {
        return h('span', { style: { fontFamily: 'monospace', fontSize: '12px' } }, s);
      }

      // ---- states that are not the happy path
      if (self.loading && !self.st) {
        return h('div', { style: { padding: '20px', color: C.muted } }, 'Loading…');
      }

      if (self.err) {
        return h('div', { style: { padding: '20px' } }, [
          panel('MCP Server', [
            h('div', { style: { color: C.danger, marginBottom: '10px' } }, self.err),
            h('div', { style: { color: C.muted, fontSize: '13px' } },
              'Check that the package is installed and the service is running: ' ),
            h('pre', {
              style: {
                background: C.bg, padding: '10px', borderRadius: '3px',
                fontSize: '12px', overflowX: 'auto'
              }
            }, '/etc/init.d/openwrt-mcp status\nopenwrt-mcp status'),
            h('button', {
              on: { click: self.load },
              style: {
                marginTop: '10px', padding: '7px 16px', cursor: 'pointer',
                border: '1px solid ' + C.primary, background: C.primary,
                color: '#fff', borderRadius: '4px', fontSize: '13px'
              }
            }, 'Retry')
          ])
        ]);
      }

      var st = self.st || {};

      // ---- header: what the daemon is doing right now
      var running = !!st.running;
      var header = panel('MCP Server', [
        h('div', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' } }, [
          tag(running ? 'Running' : 'Stopped', running ? T.ok : T.danger),
          h('span', { style: { color: C.muted, fontSize: '13px' } }, [
            'version ', mono(st.version || '?'), ' · listening on ', mono(st.listen || '?')
          ]),
          h('span', { style: { flex: '1' } }),
          h('button', {
            on: { click: self.load },
            style: {
              padding: '7px 16px', cursor: 'pointer', border: '1px solid ' + C.border,
              background: C.panel, color: C.text, borderRadius: '4px', fontSize: '13px'
            }
          }, self.loading ? 'Refreshing…' : 'Refresh')
        ]),
        h('div', { style: { marginTop: '10px', fontSize: '12px', color: C.muted } }, [
          'Reachable only over an SSH tunnel to ', mono(st.listen || '127.0.0.1:8730'),
          '. Pairing and grants are managed from the command line.'
        ])
      ]);

      // ---- paired clients
      var clients = (st.clients || []).map(function (c) {
        return [
          mono(c.name),
          c.policies > 0
            ? tag(c.policies + (c.policies === 1 ? ' policy' : ' policies'), T.primary)
            : tag('no grants', T.muted)
        ];
      });
      var clientPanel = panel('Paired clients', [
        table(['Client', 'Grants'], clients,
          'Nothing paired. Run: openwrt-mcp pair <name>')
      ]);

      // ---- standing policies
      var policies = (st.policies || []).map(function (p) {
        var state = p.expired ? tag('expired', T.danger)
          : (!p.enabled ? tag('disabled', T.muted) : tag('active', T.ok));
        return [
          mono(p.client),
          h('div', (p.tools || []).map(function (t) { return tag(t, T.primary); })),
          mono((p.scopes || []).join(' ')),
          h('span', { style: { whiteSpace: 'nowrap' } }, p.max_per_min + '/min'),
          h('div', [state, h('div', {
            style: { color: C.muted, fontSize: '12px', marginTop: '4px' }
          }, p.expires || 'never expires')])
        ];
      });
      var policyPanel = panel('Standing policies', [
        table(['Client', 'Tools', 'Scopes', 'Rate', 'State'], policies,
          'No grants. Every gated tool is denied until one is added with: openwrt-mcp allow …')
      ]);

      // ---- audit tail, newest at the bottom as the log has it
      var audit = (st.audit || []).map(function (a) {
        var pair = a.outcome === 'OK' ? T.ok : (a.outcome === 'DENIED' ? T.warn : T.danger);
        return [
          mono((a.time || '').replace('T', ' ').replace('Z', '')),
          tag(a.outcome, pair),
          mono(a.client || ''),
          mono(a.tool || ''),
          h('div', [
            mono(a.scope || ''),
            a.error ? h('div', {
              style: { color: C.danger, fontSize: '12px', marginTop: '3px' }
            }, a.error) : null
          ])
        ];
      });
      var auditPanel = panel('Recent activity', [
        table(['Time', 'Outcome', 'Client', 'Tool', 'Scope'], audit,
          'Nothing recorded yet.'),
        h('div', { style: { marginTop: '10px', fontSize: '12px', color: C.muted } },
          'Full log: /etc/openwrt-mcp/audit.jsonl')
      ]);

      return h('div', { style: { padding: '20px', minHeight: '100%' } },
        [header, clientPanel, policyPanel, auditPanel]);
    }
  };
})()
