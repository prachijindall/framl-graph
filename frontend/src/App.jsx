import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────
const API_BASE = "https://framl-graph-2l3l.onrender.com";

// ─────────────────────────────────────────────
// CSS VARIABLES + GLOBAL STYLES (injected once)
// ─────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700;800&display=swap');
    :root {
      --bg:#060a12; --surface:#0d1420; --surface2:#111927; --border:#1e2d42;
      --accent:#00e5ff; --accent2:#ff3d71; --accent3:#a259ff; --accent4:#00ff88;
      --text:#e2eaf5; --muted:#5a7a99;
      --font-display:'Syne',sans-serif; --font-mono:'Space Mono',monospace;
    }
    *{margin:0;padding:0;box-sizing:border-box;}
    body{background:var(--bg);color:var(--text);font-family:var(--font-display);overflow-x:hidden;}
    body::before{
      content:'';position:fixed;inset:0;
      background-image:linear-gradient(rgba(0,229,255,0.03) 1px,transparent 1px),
        linear-gradient(90deg,rgba(0,229,255,0.03) 1px,transparent 1px);
      background-size:40px 40px;pointer-events:none;z-index:0;
    }
    @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes modalIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}
    @keyframes alertIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
    input[type=range]{accent-color:var(--accent);}
    input[type=datetime-local]{color-scheme:dark;}
    ::-webkit-scrollbar{width:6px;} ::-webkit-scrollbar-track{background:var(--surface);}
    ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
  `}</style>
);

// ─────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────
const fmt = n => (n == null ? "—" : Number(n).toLocaleString());
const fmtDate = s => { try { return new Date(s).toLocaleDateString(); } catch { return s; } };

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function download(filename, content, mime = "application/octet-stream") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
}

// ─────────────────────────────────────────────
// SMALL REUSABLE PRIMITIVES
// ─────────────────────────────────────────────

// Section label with trailing line
const SectionLabel = ({ children }) => (
  <div style={{
    fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)",
    letterSpacing:3, textTransform:"uppercase", marginBottom:16,
    display:"flex", alignItems:"center", gap:10
  }}>
    {children}
    <span style={{ flex:1, height:1, background:"var(--border)" }} />
  </div>
);

// Spinner
const Spinner = () => (
  <div style={{
    width:20, height:20, border:"2px solid var(--border)",
    borderTopColor:"var(--accent)", borderRadius:"50%",
    animation:"spin 1s linear infinite", margin:"0 auto 12px"
  }} />
);

// Loading state for tables / panels
const LoadingState = ({ cols = 6 }) => (
  <tr>
    <td colSpan={cols}>
      <div style={{ textAlign:"center", padding:40, fontFamily:"var(--font-mono)", fontSize:12, color:"var(--muted)" }}>
        <Spinner />
        Loading...
      </div>
    </td>
  </tr>
);

// Empty state placeholder
const EmptyState = ({ msg = "No data found", cols = 6 }) => (
  <tr>
    <td colSpan={cols}>
      <div style={{ textAlign:"center", padding:32, fontFamily:"var(--font-mono)", fontSize:12, color:"var(--muted)" }}>
        {msg}
      </div>
    </td>
  </tr>
);

// Status pill badge
const StatusPill = ({ status }) => {
  const map = {
    flagged: { bg:"rgba(255,61,113,0.1)", color:"var(--accent2)", border:"rgba(255,61,113,0.2)" },
    review:  { bg:"rgba(162,89,255,0.1)", color:"var(--accent3)", border:"rgba(162,89,255,0.2)" },
    clear:   { bg:"rgba(0,255,136,0.1)",  color:"var(--accent4)", border:"rgba(0,255,136,0.2)" },
  };
  const s = map[status] || map.clear;
  return (
    <span style={{
      display:"inline-block", padding:"2px 8px", borderRadius:2,
      fontSize:10, letterSpacing:1, fontFamily:"var(--font-mono)",
      background:s.bg, color:s.color, border:`1px solid ${s.border}`
    }}>
      {(status || "clear").toUpperCase()}
    </span>
  );
};

// Risk bar visual
const RiskBar = ({ score }) => {
  const pct = Math.round((score || 0) * 100);
  const color = pct > 70 ? "var(--accent2)" : pct > 40 ? "var(--accent3)" : "var(--accent4)";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
      <div style={{ width:60, background:"var(--border)", borderRadius:2, height:4 }}>
        <div style={{ width:`${pct}%`, height:4, borderRadius:2, background:color }} />
      </div>
      <span style={{ fontSize:9, color, fontFamily:"var(--font-mono)" }}>{pct}%</span>
    </div>
  );
};

// Relationship type badge
const RelBadge = ({ type }) => {
  const colors = {
    SENT:           ["rgba(0,229,255,0.1)",   "var(--accent)",  "rgba(0,229,255,0.2)"],
    SHARED_EMAIL:   ["rgba(255,61,113,0.1)",  "var(--accent2)", "rgba(255,61,113,0.2)"],
    SHARED_PHONE:   ["rgba(255,61,113,0.1)",  "var(--accent2)", "rgba(255,61,113,0.2)"],
    SHARED_ADDRESS: ["rgba(255,61,113,0.1)",  "var(--accent2)", "rgba(255,61,113,0.2)"],
    SHARED_PAYMENT: ["rgba(255,61,113,0.1)",  "var(--accent2)", "rgba(255,61,113,0.2)"],
    SAME_IP:        ["rgba(162,89,255,0.1)",  "var(--accent3)", "rgba(162,89,255,0.2)"],
    SAME_DEVICE:    ["rgba(162,89,255,0.1)",  "var(--accent3)", "rgba(162,89,255,0.2)"],
    INITIATED:      ["rgba(0,255,136,0.1)",   "var(--accent4)", "rgba(0,255,136,0.2)"],
    RECEIVED:       ["rgba(0,255,136,0.1)",   "var(--accent4)", "rgba(0,255,136,0.2)"],
  };
  const [bg, clr, border] = colors[type] || ["rgba(90,122,153,0.1)", "var(--muted)", "rgba(90,122,153,0.2)"];
  return (
    <span style={{
      fontFamily:"var(--font-mono)", fontSize:9, padding:"2px 6px", borderRadius:2,
      textTransform:"uppercase", letterSpacing:1, background:bg, color:clr, border:`1px solid ${border}`
    }}>
      {type.replace(/_/g, " ")}
    </span>
  );
};

// Generic card wrapper
const Card = ({ children, style = {}, hover = true }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => hover && setHovered(true)}
      onMouseLeave={() => hover && setHovered(false)}
      style={{
        background:"var(--surface)", border:`1px solid ${hovered ? "var(--accent)" : "var(--border)"}`,
        borderRadius:8, padding:20, transition:"border-color .2s", ...style
      }}
    >
      {children}
    </div>
  );
};

// Mono-style text input
const MonoInput = ({ style = {}, ...props }) => (
  <input
    style={{
      background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:4,
      padding:"8px 12px", color:"var(--text)", fontFamily:"var(--font-mono)",
      fontSize:12, outline:"none", width:"100%", ...style
    }}
    {...props}
  />
);

// Toolbar filter button
const FilterBtn = ({ active, onClick, children, style = {} }) => (
  <button
    onClick={onClick}
    style={{
      padding:"8px 14px", borderRadius:4,
      border:`1px solid ${active ? "var(--accent2)" : "var(--border)"}`,
      background: active ? "rgba(255,61,113,0.08)" : "var(--surface)",
      color: active ? "var(--accent2)" : "var(--muted)",
      fontFamily:"var(--font-mono)", fontSize:11, cursor:"pointer",
      transition:"all .2s", whiteSpace:"nowrap", ...style
    }}
  >
    {children}
  </button>
);

// Pagination row used in tables
const PaginationRow = ({ skip, limit, label, onPrev, onNext, pageInfo }) => (
  <div style={{
    padding:"10px 14px", fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)",
    borderTop:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center"
  }}>
    <span>{label}</span>
    <div style={{ display:"flex", gap:8, alignItems:"center" }}>
      <button onClick={onPrev} style={pageBtnStyle}>← Prev</button>
      <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)" }}>{pageInfo}</span>
      <button onClick={onNext} style={pageBtnStyle}>Next →</button>
    </div>
  </div>
);

const pageBtnStyle = {
  fontFamily:"var(--font-mono)", fontSize:10, padding:"4px 10px",
  border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--muted)",
  borderRadius:2, cursor:"pointer"
};

// ─────────────────────────────────────────────
// NAV BAR
// ─────────────────────────────────────────────
const Nav = ({ activePage, setActivePage, apiStatus }) => {
  const tabs = ["dashboard", "users", "transactions", "relationships", "analytics"];
  const statusColor = apiStatus === "LIVE" ? "var(--accent4)" : "var(--accent2)";

  return (
    <nav style={{
      position:"sticky", top:0, zIndex:100,
      display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"14px 32px", background:"rgba(6,10,18,0.92)", backdropFilter:"blur(12px)",
      borderBottom:"1px solid var(--border)"
    }}>
      <div style={{ fontFamily:"var(--font-mono)", fontSize:13, color:"var(--accent)", letterSpacing:3 }}>
        FRAML<span style={{ color:"var(--muted)" }}>::</span>GRAPH
      </div>

      <div style={{ display:"flex", gap:4 }}>
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActivePage(tab)}
            style={{
              fontFamily:"var(--font-mono)", fontSize:11, letterSpacing:1,
              padding:"7px 16px", borderRadius:4,
              border: activePage === tab ? "1px solid rgba(0,229,255,0.3)" : "1px solid transparent",
              background: activePage === tab ? "rgba(0,229,255,0.07)" : "none",
              color: activePage === tab ? "var(--accent)" : "var(--muted)",
              cursor:"pointer", textTransform:"uppercase", transition:"all .2s"
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={{
        fontFamily:"var(--font-mono)", fontSize:11, padding:"4px 10px",
        background:"rgba(0,229,255,0.1)", border:"1px solid rgba(0,229,255,0.3)",
        borderRadius:2, color: statusColor
      }}>
        ● {apiStatus}
      </div>
    </nav>
  );
};

// ─────────────────────────────────────────────
// MINI BAR CHART (dashboard stat cards)
// ─────────────────────────────────────────────
const MiniBars = ({ values, color, labels, unit }) => {
  const max = Math.max(...values, 1);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:40, marginTop:12 }}>
      {values.map((v, i) => {
        const pct = Math.max(4, Math.round((v / max) * 100));
        return (
          <div
            key={i}
            title={`${labels[i]}: ${v} ${unit}`}
            style={{
              flex:1, height:`${pct}%`, background:color, borderRadius:"2px 2px 0 0",
              opacity: v > 0 ? 0.7 + 0.3 * (v / max) : 0.15, transition:"opacity .2s", cursor:"default"
            }}
          />
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────
// STAT CARD (dashboard)
// ─────────────────────────────────────────────
const StatCard = ({ title, badge, badgeStyle = {}, num, numColor, sub, barsData }) => (
  <Card>
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
      <span style={{ fontSize:11, textTransform:"uppercase", letterSpacing:2, color:"var(--muted)" }}>{title}</span>
      <span style={{
        fontFamily:"var(--font-mono)", fontSize:10, padding:"2px 8px", borderRadius:2, ...badgeStyle
      }}>
        {badge}
      </span>
    </div>
    <div style={{ fontSize:36, fontWeight:800, letterSpacing:-1, marginBottom:4, color: numColor }}>
      {num}
    </div>
    <div style={{ fontSize:12, color:"var(--muted)" }}>{sub}</div>
    {barsData && <MiniBars {...barsData} />}
  </Card>
);

// ─────────────────────────────────────────────
// VIS.JS GRAPH WRAPPER
// ─────────────────────────────────────────────
// Renders a vis.js Network inside a div ref. Rebuilt when `nodes` or `edges` change.
const VisGraph = ({ nodes, edges, height = 460, onNodeClick, containerId }) => {
  const ref = useRef(null);
  const netRef = useRef(null);

  useEffect(() => {
    if (!ref.current || !window.vis || !nodes.length) return;
    if (netRef.current) netRef.current.destroy();

    const net = new window.vis.Network(
      ref.current,
      { nodes: new window.vis.DataSet(nodes), edges: new window.vis.DataSet(edges) },
      {
        physics: {
          enabled: true, solver:"forceAtlas2Based",
          forceAtlas2Based:{ gravitationalConstant:-80, centralGravity:0.01, springLength:140, springConstant:0.06, damping:0.5, avoidOverlap:0.6 },
          stabilization:{ enabled:true, iterations:200, updateInterval:30 }
        },
        interaction:{ hover:true, zoomView:true, dragView:true, tooltipDelay:60, hideEdgesOnDrag:true },
        nodes:{ borderWidth:2 },
        edges:{ smooth:{ type:"continuous" }, selectionWidth:3 },
        layout:{ improvedLayout:false }
      }
    );
    if (onNodeClick) net.on("click", onNodeClick);
    netRef.current = net;
    return () => { if (netRef.current) { netRef.current.destroy(); netRef.current = null; } };
  }, [nodes, edges]);

  return <div ref={ref} style={{ width:"100%", height, background:"var(--bg)" }} />;
};

// ─────────────────────────────────────────────
// GRAPH TOOLBAR (mode buttons)
// ─────────────────────────────────────────────
const GraphToolbar = ({ title, buttons, statusText }) => (
  <>
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"10px 16px", borderBottom:"1px solid var(--border)", background:"var(--surface2)"
    }}>
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        {["#ff5f57","#febc2e","#28c840"].map(c => (
          <div key={c} style={{ width:10, height:10, borderRadius:"50%", background:c }} />
        ))}
        <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)", marginLeft:8 }}>{title}</span>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        {buttons.map(b => (
          <button
            key={b.label}
            onClick={b.onClick}
            style={{
              fontFamily:"var(--font-mono)", fontSize:10, padding:"4px 12px",
              borderRadius:2, border:`1px solid ${b.active ? "var(--accent)" : "var(--border)"}`,
              background: b.active ? "rgba(0,229,255,0.08)" : "transparent",
              color: b.active ? "var(--accent)" : "var(--muted)", cursor:"pointer"
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
    {statusText != null && (
      <div style={{
        padding:"8px 16px", fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)",
        background:"var(--surface2)", borderTop:"1px solid var(--border)", minHeight:30
      }}>
        {statusText}
      </div>
    )}
  </>
);

// ─────────────────────────────────────────────
// GRAPH LEGEND
// ─────────────────────────────────────────────
const GraphLegend = ({ items }) => (
  <div style={{
    display:"flex", flexWrap:"wrap", gap:"10px 24px", padding:"14px 16px",
    borderTop:"1px solid var(--border)"
  }}>
    {items.map(item => (
      <div key={item.label} style={{ display:"flex", alignItems:"center", gap:8, fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)" }}>
        {item.circle
          ? <div style={{ width:12, height:12, borderRadius:"50%", background:item.color, display:"inline-block" }} />
          : item.square
          ? <div style={{ width:12, height:12, borderRadius:3, background:item.color, display:"inline-block" }} />
          : <div style={{ width:24, height:2, borderRadius:1, background:item.color }} />
        }
        {item.label}
      </div>
    ))}
  </div>
);

// ─────────────────────────────────────────────
// GRAPH DATA BUILDER (shared logic for both dashboard + rel page)
// ─────────────────────────────────────────────
function buildGraphNodes(txs, users, emailMap, phoneMap, addressMap, paymentMap, ipMap, deviceMap, filters) {
  const nodesArr = [], edgesArr = [];
  const seenUsers = {}, seenTxs = {};
  const seenEdges = new Set();
  const userDegree = {};

  function bumpDegree(uid) { userDegree[uid] = (userDegree[uid] || 0) + 1; }

  function mkTip(html) {
    const d = document.createElement("div");
    d.style.cssText = "font-family:monospace;font-size:11px;background:#111927;color:#e2eaf5;padding:8px 12px;border-radius:4px;border:1px solid #1e2d42;line-height:1.8";
    d.innerHTML = html;
    return d;
  }

  function addEdge(from, to, color, label, dashes, width = 1.5) {
    const key = `${from}||${to}||${label}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    bumpDegree(from); bumpDegree(to);
    edgesArr.push({
      from, to, color:{ color, opacity:0.8, highlight:color },
      arrows:{ to:{ enabled:true, scaleFactor:0.45 } },
      dashes: dashes || false, title:mkTip(label), width, selectionWidth:3
    });
  }

  function ensureUser(uid) {
    if (seenUsers[uid]) return;
    seenUsers[uid] = true;
    const u = (users || []).find(u => u.id === uid) || {};
    nodesArr.push({
      id:uid, label:uid,
      title:mkTip(`<b>👤 ${uid}</b><br>${u.name||"—"}<br>${u.email||""}<br>${u.phone||""}`),
      shape:"dot", size:16,
      color:{ background:"#00e5ff", border:"#007fa8", highlight:{ background:"#5cf0ff", border:"#00b8d9" } },
      font:{ color:"#060a12", size:9, bold:true }, borderWidth:2
    });
  }

  // Transaction nodes + Credit/Debit edges
  txs.forEach(tx => {
    const { sender_id: sid, receiver_id: rid, id: txId } = tx;
    if (filters.users) { ensureUser(sid); ensureUser(rid); }
    if (filters.txs && !seenTxs[txId]) {
      seenTxs[txId] = true;
      const bg = tx.status === "flagged" ? "#a259ff" : tx.status === "review" ? "#ff9f43" : "#00ff88";
      const bd = tx.status === "flagged" ? "#7a3fbf" : tx.status === "review" ? "#cc7a00" : "#00cc6a";
      nodesArr.push({
        id:txId, label:txId,
        title:mkTip(`<b>⬡ ${txId}</b><br>₹${Number(tx.amount).toLocaleString("en-IN")}<br>Risk: ${Math.round((tx.risk_score||0)*100)}%<br>Status: <span style="color:${bg}">${tx.status||"clear"}</span>`),
        shape:"box",
        color:{ background:bg, border:bd, highlight:{ background:bg, border:bd } },
        font:{ color:"#060a12", size:8, bold:true }, borderWidth:1.5
      });
    }
    if (filters.credit && filters.users && filters.txs) addEdge(sid, txId, "#00e5ff", `CREDIT — ${sid} → ${txId}`, false, 2);
    if (filters.debit  && filters.users && filters.txs) addEdge(txId, rid, "#00ff88", `DEBIT — ${txId} → ${rid}`,  false, 2);
  });

  // Shared attribute edges
  if (filters.users) {
    [
      { map:emailMap,   on:filters.email,   color:"#ff3d71", label:"SHARED EMAIL",   dash:[5,3] },
      { map:phoneMap,   on:filters.phone,   color:"#ff6b9d", label:"SHARED PHONE",   dash:[5,3] },
      { map:addressMap, on:filters.address, color:"#ffa500", label:"SHARED ADDRESS", dash:[5,3] },
      { map:paymentMap, on:filters.payment, color:"#ff9f43", label:"SHARED PAYMENT", dash:[5,3] },
    ].forEach(({ map, on, color, label, dash }) => {
      if (!on) return;
      Object.entries(map || {}).forEach(([val, ids]) => {
        if (ids.length < 2) return;
        for (let i = 0; i < ids.length; i++)
          for (let j = i + 1; j < ids.length; j++) {
            ensureUser(ids[i]); ensureUser(ids[j]);
            addEdge(ids[i], ids[j], color, `${label} · ${val}`, dash, 1.5);
          }
      });
    });
  }

  // TX→TX same IP / device
  if (filters.txs) {
    [[ipMap, filters.ip, "#a259ff", "SAME IP", [4,4]], [deviceMap, filters.device, "#c77dff", "SAME DEVICE", [2,4]]].forEach(
      ([map, on, color, label, dash]) => {
        if (!on) return;
        Object.entries(map || {}).forEach(([val, ids]) => {
          if (ids.length < 2) return;
          const cap = Math.min(ids.length, 8);
          for (let i = 0; i < cap; i++) {
            if (!seenTxs[ids[i]]) {
              seenTxs[ids[i]] = true;
              const tx = (txs || []).find(t => t.id === ids[i]) || { id:ids[i], status:"clear", risk_score:0, amount:0 };
              const bg = tx.status === "flagged" ? "#a259ff" : tx.status === "review" ? "#ff9f43" : "#00ff88";
              const bd = tx.status === "flagged" ? "#7a3fbf" : tx.status === "review" ? "#cc7a00" : "#00cc6a";
              nodesArr.push({
                id:ids[i], label:ids[i], shape:"box",
                title:mkTip(`<b>⬡ ${ids[i]}</b><br>Risk: ${Math.round((tx.risk_score||0)*100)}%<br>Status: <span style="color:${bg}">${tx.status||"clear"}</span>`),
                color:{ background:bg, border:bd, highlight:{ background:bg, border:bd } },
                font:{ color:"#060a12", size:8, bold:true }, borderWidth:1.5
              });
            }
            for (let j = i + 1; j < cap; j++) {
              if (!seenTxs[ids[j]]) {
                seenTxs[ids[j]] = true;
                const tx = (txs || []).find(t => t.id === ids[j]) || { id:ids[j], status:"clear", risk_score:0, amount:0 };
                const bg = tx.status === "flagged" ? "#a259ff" : tx.status === "review" ? "#ff9f43" : "#00ff88";
                const bd = tx.status === "flagged" ? "#7a3fbf" : tx.status === "review" ? "#cc7a00" : "#00cc6a";
                nodesArr.push({
                  id:ids[j], label:ids[j], shape:"box",
                  title:mkTip(`<b>⬡ ${ids[j]}</b>`),
                  color:{ background:bg, border:bd, highlight:{ background:bg, border:bd } },
                  font:{ color:"#060a12", size:8, bold:true }, borderWidth:1.5
                });
              }
              addEdge(ids[i], ids[j], color, `${label} · ${val}`, dash, 1.5);
            }
          }
        });
      }
    );
  }

  // Scale user node sizes by degree
  nodesArr.forEach(n => {
    if (n.shape === "dot") n.size = Math.min(10 + (userDegree[n.id] || 0) * 1.5, 30);
  });

  return { nodesArr, edgesArr };
}

// ─────────────────────────────────────────────
// DASHBOARD PAGE
// ─────────────────────────────────────────────
const DashboardPage = ({ onInspectUser }) => {
  const [stats, setStats] = useState(null);
  const [barsData, setBarsData] = useState({ tx:[], flag:[], users:[], labels:[] });
  const [apiStatus, setApiStatus] = useState("CONNECTING");

  // Graph state
  const [graphMode, setGraphMode] = useState("all");
  const [graphNodes, setGraphNodes] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);
  const [graphStatus, setGraphStatus] = useState("Click any node to see details");
  const [cachedData, setCachedData] = useState(null);

  const defaultFilters = {
    users:true, txs:true, credit:true, debit:true,
    email:true, phone:true, address:true, payment:true, ip:true, device:true
  };
  const [filters, setFilters] = useState(defaultFilters);
  const [activeRelCard, setActiveRelCard] = useState("all");

  // Load stats and bar data
  useEffect(() => {
    (async () => {
      try {
        const [sRes, tRes] = await Promise.all([
          fetch(`${API_BASE}/analytics/stats`),
          fetch(`${API_BASE}/transactions?limit=500&sort_by=timestamp&order=asc`)
        ]);
        const d = await sRes.json();
        const txJ = await tRes.json();
        const txs = txJ.data || [];
        setStats(d);
        setApiStatus("LIVE");

        if (txs.length) {
          const BINS = 12;
          const dates = txs.map(t => new Date(t.timestamp).getTime()).filter(Boolean);
          const minT = Math.min(...dates), maxT = Math.max(...dates);
          const span = (maxT - minT) || 1;
          const txBins = Array(BINS).fill(0), flagBins = Array(BINS).fill(0), userBins = Array(BINS).fill(0);
          const seenU = new Set();
          [...txs].sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp)).forEach(t => {
            const ts = new Date(t.timestamp).getTime();
            if (!ts) return;
            const b = Math.min(BINS-1, Math.floor(((ts - minT) / span) * BINS));
            txBins[b]++;
            if (t.status === "flagged") flagBins[b]++;
            if (!seenU.has(t.sender_id))   { seenU.add(t.sender_id);   userBins[b]++; }
            if (!seenU.has(t.receiver_id)) { seenU.add(t.receiver_id); userBins[b]++; }
          });
          const labels = Array.from({ length:BINS }, (_, i) =>
            new Date(minT + (span / BINS) * i).toLocaleDateString("en-IN", { month:"short", day:"numeric" })
          );
          setBarsData({ tx:txBins, flag:flagBins, users:userBins, labels });
        }
      } catch {
        setApiStatus("OFFLINE");
      }
    })();
  }, []);

  // Fetch + build graph data
  useEffect(() => {
    (async () => {
      try {
        const limit = graphMode === "flagged" ? 80 : 120;
        const statusParam = graphMode === "flagged" ? "&status=flagged" : "";
        const [txRes, userRes] = await Promise.all([
          fetch(`${API_BASE}/transactions?limit=${limit}${statusParam}`),
          fetch(`${API_BASE}/users?limit=200`)
        ]);
        const txJson = await txRes.json();
        const userJson = await userRes.json();
        const txs = txJson.data || [];
        const users = userJson.data || [];

        const emailMap = {}, phoneMap = {}, addressMap = {}, paymentMap = {}, ipMap = {}, deviceMap = {};
        users.forEach(u => {
          if (u.email)          (emailMap[u.email]          = emailMap[u.email]          || []).push(u.id);
          if (u.phone)          (phoneMap[u.phone]          = phoneMap[u.phone]          || []).push(u.id);
          if (u.address)        (addressMap[u.address]      = addressMap[u.address]      || []).push(u.id);
          if (u.payment_method) (paymentMap[u.payment_method] = paymentMap[u.payment_method] || []).push(u.id);
        });
        txs.forEach(tx => {
          if (tx.ip_address) (ipMap[tx.ip_address]   = ipMap[tx.ip_address]   || []).push(tx.id);
          if (tx.device_id)  (deviceMap[tx.device_id] = deviceMap[tx.device_id] || []).push(tx.id);
        });

        const data = { txs, users, emailMap, phoneMap, addressMap, paymentMap, ipMap, deviceMap };
        setCachedData(data);
      } catch {}
    })();
  }, [graphMode]);

  // Re-render graph when cache or filters change
  useEffect(() => {
    if (!cachedData) return;
    const { nodesArr, edgesArr } = buildGraphNodes(
      cachedData.txs, cachedData.users,
      cachedData.emailMap, cachedData.phoneMap, cachedData.addressMap,
      cachedData.paymentMap, cachedData.ipMap, cachedData.deviceMap, filters
    );
    setGraphNodes(nodesArr);
    setGraphEdges(edgesArr);
  }, [cachedData, filters]);

  // Handle node click on graph — show info in status bar
  const handleNodeClick = useCallback(params => {
    if (!cachedData || !params.nodes.length) {
      setGraphStatus("Click any node to see details");
      return;
    }
    const nid = params.nodes[0];
    const u = cachedData.users.find(u => u.id === nid);
    if (u) {
      setGraphStatus(`👤 ${nid} · ${u.name} · ${u.email} · ${u.phone} · ${u.payment_method}`);
    } else {
      const tx = cachedData.txs.find(t => t.id === nid);
      if (tx) setGraphStatus(`⬡ ${nid} · ₹${Number(tx.amount).toLocaleString("en-IN")} · Risk ${Math.round((tx.risk_score||0)*100)}% · ${tx.status}`);
    }
  }, [cachedData]);

  // Filter dashboard graph by relationship type card click
  const filterByRelType = (type, cardId) => {
    setActiveRelCard(cardId);
    if (type === "all") {
      setFilters(defaultFilters);
    } else if (type === "sent") {
      setFilters({ ...Object.fromEntries(Object.keys(defaultFilters).map(k=>[k,false])), users:true, txs:true, credit:true, debit:true });
    } else if (type === "email")   { setFilters({ ...Object.fromEntries(Object.keys(defaultFilters).map(k=>[k,false])), users:true, email:true }); }
    else if (type === "phone")     { setFilters({ ...Object.fromEntries(Object.keys(defaultFilters).map(k=>[k,false])), users:true, phone:true }); }
    else if (type === "address")   { setFilters({ ...Object.fromEntries(Object.keys(defaultFilters).map(k=>[k,false])), users:true, address:true }); }
    else if (type === "payment")   { setFilters({ ...Object.fromEntries(Object.keys(defaultFilters).map(k=>[k,false])), users:true, payment:true }); }
    else if (type === "ip")        { setFilters({ ...Object.fromEntries(Object.keys(defaultFilters).map(k=>[k,false])), txs:true, ip:true }); }
    else if (type === "device")    { setFilters({ ...Object.fromEntries(Object.keys(defaultFilters).map(k=>[k,false])), txs:true, device:true }); }
  };

  const relTypeCards = [
    { id:"rtc-sent",    type:"sent",    icon:"→", color:"var(--accent)",  title:"SENT",           desc:"Direct money transfer between users" },
    { id:"rtc-email",   type:"email",   icon:"✉", color:"var(--accent2)", title:"SHARED EMAIL",   desc:"Users sharing same email address" },
    { id:"rtc-phone",   type:"phone",   icon:"📞",color:"var(--accent2)", title:"SHARED PHONE",   desc:"Users sharing same phone number" },
    { id:"rtc-address", type:"address", icon:"🏠",color:"var(--accent2)", title:"SHARED ADDRESS", desc:"Users sharing same physical address" },
    { id:"rtc-payment", type:"payment", icon:"💳",color:"var(--accent2)", title:"SHARED PAYMENT", desc:"Users sharing payment method" },
    { id:"rtc-ip",      type:"ip",      icon:"🌐",color:"var(--accent3)", title:"SAME IP",        desc:"Transactions from same IP address" },
    { id:"rtc-device",  type:"device",  icon:"📱",color:"var(--accent3)", title:"SAME DEVICE",    desc:"Transactions from same device ID" },
    { id:"rtc-all",     type:"all",     icon:"⬡", color:"var(--accent4)", title:"ALL TYPES",      desc:"Show all relationship types" },
  ];

  const legendItems = [
    { label:"User",       color:"#00e5ff", circle:true },
    { label:"TX Clear",   color:"#00ff88", square:true },
    { label:"TX Review",  color:"#ff9f43", square:true },
    { label:"TX Flagged", color:"#a259ff", square:true },
    { label:"Credit",     color:"#00e5ff" },
    { label:"Debit",      color:"#00ff88" },
    { label:"Shared Email",   color:"#ff3d71" },
    { label:"Shared Phone",   color:"#ff6b9d" },
    { label:"Shared Address", color:"#ffa500" },
    { label:"Shared Payment", color:"#ff9f43" },
    { label:"Same IP",        color:"#a259ff" },
    { label:"Same Device",    color:"#c77dff" },
  ];

  return (
    <div style={{ position:"relative", zIndex:1, padding:32, animation:"fadeUp .4s ease" }}>
      {/* Hero */}
      <div style={{ textAlign:"center", padding:"40px 0 48px" }}>
        <div style={{
          display:"inline-block", fontFamily:"var(--font-mono)", fontSize:11, letterSpacing:3,
          color:"var(--accent4)", padding:"6px 14px", border:"1px solid rgba(0,255,136,0.3)",
          borderRadius:2, marginBottom:24
        }}>
          ⬡ USER & TRANSACTION RELATIONSHIP SYSTEM
        </div>
        <h1 style={{ fontSize:"clamp(32px,5vw,64px)", fontWeight:800, letterSpacing:-2, lineHeight:1.05, marginBottom:16 }}>
          Detect Fraud.<br />
          <em style={{ fontStyle:"normal", background:"linear-gradient(135deg,var(--accent),var(--accent3))", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
            Visualize Connections.
          </em>
        </h1>
        <p style={{ color:"var(--muted)", fontSize:14, lineHeight:1.7, maxWidth:480, margin:"0 auto 32px" }}>
          Graph-powered intelligence that maps user relationships and transaction flows to surface hidden patterns in real time.
        </p>
        <div style={{ display:"flex", justifyContent:"center", gap:48, fontFamily:"var(--font-mono)" }}>
          {[
            { val: stats ? fmt(stats.users) : "—", lbl:"Users" },
            { val: stats ? fmt(stats.transactions) : "—", lbl:"Transactions" },
            { val: stats ? fmt(stats.flagged) : "—", lbl:"Flagged" },
          ].map(({ val, lbl }) => (
            <div key={lbl}>
              <span style={{ fontSize:28, color:"var(--accent)", fontWeight:700, display:"block" }}>{val}</span>
              <span style={{ fontSize:10, color:"var(--muted)", letterSpacing:2, textTransform:"uppercase" }}>{lbl}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <SectionLabel>01 — Analytics Overview</SectionLabel>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:32 }}>
        <StatCard
          title="Total Transactions"
          badge="Live"
          badgeStyle={{ background:"rgba(0,229,255,0.1)", color:"var(--accent)", border:"1px solid rgba(0,229,255,0.2)" }}
          num={stats ? fmt(stats.transactions) : "—"} numColor="var(--accent)"
          sub="across all users"
          barsData={barsData.tx.length ? { values:barsData.tx, color:"#00e5ff", labels:barsData.labels, unit:"txns" } : null}
        />
        <StatCard
          title="Flagged Relationships"
          badge={stats ? `⚠ ${fmt(stats.flagged)} active` : "Loading..."}
          badgeStyle={{ background:"rgba(255,61,113,0.1)", color:"var(--accent2)", border:"1px solid rgba(255,61,113,0.2)" }}
          num={stats ? fmt(stats.flagged) : "—"} numColor="var(--accent2)"
          sub="suspicious transactions detected"
          barsData={barsData.flag.length ? { values:barsData.flag, color:"#ff3d71", labels:barsData.labels, unit:"flagged" } : null}
        />
        <StatCard
          title="Total Users"
          badge="Neo4j Live"
          badgeStyle={{ background:"rgba(0,255,136,0.1)", color:"var(--accent4)", border:"1px solid rgba(0,255,136,0.2)" }}
          num={stats ? fmt(stats.users) : "—"} numColor="var(--accent4)"
          sub="registered in graph database"
          barsData={barsData.users.length ? { values:barsData.users, color:"#00ff88", labels:barsData.labels, unit:"new users" } : null}
        />
      </div>

      {/* Graph */}
      <SectionLabel>02 — Live Relationship Graph</SectionLabel>
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", marginBottom:32 }}>
        <GraphToolbar
          title="graph.canvas — Neo4j / Vis.js"
          buttons={[
            { label:"All",     active:graphMode === "all",     onClick:() => setGraphMode("all") },
            { label:"Flagged", active:graphMode === "flagged", onClick:() => setGraphMode("flagged") },
          ]}
          statusText={graphStatus}
        />
        {graphNodes.length > 0
          ? <VisGraph nodes={graphNodes} edges={graphEdges} height={500} onNodeClick={handleNodeClick} />
          : <div style={{ height:500, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10 }}>
              <Spinner /><span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)" }}>Loading graph...</span>
            </div>
        }
        <GraphLegend items={legendItems} />
      </div>

      {/* Relationship type filter cards */}
      <SectionLabel>Relationship Types — Click to Filter Dashboard Graph</SectionLabel>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16 }}>
        {relTypeCards.map(card => (
          <div
            key={card.id}
            onClick={() => filterByRelType(card.type, card.id)}
            style={{
              background:"var(--surface)", border:`1px solid ${activeRelCard === card.id ? "var(--accent)" : "var(--border)"}`,
              borderRadius:8, padding:16, cursor:"pointer", transition:"all .2s",
              boxShadow: activeRelCard === card.id ? "0 0 16px rgba(0,229,255,0.1)" : "none"
            }}
          >
            <div style={{ color:card.color, fontSize:18, marginBottom:8 }}>{card.icon}</div>
            <div style={{ fontWeight:700, marginBottom:4, fontSize:13 }}>{card.title}</div>
            <div style={{ fontSize:12, color:"var(--muted)" }}>{card.desc}</div>
            <div style={{
              fontFamily:"var(--font-mono)", fontSize:9,
              color: card.type === "all" ? "var(--accent4)" : "var(--muted)",
              marginTop:8, borderTop:"1px solid var(--border)", paddingTop:6
            }}>
              {card.type === "all" ? "Click to reset graph" : "Click to view in graph"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// USERS PAGE
// ─────────────────────────────────────────────
const UsersPage = ({ onInspectUser }) => {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API_BASE}/users?limit=${limit}&skip=${skip}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      const r = await fetch(url);
      const d = await r.json();
      setUsers(d.data || []);
    } catch { setUsers([]); }
    setLoading(false);
  }, [search, skip]);

  useEffect(() => { load(); }, [load]);

  const debouncedSearch = useCallback(debounce(v => { setSearch(v); setSkip(0); }, 400), []);

  const exportUsersJSON = async () => {
    const r = await fetch(`${API_BASE}/users?limit=500`);
    const d = await r.json();
    download("users_export.json", JSON.stringify(d, null, 2), "application/json");
  };
  const exportUsersCSV = async () => {
    const r = await fetch(`${API_BASE}/export/users/csv`);
    download("users_export.csv", await r.text(), "text/csv");
  };

  return (
    <div style={{ position:"relative", zIndex:1, padding:32, animation:"fadeUp .4s ease" }}>
      <SectionLabel>Users — Searchable & Filterable</SectionLabel>

      {/* Toolbar */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, flexWrap:"wrap" }}>
        <div style={{
          flex:1, minWidth:200, display:"flex", alignItems:"center", gap:8,
          background:"var(--surface)", border:"1px solid var(--border)", borderRadius:4, padding:"8px 14px"
        }}>
          <span style={{ color:"var(--muted)" }}>⌕</span>
          <input
            type="text"
            placeholder="Search by name, email, phone or User ID..."
            onChange={e => debouncedSearch(e.target.value)}
            style={{ background:"none", border:"none", outline:"none", color:"var(--text)", fontFamily:"var(--font-mono)", fontSize:12, width:"100%" }}
          />
        </div>
        {[
          { label:"Export JSON ↗", fn:exportUsersJSON, style:{} },
          { label:"Export CSV ↗",  fn:exportUsersCSV,  style:{ borderColor:"rgba(0,255,136,0.4)", color:"var(--accent4)" } },
          { label:"↺ Refresh",     fn:load,            style:{} },
        ].map(({ label, fn, style }) => (
          <FilterBtn key={label} onClick={fn} style={style}>{label}</FilterBtn>
        ))}
        <AddUserModal onSuccess={load} />
      </div>

      {/* Table */}
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"var(--surface2)", borderBottom:"1px solid var(--border)" }}>
              {["User ID","Name","Email","Phone","Address","Payment Method","Actions"].map(h => (
                <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontFamily:"var(--font-mono)", fontSize:10, textTransform:"uppercase", letterSpacing:2, color:"var(--muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingState cols={7} /> : !users.length ? <EmptyState msg="No users found" cols={7} /> :
              users.map(u => (
                <tr key={u.id} style={{ borderBottom:"1px solid rgba(30,45,66,0.5)" }}>
                  <td style={{ padding:"10px 14px", fontFamily:"var(--font-mono)", fontSize:12, color:"var(--accent)" }}>{u.id}</td>
                  <td style={{ padding:"10px 14px", fontFamily:"var(--font-mono)", fontSize:12, fontWeight:600 }}>{u.name}</td>
                  <td style={{ padding:"10px 14px", fontFamily:"var(--font-mono)", fontSize:12, color:"var(--muted)" }}>{u.email}</td>
                  <td style={{ padding:"10px 14px", fontFamily:"var(--font-mono)", fontSize:12, color:"var(--muted)" }}>{u.phone}</td>
                  <td style={{ padding:"10px 14px", fontFamily:"var(--font-mono)", fontSize:12, color:"var(--muted)", maxWidth:200, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{u.address}</td>
                  <td style={{ padding:"10px 14px", fontFamily:"var(--font-mono)", fontSize:12, color:"var(--accent3)" }}>{u.payment_method}</td>
                  <td style={{ padding:"10px 14px" }}>
                    <button
                      onClick={() => onInspectUser(u.id)}
                      style={{ fontFamily:"var(--font-mono)", fontSize:10, padding:"3px 8px", border:"1px solid var(--border)", background:"none", color:"var(--accent)", borderRadius:2, cursor:"pointer" }}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
        <PaginationRow
          label={`Showing ${skip + 1}–${skip + users.length} users`}
          pageInfo={`Page ${Math.floor(skip / limit) + 1}`}
          onPrev={() => setSkip(s => Math.max(0, s - limit))}
          onNext={() => setSkip(s => s + limit)}
        />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// TRANSACTIONS PAGE
// ─────────────────────────────────────────────
const TransactionsPage = ({ onInspectTx }) => {
  const [txs, setTxs] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(null);
  const [sortBy, setSortBy] = useState("amount");
  const [order, setOrder] = useState("desc");
  const [skip, setSkip] = useState(0);
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");
  const [loading, setLoading] = useState(true);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API_BASE}/transactions?limit=${limit}&skip=${skip}&sort_by=${sortBy}&order=${order}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (status) url += `&status=${status}`;
      if (minAmt) url += `&min_amount=${minAmt}`;
      if (maxAmt) url += `&max_amount=${maxAmt}`;
      const r = await fetch(url);
      const d = await r.json();
      setTxs(d.data || []);
    } catch { setTxs([]); }
    setLoading(false);
  }, [search, status, sortBy, order, skip, minAmt, maxAmt]);

  useEffect(() => { load(); }, [load]);

  const toggleSort = field => {
    if (sortBy === field) setOrder(o => o === "desc" ? "asc" : "desc");
    else { setSortBy(field); setOrder("desc"); }
    setSkip(0);
  };

  const exportJSON = async () => {
    const r = await fetch(`${API_BASE}/export/transactions`);
    download("transactions_export.json", JSON.stringify(await r.json(), null, 2), "application/json");
  };
  const exportCSV = async () => {
    const r = await fetch(`${API_BASE}/export/transactions/csv`);
    download("transactions_export.csv", await r.text(), "text/csv");
  };

  return (
    <div style={{ position:"relative", zIndex:1, padding:32, animation:"fadeUp .4s ease" }}>
      <SectionLabel>Transactions — 100K Explorer</SectionLabel>

      {/* Search + filters toolbar */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, flexWrap:"wrap" }}>
        <div style={{
          flex:1, minWidth:200, display:"flex", alignItems:"center", gap:8,
          background:"var(--surface)", border:"1px solid var(--border)", borderRadius:4, padding:"8px 14px"
        }}>
          <span style={{ color:"var(--muted)" }}>⌕</span>
          <input
            type="text"
            placeholder="Search by TX ID, Sender ID or Receiver ID..."
            onChange={e => debounce(v => { setSearch(v); setSkip(0); }, 400)(e.target.value)}
            style={{ background:"none", border:"none", outline:"none", color:"var(--text)", fontFamily:"var(--font-mono)", fontSize:12, width:"100%" }}
          />
        </div>
        {["flagged","review","clear"].map(s => (
          <FilterBtn key={s} active={status === s} onClick={() => { setStatus(st => st === s ? null : s); setSkip(0); }}>
            {s === "flagged" ? "⚠ Flagged" : s === "review" ? "◎ Review" : "✓ Clear"}
          </FilterBtn>
        ))}
        {[["amount","↕ Amount"],["timestamp","📅 Date"],["risk_score","⚡ Risk"]].map(([field, label]) => (
          <FilterBtn
            key={field}
            active={sortBy === field}
            onClick={() => toggleSort(field)}
            style={{ borderColor: sortBy === field ? "var(--accent)" : "var(--border)", color: sortBy === field ? "var(--accent)" : "var(--muted)", background: sortBy === field ? "rgba(0,229,255,0.08)" : "var(--surface)" }}
          >
            {label}
          </FilterBtn>
        ))}
        <FilterBtn onClick={exportJSON}>Export JSON ↗</FilterBtn>
        <FilterBtn onClick={exportCSV} style={{ borderColor:"rgba(0,255,136,0.4)", color:"var(--accent4)" }}>Export CSV ↗</FilterBtn>
        <AddTransactionModal onSuccess={load} />
      </div>

      {/* Amount range filter */}
      <div style={{ display:"flex", gap:10, marginBottom:12, alignItems:"center" }}>
        <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)" }}>Amount (₹):</span>
        <input type="number" placeholder="Min ₹" value={minAmt} onChange={e => { setMinAmt(e.target.value); setSkip(0); }} style={{ width:100, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:4, padding:"6px 10px", color:"var(--text)", fontFamily:"var(--font-mono)", fontSize:11, outline:"none" }} />
        <span style={{ color:"var(--muted)", fontSize:12 }}>—</span>
        <input type="number" placeholder="Max ₹" value={maxAmt} onChange={e => { setMaxAmt(e.target.value); setSkip(0); }} style={{ width:100, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:4, padding:"6px 10px", color:"var(--text)", fontFamily:"var(--font-mono)", fontSize:11, outline:"none" }} />
      </div>

      {/* Table */}
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"var(--surface2)", borderBottom:"1px solid var(--border)" }}>
              {["TX ID","Sender","Receiver","Amount ↕","Date ↕","IP Address","Risk ↕","Status","Links"].map(h => (
                <th key={h} onClick={() => { if (h.includes("↕")) { const f = h.includes("Amount")?"amount":h.includes("Date")?"timestamp":"risk_score"; toggleSort(f); }}} style={{ padding:"10px 14px", textAlign:"left", fontFamily:"var(--font-mono)", fontSize:10, textTransform:"uppercase", letterSpacing:2, color:"var(--muted)", cursor:h.includes("↕")?"pointer":"default" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingState cols={9} /> : !txs.length ? <EmptyState msg="No transactions found" cols={9} /> :
              txs.map(tx => (
                <tr key={tx.id} style={{ borderBottom:"1px solid rgba(30,45,66,0.5)" }}>
                  <td style={{ padding:"10px 14px", fontFamily:"var(--font-mono)", fontSize:12, color:"var(--accent)" }}>{tx.id}</td>
                  <td style={{ padding:"10px 14px", fontFamily:"var(--font-mono)", fontSize:12 }}>{tx.sender_id}</td>
                  <td style={{ padding:"10px 14px", fontFamily:"var(--font-mono)", fontSize:12 }}>{tx.receiver_id}</td>
                  <td style={{ padding:"10px 14px", fontFamily:"var(--font-mono)", fontSize:12, color:"var(--accent2)" }}>₹{Number(tx.amount||0).toLocaleString("en-IN",{ minimumFractionDigits:2, maximumFractionDigits:2 })}</td>
                  <td style={{ padding:"10px 14px", fontFamily:"var(--font-mono)", fontSize:12, color:"var(--muted)" }}>{fmtDate(tx.timestamp)}</td>
                  <td style={{ padding:"10px 14px", fontFamily:"var(--font-mono)", fontSize:12, color:"var(--muted)" }}>{tx.ip_address}</td>
                  <td style={{ padding:"10px 14px" }}><RiskBar score={tx.risk_score} /></td>
                  <td style={{ padding:"10px 14px" }}><StatusPill status={tx.status} /></td>
                  <td style={{ padding:"10px 14px" }}>
                    <button onClick={() => onInspectTx(tx.id)} style={{ fontFamily:"var(--font-mono)", fontSize:10, padding:"3px 8px", border:"1px solid var(--border)", background:"none", color:"var(--accent4)", borderRadius:2, cursor:"pointer" }}>Links</button>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
        <PaginationRow
          label={`Showing ${skip + 1}–${skip + txs.length} results`}
          pageInfo={`Page ${Math.floor(skip / limit) + 1}`}
          onPrev={() => setSkip(s => Math.max(0, s - limit))}
          onNext={() => setSkip(s => s + limit)}
        />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// USER RELATIONSHIPS PANEL
// ─────────────────────────────────────────────
const UserRelPanel = ({ initialId = "" }) => {
  const [userId, setUserId] = useState(initialId);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const PER_PAGE = 10;

  const load = async () => {
    const id = userId.trim();
    if (!id) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/relationships/user/${id}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      const c = d.connections || {};
      const flat = [];
      const add = (arr, type, icon, nodeClass) => (arr || []).forEach(n => flat.push({ n, type, icon, nodeClass }));
      add(c.sent_to,        "SENT",          "→",  "rn-user");
      add(c.shared_email,   "SHARED_EMAIL",  "✉",  "rn-flag");
      add(c.shared_phone,   "SHARED_PHONE",  "📞", "rn-flag");
      add(c.shared_address, "SHARED_ADDRESS","🏠",  "rn-flag");
      add(c.shared_payment, "SHARED_PAYMENT","💳",  "rn-flag");
      add(c.transactions,   "INITIATED",     "⬡",  "rn-tx");
      setItems(flat);
      setPage(0);
    } catch { setItems([]); }
    setLoading(false);
  };

  useEffect(() => { if (initialId) { setUserId(initialId); } }, [initialId]);

  const totalPages = Math.ceil(items.length / PER_PAGE);
  const pageItems  = items.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  return (
    <Card style={{ padding:20 }}>
      <div style={{ fontWeight:700, fontSize:13, marginBottom:16 }}>👤 User Connections</div>
      <div style={{ display:"flex", gap:10, marginBottom:12 }}>
        <MonoInput
          placeholder="Enter User ID e.g. U-00001"
          value={userId}
          onChange={e => setUserId(e.target.value)}
          onKeyDown={e => e.key === "Enter" && load()}
        />
        <button onClick={load} style={{ padding:"8px 16px", background:"rgba(0,229,255,0.1)", border:"1px solid rgba(0,229,255,0.3)", borderRadius:4, color:"var(--accent)", fontFamily:"var(--font-mono)", fontSize:11, cursor:"pointer" }}>
          Inspect →
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:32 }}><Spinner /></div>
      ) : !items.length ? (
        <div style={{ textAlign:"center", padding:32, color:"var(--muted)", fontFamily:"var(--font-mono)", fontSize:12 }}>
          Enter a User ID to see all connections
        </div>
      ) : (
        <>
          {pageItems.map(({ n, type, icon, nodeClass }, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:"1px solid var(--border)" }}>
              <div style={{ width:34, height:34, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontSize:9, fontWeight:700, flexShrink:0, background: nodeClass === "rn-flag" ? "rgba(255,61,113,0.15)" : nodeClass === "rn-tx" ? "rgba(0,255,136,0.1)" : "rgba(0,229,255,0.15)", color: nodeClass === "rn-flag" ? "var(--accent2)" : nodeClass === "rn-tx" ? "var(--accent4)" : "var(--accent)", border: `1px solid ${nodeClass === "rn-flag" ? "rgba(255,61,113,0.3)" : nodeClass === "rn-tx" ? "rgba(0,255,136,0.2)" : "rgba(0,229,255,0.3)"}` }}>
                {icon}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{n.name || n.id || "—"}</div>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", marginTop:2 }}>
                  <span>{n.id || "—"}</span>
                  {n.email && <span style={{ marginLeft:6 }}>{n.email}</span>}
                </div>
              </div>
              <RelBadge type={type} />
            </div>
          ))}

          {totalPages > 1 && (
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:12, paddingTop:10, borderTop:"1px solid var(--border)" }}>
              <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)" }}>
                {page * PER_PAGE + 1}–{Math.min((page+1)*PER_PAGE, items.length)} of {items.length} · Page {page+1}/{totalPages}
              </span>
              <div style={{ display:"flex", gap:8 }}>
                <button disabled={page === 0} onClick={() => setPage(p => p-1)} style={pageBtnStyle}>← Prev</button>
                <button disabled={(page+1)*PER_PAGE >= items.length} onClick={() => setPage(p => p+1)} style={pageBtnStyle}>Next →</button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
};

// ─────────────────────────────────────────────
// TX RELATIONSHIP PANEL
// ─────────────────────────────────────────────
const TxRelPanel = ({ initialId = "" }) => {
  const [txId, setTxId] = useState(initialId);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [graphNodes, setGraphNodes] = useState([]);
  const [graphEdges, setGraphEdges] = useState([]);
  const [statusText, setStatusText] = useState("Click any node to see details");
  const [detailItems, setDetailItems] = useState([]);
  const [detailPage, setDetailPage] = useState(0);
  const [cacheData, setCacheData] = useState(null);
  const [ready, setReady] = useState(false);
  const DETAIL_PER = 6;

  useEffect(() => { if (initialId) setTxId(initialId); }, [initialId]);

  const load = async () => {
    const id = txId.trim();
    if (!id) return;
    setLoading(true); setReady(false);
    try {
      const [relRes, txRes, userRes] = await Promise.all([
        fetch(`${API_BASE}/relationships/transaction/${id}`),
        fetch(`${API_BASE}/transactions?search=${encodeURIComponent(id)}&limit=10`),
        fetch(`${API_BASE}/users?limit=500`)
      ]);
      const relD = await relRes.json();
      const txJ  = await txRes.json();
      const userJ = await userRes.json();

      const c = relD.connections || {};
      const txData = (txJ.data || []).find(t => t.id === id) || {};
      const allUsers = userJ.data || [];

      const senderIds   = (c.users || []).filter(u => u.link_type === "INITIATED").map(u => u.data?.id || u.data);
      const receiverIds = (c.users || []).filter(u => u.link_type === "RECEIVED").map(u => u.data?.id || u.data);
      const involvedIds = new Set([...senderIds, ...receiverIds]);

      const emailMap = {}, phoneMap = {}, addressMap = {}, paymentMap = {};
      allUsers.forEach(u => {
        if (u.email)          (emailMap[u.email]          = emailMap[u.email]          || []).push(u.id);
        if (u.phone)          (phoneMap[u.phone]          = phoneMap[u.phone]          || []).push(u.id);
        if (u.address)        (addressMap[u.address]      = addressMap[u.address]      || []).push(u.id);
        if (u.payment_method) (paymentMap[u.payment_method] = paymentMap[u.payment_method] || []).push(u.id);
      });

      const sharedLinks = [];
      const findShared = (map, type) => Object.entries(map).forEach(([val, ids]) => {
        if (!ids.some(uid => involvedIds.has(uid)) || ids.length < 2) return;
        for (let i = 0; i < ids.length; i++)
          for (let j = i+1; j < ids.length; j++)
            sharedLinks.push({ u1:ids[i], u2:ids[j], type, val });
      });
      findShared(emailMap, "SHARED_EMAIL"); findShared(phoneMap, "SHARED_PHONE");
      findShared(addressMap, "SHARED_ADDRESS"); findShared(paymentMap, "SHARED_PAYMENT");

      const linkedTxColors = { SAME_IP:"#a259ff", SAME_DEVICE:"#c77dff" };
      const linkedTxIcons  = { SAME_IP:"🌐",      SAME_DEVICE:"📱" };
      const allDetailItems = [
        ...senderIds.map(uid => ({ uid, name:(allUsers.find(u=>u.id===uid)||{}).name||uid, email:(allUsers.find(u=>u.id===uid)||{}).email||"", type:"Credit (Sent)", color:"#ff3d71", icon:"💳" })),
        ...receiverIds.map(uid => ({ uid, name:(allUsers.find(u=>u.id===uid)||{}).name||uid, email:(allUsers.find(u=>u.id===uid)||{}).email||"", type:"Debit (Received)", color:"#00e5ff", icon:"📥" })),
        ...sharedLinks.flatMap(({ u1, u2, type }) => [u1, u2].map(uid => ({ uid, name:(allUsers.find(u=>u.id===uid)||{}).name||uid, email:"", type:type.replace(/_/g," "), color:{ SHARED_EMAIL:"#ff3d71", SHARED_PHONE:"#ff6b9d", SHARED_ADDRESS:"#ffa500", SHARED_PAYMENT:"#ff9f43" }[type]||"#aaa", icon:{ SHARED_EMAIL:"✉", SHARED_PHONE:"📞", SHARED_ADDRESS:"🏠", SHARED_PAYMENT:"💳" }[type]||"●" }))),
        ...(c.linked_transactions || []).map(({ data, link_type }) => ({ uid:data?.id||data, name:data?.id||data, email:"", type:link_type.replace(/_/g," "), color:linkedTxColors[link_type]||"#aaa", icon:linkedTxIcons[link_type]||"⬡" })),
      ];

      setCacheData({ id, txData, allUsers, senderIds, receiverIds, sharedLinks });
      setDetailItems(allDetailItems);
      setDetailPage(0);
      setReady(true);
    } catch {}
    setLoading(false);
  };

  // Build TX graph from cached data + current filter
  useEffect(() => {
    if (!cacheData) return;
    const { id, txData, allUsers, senderIds, receiverIds, sharedLinks } = cacheData;
    const nodesArr = [], edgesArr = [];
    const seenNodes = new Set(), seenEdges = new Set();
    const sharedColors = { SHARED_EMAIL:"#ff3d71", SHARED_PHONE:"#ff6b9d", SHARED_ADDRESS:"#ffa500", SHARED_PAYMENT:"#ff9f43" };

    const mkTip = html => { const d = document.createElement("div"); d.style.cssText = "font-family:monospace;font-size:11px;background:#111927;color:#e2eaf5;padding:8px 12px;border-radius:4px;border:1px solid #1e2d42;line-height:1.8"; d.innerHTML = html; return d; };

    const addEdge = (from, to, color, label, dashes, width=2) => {
      const k = `${from}|${to}|${label}`;
      if (seenEdges.has(k)) return; seenEdges.add(k);
      edgesArr.push({ from, to, title:mkTip(label), color:{ color, opacity:0.88, highlight:color }, arrows:{ to:{ enabled:true, scaleFactor:0.45 } }, dashes:dashes||false, width, selectionWidth:3 });
    };
    const ensureUser = uid => {
      if (seenNodes.has(uid)) return; seenNodes.add(uid);
      const u = allUsers.find(u => u.id === uid) || {};
      nodesArr.push({ id:uid, label:uid, title:mkTip(`<b>👤 ${uid}</b><br>${u.name||"—"}<br>${u.email||""}`), shape:"dot", size:16, color:{ background:"#00ff88", border:"#00aa55" }, font:{ color:"#060a12", size:9, bold:true }, borderWidth:2 });
    };

    // Focus TX node
    if (!seenNodes.has(id)) {
      seenNodes.add(id);
      const bg = txData.status === "flagged" ? "#a259ff" : txData.status === "review" ? "#ff9f43" : "#00e5ff";
      nodesArr.push({ id, label:id, title:mkTip(`<b>⬡ ${id}</b><br>₹${Number(txData.amount||0).toLocaleString("en-IN")}<br>Status: <span style="color:${bg}">${txData.status||"clear"}</span>`), shape:"box", color:{ background:bg, border:"#007fa8" }, font:{ color:"#060a12", size:10, bold:true }, borderWidth:3, size:22 });
    }

    const showAll = filter === "all";
    if (showAll || filter === "credit")  senderIds.forEach(uid   => { ensureUser(uid); addEdge(uid, id, "#ff3d71", `CREDIT — ${uid} → ${id}`); });
    if (showAll || filter === "debit")   receiverIds.forEach(uid  => { ensureUser(uid); addEdge(id, uid, "#00e5ff", `DEBIT — ${id} → ${uid}`); });
    sharedLinks.forEach(({ u1, u2, type, val }) => {
      const c = sharedColors[type];
      const show = showAll || (filter === "email" && type === "SHARED_EMAIL") || (filter === "phone" && type === "SHARED_PHONE") || (filter === "address" && type === "SHARED_ADDRESS") || (filter === "payment" && type === "SHARED_PAYMENT");
      if (!show) return;
      ensureUser(u1); ensureUser(u2);
      addEdge(u1, u2, c, `${type.replace(/_/g," ")} · ${val||""}`, [5,3], 1.5);
    });

    setGraphNodes(nodesArr); setGraphEdges(edgesArr);
  }, [cacheData, filter]);

  const handleNodeClick = useCallback(params => {
    if (!cacheData || !params.nodes.length) { setStatusText("Click any node to see details"); return; }
    const nid = params.nodes[0];
    if (nid === cacheData.id) {
      setStatusText(`⬡ ${nid} · ₹${Number(cacheData.txData.amount||0).toLocaleString("en-IN")} · ${cacheData.txData.status||"clear"}`);
    } else {
      const u = cacheData.allUsers.find(u => u.id === nid) || {};
      setStatusText(`👤 ${nid} · ${u.name||"—"} · ${u.email||""} · ${u.phone||""}`);
    }
  }, [cacheData]);

  const FILTER_BTNS = [
    { id:"all", label:"All" }, { id:"credit", label:"Credit" }, { id:"debit", label:"Debit" },
    { id:"email", label:"Email" }, { id:"phone", label:"Phone" }, { id:"address", label:"Address" }, { id:"payment", label:"Payment" }
  ];

  const totalDetailPages = Math.ceil(detailItems.length / DETAIL_PER);
  const pageDetailItems  = detailItems.slice(detailPage * DETAIL_PER, (detailPage+1) * DETAIL_PER);

  return (
    <Card style={{ padding:0, overflow:"hidden" }}>
      <div style={{ padding:"20px 20px 12px" }}>
        <div style={{ fontWeight:700, fontSize:13, marginBottom:16 }}>⬡ Transaction Connections</div>
        <div style={{ display:"flex", gap:10, marginBottom:12 }}>
          <MonoInput placeholder="Enter TX ID e.g. TX-000001" value={txId} onChange={e => setTxId(e.target.value)} onKeyDown={e => e.key === "Enter" && load()} />
          <button onClick={load} style={{ padding:"8px 16px", background:"rgba(0,229,255,0.1)", border:"1px solid rgba(0,229,255,0.3)", borderRadius:4, color:"var(--accent)", fontFamily:"var(--font-mono)", fontSize:11, cursor:"pointer" }}>
            Inspect →
          </button>
        </div>
      </div>

      {ready && (
        <div style={{ borderTop:"1px solid var(--border)" }}>
          <GraphToolbar
            title={`tx.graph — ${txId}`}
            buttons={FILTER_BTNS.map(b => ({ label:b.label, active:filter === b.id, onClick:() => setFilter(b.id) }))}
            statusText={statusText}
          />
          {graphNodes.length > 1
            ? <VisGraph nodes={graphNodes} edges={graphEdges} height={380} onNodeClick={handleNodeClick} />
            : <div style={{ height:380, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono)", fontSize:11, color:"var(--muted)" }}>No connections match this filter</div>
          }
        </div>
      )}

      {/* Detail list */}
      <div style={{ padding:"0 20px 16px" }}>
        {loading ? (
          <div style={{ textAlign:"center", padding:32 }}><Spinner /></div>
        ) : !ready ? (
          <div style={{ textAlign:"center", padding:32, color:"var(--muted)", fontFamily:"var(--font-mono)", fontSize:12 }}>
            Enter a Transaction ID to see its connection graph
          </div>
        ) : (
          <>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", margin:"12px 0 8px" }}>
              <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", textTransform:"uppercase", letterSpacing:1 }}>Connections ({detailItems.length} total)</span>
              {totalDetailPages > 1 && (
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--muted)" }}>
                    {detailPage*DETAIL_PER+1}–{Math.min((detailPage+1)*DETAIL_PER,detailItems.length)} / {detailItems.length}
                  </span>
                  <button disabled={detailPage===0} onClick={() => setDetailPage(p=>p-1)} style={pageBtnStyle}>← Prev</button>
                  <button disabled={(detailPage+1)*DETAIL_PER >= detailItems.length} onClick={() => setDetailPage(p=>p+1)} style={pageBtnStyle}>Next →</button>
                </div>
              )}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {pageDetailItems.map((item, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:8, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:5 }}>
                  <div style={{ width:30, height:30, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, flexShrink:0, background:"rgba(0,229,255,0.15)", color:"var(--accent)", border:"1px solid rgba(0,229,255,0.3)" }}>
                    {item.icon}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{item.name}</div>
                    <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--muted)", marginTop:1 }}>{item.uid}</div>
                    {item.email && <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--muted)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{item.email}</div>}
                  </div>
                  <span style={{ fontFamily:"var(--font-mono)", fontSize:8, padding:"2px 5px", borderRadius:2, background:"rgba(0,0,0,0.3)", color:item.color, border:`1px solid ${item.color}40`, whiteSpace:"nowrap", flexShrink:0 }}>
                    {item.type}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
};

// ─────────────────────────────────────────────
// RELATIONSHIPS PAGE
// ─────────────────────────────────────────────
const RelationshipsPage = ({ initialUserId, initialTxId }) => (
  <div style={{ position:"relative", zIndex:1, padding:32, animation:"fadeUp .4s ease" }}>
    <SectionLabel>Relationships — Connection Inspector</SectionLabel>
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:32 }}>
      <UserRelPanel initialId={initialUserId} />
      <TxRelPanel   initialId={initialTxId}  />
    </div>
  </div>
);

// ─────────────────────────────────────────────
// ANALYTICS PAGE
// ─────────────────────────────────────────────
const AnalyticsPage = () => {
  const [user1, setUser1] = useState("");
  const [user2, setUser2] = useState("");
  const [pathResult, setPathResult] = useState(null);
  const [pathLoading, setPathLoading] = useState(false);
  const [riskStats, setRiskStats] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/analytics/stats`)
      .then(r => r.json())
      .then(d => setRiskStats(d))
      .catch(() => {});
  }, []);

  const findPath = async () => {
    if (!user1 || !user2) return;
    setPathLoading(true); setPathResult(null);
    try {
      const r = await fetch(`${API_BASE}/analytics/shortest-path?user1_id=${user1}&user2_id=${user2}`);
      if (!r.ok) throw new Error();
      setPathResult(await r.json());
    } catch { setPathResult({ error: true }); }
    setPathLoading(false);
  };

  const exportJSON = async () => { const r = await fetch(`${API_BASE}/export/transactions`); download("transactions_export.json", JSON.stringify(await r.json(), null, 2), "application/json"); };
  const exportCSV  = async () => { const r = await fetch(`${API_BASE}/export/transactions/csv`); download("transactions_export.csv", await r.text(), "text/csv"); };
  const exportUsersJSON = async () => { const r = await fetch(`${API_BASE}/users?limit=500`); download("users_export.json", JSON.stringify(await r.json(), null, 2), "application/json"); };
  const exportUsersCSV  = async () => { const r = await fetch(`${API_BASE}/export/users/csv`);  download("users_export.csv",  await r.text(), "text/csv"); };

  return (
    <div style={{ position:"relative", zIndex:1, padding:32, animation:"fadeUp .4s ease" }}>
      <SectionLabel>Analytics — Graph Intelligence & Export</SectionLabel>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:32 }}>

        {/* Shortest path card */}
        <Card>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:20 }}>🔗 Shortest Path Between Users</div>
          <p style={{ fontSize:12, color:"var(--muted)", marginBottom:8, lineHeight:1.6 }}>Find the shortest chain of connections between two users.</p>
          <div style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:4, padding:12, marginBottom:14, fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", lineHeight:1.9 }}>
            <div style={{ color:"var(--accent4)", marginBottom:4, textTransform:"uppercase", letterSpacing:1 }}>How indirect connections work:</div>
            <div>Alice → <span style={{ color:"var(--accent)" }}>sent money to</span> → Bob</div>
            <div>Bob → <span style={{ color:"var(--accent2)" }}>shares phone with</span> → Carol</div>
            <div style={{ marginTop:6, color:"var(--accent3)" }}>Result: Alice and Carol are connected in 2 hops!</div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
            <MonoInput placeholder="From User ID (e.g. U-00001)" value={user1} onChange={e => setUser1(e.target.value)} style={{ background:"var(--surface2)" }} />
            <MonoInput placeholder="To User ID (e.g. U-00050)"   value={user2} onChange={e => setUser2(e.target.value)} style={{ background:"var(--surface2)" }} />
          </div>
          <button onClick={findPath} style={{ width:"100%", padding:10, background:"rgba(0,229,255,0.1)", border:"1px solid rgba(0,229,255,0.3)", borderRadius:4, color:"var(--accent)", fontFamily:"var(--font-mono)", fontSize:12, cursor:"pointer", letterSpacing:1 }}>
            ⚡ Find Shortest Path
          </button>
          {pathLoading && <div style={{ textAlign:"center", padding:16 }}><Spinner /></div>}
          {pathResult && (
            <div style={{ marginTop:16, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:4, padding:14, fontFamily:"var(--font-mono)", fontSize:11 }}>
              {pathResult.error ? (
                <div style={{ color:"var(--accent2)" }}>No path found between these users.</div>
              ) : (
                <>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                    <span style={{ fontSize:10, color:"var(--muted)", textTransform:"uppercase", letterSpacing:2 }}>Path Found</span>
                    <span style={{ color:"var(--accent4)", border:"1px solid rgba(0,255,136,0.3)", padding:"2px 8px", borderRadius:2 }}>{pathResult.hops} hop{pathResult.hops > 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:6, marginBottom:12 }}>
                    {(pathResult.path || []).map((node, i) => (
                      <span key={i}>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:4, background:node.startsWith("U-")?"rgba(0,229,255,0.15)":"rgba(0,255,136,0.1)", border:`1px solid ${node.startsWith("U-")?"rgba(0,229,255,0.4)":"rgba(0,255,136,0.3)"}`, color:node.startsWith("U-")?"var(--accent)":"var(--accent4)", padding:"4px 10px", borderRadius:3, fontSize:10 }}>
                          {node.startsWith("U-") ? "👤" : "⬡"} {node}
                        </span>
                        {i < pathResult.path.length - 1 && <span style={{ color:"var(--muted)", margin:"0 2px" }}>→</span>}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize:10, color:"var(--muted)", background:"var(--surface)", border:"1px solid var(--border)", padding:10, borderRadius:4, lineHeight:1.7 }}>
                    <span style={{ color:pathResult.hops===1?"var(--accent4)":"var(--accent3)" }}>●</span>{" "}
                    {pathResult.hops === 1 ? "Directly connected." : `Indirectly connected through ${pathResult.hops} steps.`}
                  </div>
                </>
              )}
            </div>
          )}
        </Card>

        {/* Export card */}
        <Card>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:20 }}>📦 Export Data</div>
          <p style={{ fontSize:12, color:"var(--muted)", marginBottom:20, lineHeight:1.6 }}>Export all graph data for external analysis, compliance reports, or backup.</p>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {[
              { label:"Transactions", btns:[{ text:"⬇ Export Transactions (JSON)", fn:exportJSON, clr:"var(--accent4)" }, { text:"⬇ Export Transactions (CSV)", fn:exportCSV, clr:"var(--accent3)" }] },
              { label:"Users",        btns:[{ text:"⬇ Export Users (JSON)", fn:exportUsersJSON, clr:"var(--accent4)" }, { text:"⬇ Export Users (CSV)", fn:exportUsersCSV, clr:"var(--accent3)" }] },
            ].map(({ label, btns }) => (
              <div key={label}>
                <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--muted)", textTransform:"uppercase", letterSpacing:2, paddingBottom:4, borderBottom:"1px solid var(--border)", marginBottom:8 }}>{label}</div>
                {btns.map(b => (
                  <button key={b.text} onClick={b.fn} style={{ width:"100%", padding:10, background: b.clr === "var(--accent3)" ? "rgba(162,89,255,0.1)" : "rgba(0,255,136,0.1)", border:`1px solid ${b.clr === "var(--accent3)" ? "rgba(162,89,255,0.3)" : "rgba(0,255,136,0.3)"}`, borderRadius:4, color:b.clr, fontFamily:"var(--font-mono)", fontSize:12, cursor:"pointer", marginBottom:8, letterSpacing:1 }}>
                    {b.text}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* API endpoints reference */}
          <div style={{ marginTop:20, padding:14, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:4 }}>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", marginBottom:8, textTransform:"uppercase", letterSpacing:2 }}>API Endpoints</div>
            {[
              ["GET","/users"], ["GET","/transactions"], ["GET","/relationships/user/:id"],
              ["GET","/relationships/transaction/:id"], ["GET","/analytics/shortest-path"],
              ["GET","/export/transactions/csv"], ["GET","/export/users/csv"],
              ["POST","/users"], ["POST","/transactions"],
            ].map(([method, path]) => (
              <div key={path} style={{ fontFamily:"var(--font-mono)", fontSize:11, lineHeight:2 }}>
                <span style={{ color: method === "POST" ? "var(--accent)" : "var(--accent4)" }}>{method}</span>{" "}
                <span style={{ color: method === "POST" ? "var(--text)" : "var(--accent)" }}>{path}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Live DB stats */}
      <SectionLabel>Live Database Stats</SectionLabel>
      <div style={{ display:"flex", gap:16, justifyContent:"center", marginBottom:32 }}>
        <Card style={{ width:340, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
            <span style={{ fontSize:11, textTransform:"uppercase", letterSpacing:2, color:"var(--muted)" }}>Database Health</span>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:10, padding:"2px 8px", borderRadius:2, background:"rgba(0,255,136,0.1)", color:"var(--accent4)", border:"1px solid rgba(0,255,136,0.2)" }}>● Online</span>
          </div>
          {[["Engine","Neo4j 4.4 LTS","var(--accent4)"], ["Protocol","Bolt 7687","var(--accent)"], ["API","FastAPI 8000","var(--accent)"]].map(([k,v,c]) => (
            <div key={k} style={{ fontFamily:"var(--font-mono)", fontSize:12, lineHeight:2.2, color:"var(--muted)" }}>
              {k}: <span style={{ color:c }}>{v}</span>
            </div>
          ))}
        </Card>
        <Card style={{ width:340, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
            <span style={{ fontSize:11, textTransform:"uppercase", letterSpacing:2, color:"var(--muted)" }}>Risk Distribution</span>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:10, padding:"2px 8px", borderRadius:2, background:"rgba(255,61,113,0.1)", color:"var(--accent2)", border:"1px solid rgba(255,61,113,0.2)" }}>Analysis</span>
          </div>
          {[["Flagged", riskStats?.flagged, "var(--accent2)"], ["Review", riskStats?.review, "var(--accent3)"], ["Clear", riskStats?.clear, "var(--accent4)"]].map(([k,v,c]) => (
            <div key={k} style={{ fontFamily:"var(--font-mono)", fontSize:12, lineHeight:2.4, color:"var(--muted)" }}>
              {k}: <span style={{ color:c }}>{v != null ? fmt(v) : "—"}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// MODAL (generic wrapper)
// ─────────────────────────────────────────────
const Modal = ({ open, onClose, title, children }) => {
  useEffect(() => {
    const handler = e => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!open) return null;
  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:"fixed", inset:0, zIndex:800, background:"rgba(6,10,18,0.88)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", animation:"modalIn .22s ease" }}
    >
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:10, width:"min(580px,94vw)", maxHeight:"90vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 24px 80px rgba(0,0,0,0.6),0 0 0 1px rgba(0,229,255,0.08)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:"1px solid var(--border)", background:"var(--surface2)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:"var(--accent4)" }} />
            <span style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--accent4)", letterSpacing:1.5, textTransform:"uppercase" }}>{title}</span>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"1px solid var(--border)", color:"var(--muted)", fontFamily:"var(--font-mono)", fontSize:12, padding:"4px 10px", borderRadius:3, cursor:"pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

// Reusable form field
const FormField = ({ label, required, children }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
    <label style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", textTransform:"uppercase", letterSpacing:1.5 }}>
      {label} {required && <span style={{ color:"var(--accent2)" }}>*</span>}
    </label>
    {children}
  </div>
);

const formInputStyle = { background:"var(--bg)", border:"1px solid var(--border)", borderRadius:4, padding:"9px 12px", color:"var(--text)", fontFamily:"var(--font-mono)", fontSize:12, outline:"none", width:"100%" };

// Alert banner
const AlertBanner = ({ type, msg }) => {
  const styles = {
    success: { bg:"rgba(0,255,136,0.08)", border:"rgba(0,255,136,0.3)", color:"var(--accent4)" },
    error:   { bg:"rgba(255,61,113,0.08)", border:"rgba(255,61,113,0.3)", color:"var(--accent2)" },
  };
  const s = styles[type] || styles.error;
  return (
    <div style={{ padding:"10px 14px", borderRadius:4, marginBottom:14, fontFamily:"var(--font-mono)", fontSize:11, lineHeight:1.6, background:s.bg, border:`1px solid ${s.border}`, color:s.color, animation:"alertIn .2s ease" }}
      dangerouslySetInnerHTML={{ __html: msg }}
    />
  );
};

// ─────────────────────────────────────────────
// ADD USER MODAL
// ─────────────────────────────────────────────
const AddUserModal = ({ onSuccess }) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id:"", name:"", email:"", phone:"", address:"", payment_method:"" });
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.id || !form.name || !form.email || !form.phone) {
      setAlert({ type:"error", msg:"⚠ User ID, Name, Email and Phone are required." }); return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users`, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(form) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAlert({ type:"success", msg:`✓ User <b style="color:var(--accent)">${data.id||form.id}</b> created successfully!` });
        setForm({ id:"", name:"", email:"", phone:"", address:"", payment_method:"" });
        onSuccess?.();
      } else {
        const detail = data.detail;
        const msg = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map(e => `${e.loc?.slice(-1)[0]||""}: ${e.msg}`).join("<br>") : `Server error (${res.status})`;
        setAlert({ type:"error", msg:`⚠ ${msg}` });
      }
    } catch { setAlert({ type:"error", msg:"⚠ Could not reach API." }); }
    setLoading(false);
  };

  return (
    <>
      <button onClick={() => { setOpen(true); setAlert(null); }} style={{ padding:"8px 14px", borderRadius:4, border:"1px solid rgba(0,255,136,0.4)", background:"var(--surface)", color:"var(--accent4)", fontFamily:"var(--font-mono)", fontSize:11, cursor:"pointer" }}>
        ＋ Add User
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="POST /users — Add New User">
        <div style={{ padding:"22px 22px 16px", overflowY:"auto", flex:1 }}>
          {alert && <AlertBanner {...alert} />}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }}>
            <FormField label="User ID" required><input style={formInputStyle} placeholder="e.g. U-00501" value={form.id} onChange={set("id")} /></FormField>
            <FormField label="Name" required><input style={formInputStyle} placeholder="e.g. Priya Sharma" value={form.name} onChange={set("name")} /></FormField>
            <FormField label="Email" required><input style={formInputStyle} type="email" placeholder="e.g. priya@email.com" value={form.email} onChange={set("email")} /></FormField>
            <FormField label="Phone" required><input style={formInputStyle} placeholder="e.g. +91 98765 43210" value={form.phone} onChange={set("phone")} /></FormField>
            <FormField label="Payment Method">
              <select style={formInputStyle} value={form.payment_method} onChange={set("payment_method")}>
                {["","UPI","NEFT","IMPS","Credit Card","Debit Card","Net Banking","Wallet"].map(o => <option key={o} value={o}>{o || "— select —"}</option>)}
              </select>
            </FormField>
            <FormField label="Address" style={{ gridColumn:"1/-1" }}>
              <input style={{ ...formInputStyle, gridColumn:"1/-1" }} placeholder="e.g. 12 MG Road, Bengaluru" value={form.address} onChange={set("address")} />
            </FormField>
          </div>
          {preview && <pre style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:4, padding:12, fontFamily:"var(--font-mono)", fontSize:11, color:"var(--accent4)", lineHeight:1.7, overflow:"auto", margin:0, whiteSpace:"pre-wrap" }}>{JSON.stringify(form, null, 2)}</pre>}
        </div>
        <div style={{ padding:"14px 22px", borderTop:"1px solid var(--border)", background:"var(--surface2)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <button onClick={() => setPreview(p => !p)} style={{ fontFamily:"var(--font-mono)", fontSize:10, padding:"7px 14px", border:"1px solid var(--border)", background:"transparent", color:"var(--muted)", borderRadius:3, cursor:"pointer" }}>⌥ Preview JSON</button>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => setOpen(false)} style={{ fontFamily:"var(--font-mono)", fontSize:10, padding:"7px 14px", border:"1px solid var(--border)", background:"transparent", color:"var(--muted)", borderRadius:3, cursor:"pointer" }}>Cancel</button>
            <button onClick={submit} disabled={loading} style={{ fontFamily:"var(--font-mono)", fontSize:11, padding:"8px 20px", background:"rgba(0,255,136,0.12)", border:"1px solid rgba(0,255,136,0.4)", color:"var(--accent4)", borderRadius:3, cursor:"pointer", display:"flex", alignItems:"center", gap:8, opacity:loading?0.5:1 }}>
              {loading ? <div style={{ width:12, height:12, border:"2px solid rgba(0,255,136,0.3)", borderTopColor:"var(--accent4)", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} /> : "＋ Create User"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

// ─────────────────────────────────────────────
// ADD TRANSACTION MODAL
// ─────────────────────────────────────────────
const AddTransactionModal = ({ onSuccess }) => {
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id:"", sender_id:"", receiver_id:"", amount:"", status:"clear", ip_address:"", device_id:"", risk_score:0.1, timestamp: now.toISOString().slice(0,16) });
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.id || !form.sender_id || !form.receiver_id || !form.amount) {
      setAlert({ type:"error", msg:"⚠ TX ID, Sender ID, Receiver ID and Amount are required." }); return;
    }
    if (form.sender_id === form.receiver_id) {
      setAlert({ type:"error", msg:"⚠ Sender and Receiver cannot be the same user." }); return;
    }
    setLoading(true);
    const payload = { ...form, amount:parseFloat(form.amount)||0, risk_score:parseFloat(form.risk_score), timestamp: form.timestamp ? new Date(form.timestamp).toISOString() : undefined };
    try {
      const res = await fetch(`${API_BASE}/transactions`, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAlert({ type:"success", msg:`✓ Transaction <b style="color:var(--accent)">${data.id||form.id}</b> created — ${form.sender_id} → ${form.receiver_id} · ₹${Number(form.amount).toLocaleString("en-IN")}` });
        setForm(f => ({ ...f, id:"", sender_id:"", receiver_id:"", amount:"", ip_address:"", device_id:"", risk_score:0.1 }));
        onSuccess?.();
      } else {
        const detail = data.detail;
        const msg = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map(e => `${e.loc?.slice(-1)[0]||""}: ${e.msg}`).join("<br>") : `Server error (${res.status})`;
        setAlert({ type:"error", msg:`⚠ ${msg}` });
      }
    } catch { setAlert({ type:"error", msg:"⚠ Could not reach API." }); }
    setLoading(false);
  };

  return (
    <>
      <button onClick={() => { setOpen(true); setAlert(null); }} style={{ padding:"8px 14px", borderRadius:4, border:"1px solid rgba(0,255,136,0.4)", background:"var(--surface)", color:"var(--accent4)", fontFamily:"var(--font-mono)", fontSize:11, cursor:"pointer" }}>
        ＋ Add Transaction
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="POST /transactions — Add New Transaction">
        <div style={{ padding:"22px 22px 16px", overflowY:"auto", flex:1 }}>
          {alert && <AlertBanner {...alert} />}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:16 }}>
            <FormField label="Transaction ID" required><input style={formInputStyle} placeholder="e.g. TX-010001" value={form.id} onChange={set("id")} /></FormField>
            <FormField label="Sender User ID" required><input style={formInputStyle} placeholder="e.g. U-00001" value={form.sender_id} onChange={set("sender_id")} /></FormField>
            <FormField label="Receiver User ID" required><input style={formInputStyle} placeholder="e.g. U-00042" value={form.receiver_id} onChange={set("receiver_id")} /></FormField>
            <FormField label="Amount (₹)" required><input style={formInputStyle} type="number" min="0" step="0.01" placeholder="e.g. 15000" value={form.amount} onChange={set("amount")} /></FormField>
            <FormField label="Status">
              <select style={formInputStyle} value={form.status} onChange={set("status")}>
                <option value="clear">Clear</option>
                <option value="review">Review</option>
                <option value="flagged">Flagged</option>
              </select>
            </FormField>
            <FormField label="IP Address"><input style={formInputStyle} placeholder="e.g. 192.168.1.1" value={form.ip_address} onChange={set("ip_address")} /></FormField>
            <FormField label="Device ID"><input style={formInputStyle} placeholder="e.g. DEV-ABC123" value={form.device_id} onChange={set("device_id")} /></FormField>
            <FormField label={`Risk Score — ${Math.round(form.risk_score * 100)}%`}>
              <input type="range" min="0" max="1" step="0.01" value={form.risk_score} onChange={e => setForm(f => ({ ...f, risk_score: parseFloat(e.target.value) }))} style={{ width:"100%", accentColor:"var(--accent)" }} />
            </FormField>
            <FormField label="Timestamp"><input style={formInputStyle} type="datetime-local" value={form.timestamp} onChange={set("timestamp")} /></FormField>
          </div>
          {preview && <pre style={{ background:"var(--bg)", border:"1px solid var(--border)", borderRadius:4, padding:12, fontFamily:"var(--font-mono)", fontSize:11, color:"var(--accent4)", lineHeight:1.7, overflow:"auto", margin:0, whiteSpace:"pre-wrap" }}>{JSON.stringify({ ...form, amount:parseFloat(form.amount)||0 }, null, 2)}</pre>}
        </div>
        <div style={{ padding:"14px 22px", borderTop:"1px solid var(--border)", background:"var(--surface2)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <button onClick={() => setPreview(p => !p)} style={{ fontFamily:"var(--font-mono)", fontSize:10, padding:"7px 14px", border:"1px solid var(--border)", background:"transparent", color:"var(--muted)", borderRadius:3, cursor:"pointer" }}>⌥ Preview JSON</button>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => setOpen(false)} style={{ fontFamily:"var(--font-mono)", fontSize:10, padding:"7px 14px", border:"1px solid var(--border)", background:"transparent", color:"var(--muted)", borderRadius:3, cursor:"pointer" }}>Cancel</button>
            <button onClick={submit} disabled={loading} style={{ fontFamily:"var(--font-mono)", fontSize:11, padding:"8px 20px", background:"rgba(0,255,136,0.12)", border:"1px solid rgba(0,255,136,0.4)", color:"var(--accent4)", borderRadius:3, cursor:"pointer", display:"flex", alignItems:"center", gap:8, opacity:loading?0.5:1 }}>
              {loading ? <div style={{ width:12, height:12, border:"2px solid rgba(0,255,136,0.3)", borderTopColor:"var(--accent4)", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} /> : "＋ Create Transaction"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

// ─────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────
export default function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [inspectUserId, setInspectUserId] = useState("");
  const [inspectTxId,   setInspectTxId]   = useState("");
  const [apiStatus, setApiStatus] = useState("CONNECTING");

  // Ping API on mount
  useEffect(() => {
    fetch(`${API_BASE}/analytics/stats`)
      .then(() => setApiStatus("LIVE"))
      .catch(() => setApiStatus("OFFLINE"));
  }, []);

  // Route to relationships page with a pre-filled user ID
  const handleInspectUser = id => { setInspectUserId(id); setActivePage("relationships"); };
  const handleInspectTx   = id => { setInspectTxId(id);   setActivePage("relationships"); };

  return (
    <>
      <GlobalStyles />
      {/* vis.js CDN loaded once */}
      <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js" />

      <Nav activePage={activePage} setActivePage={p => { setActivePage(p); }} apiStatus={apiStatus} />

      {activePage === "dashboard"     && <DashboardPage onInspectUser={handleInspectUser} />}
      {activePage === "users"         && <UsersPage onInspectUser={handleInspectUser} />}
      {activePage === "transactions"  && <TransactionsPage onInspectTx={handleInspectTx} />}
      {activePage === "relationships" && <RelationshipsPage initialUserId={inspectUserId} initialTxId={inspectTxId} />}
      {activePage === "analytics"     && <AnalyticsPage />}
    </>
  );
}