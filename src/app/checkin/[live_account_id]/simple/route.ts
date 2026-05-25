import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getCheckinState, type CheckinState } from "@/modules/checkin/server";

export const dynamic = "force-dynamic";

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ live_account_id: string }> },
): Promise<Response> {
  const { live_account_id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    const next = encodeURIComponent(`/checkin/${live_account_id}/simple`);
    return Response.redirect(new URL(`/login?next=${next}`, req.url), 302);
  }
  const state = await getCheckinState(live_account_id);
  if (!state) {
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>账号不存在</title><body style="font-family:sans-serif;text-align:center;padding:40px;color:#888">账号不存在<br><small>${esc(live_account_id)}</small></body>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  return new Response(render(state, live_account_id), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function render(state: CheckinState, accountId: string): string {
  const isKs = state.account.platform.indexOf("快手") >= 0;
  const platformCls = isKs ? "p-ks" : "p-dy";
  const title = state.account.placement_label || state.account.account_name;
  const initial = JSON.stringify(state).replace(/</g, "\\u003c");
  const accId = esc(accountId);

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<meta name="format-detection" content="telephone=no">
<title>${esc(title)} · 打卡</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",Arial,sans-serif;background:#f4f5f7;color:#222;font-size:14px;-webkit-text-size-adjust:100%}
body{padding:14px;max-width:480px;margin:0 auto;min-height:100vh;padding-bottom:30px}
.card{background:#fff;border-radius:10px;padding:16px;margin-bottom:12px;border:1px solid #eee}
.acc{display:flex;align-items:center}
.av{width:48px;height:48px;border-radius:50%;background:#1677ff;color:#fff;display:-webkit-box;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;font-weight:600;font-size:13px;margin-right:12px;overflow:hidden;flex-shrink:0}
.av img{width:100%;height:100%;object-fit:cover}
.p-ks .av{background:#ff7d00}
.acc-name{font-size:16px;font-weight:600;color:#222;line-height:1.3}
.acc-meta{font-size:11.5px;color:#888;margin-top:5px}
.badge{display:inline-block;background:#e6f4ff;color:#1677ff;padding:1px 6px;border-radius:3px;font-size:10.5px;margin-right:6px;font-weight:500}
.p-ks .badge{background:#fffbe6;color:#d48806}
.idle-status{font-size:12.5px;color:#888;text-align:center}
.idle-state{font-size:18px;font-weight:600;color:#222;text-align:center;margin-top:4px}
.live-label{font-size:12.5px;color:#888;text-align:center}
.live-anchor{font-size:18px;font-weight:600;color:#222;text-align:center;margin-top:4px}
.timer{font-size:28px;font-weight:600;color:#1677ff;text-align:center;margin-top:10px;font-family:"SF Mono",Consolas,Menlo,monospace;letter-spacing:.5px}
.timer-meta{font-size:11px;color:#aaa;text-align:center;margin-top:4px}
button{width:100%;padding:13px 0;border-radius:8px;border:0;font-size:15px;font-weight:600;cursor:pointer;margin-top:12px;-webkit-appearance:none;font-family:inherit}
button:disabled{opacity:.5}
.btn-pri{background:#1677ff;color:#fff}
.btn-pri:active{background:#1252c9}
.btn-danger{background:#f53f3f;color:#fff}
.btn-danger:active{background:#c52a2a}
.btn-sec{background:#fff;border:1px solid #ccc;color:#444}
.btn-sec:active{background:#f4f5f7}
.btn-row{display:-webkit-box;display:flex;gap:8px}
.btn-row button{-webkit-box-flex:1;-ms-flex:1;flex:1}
.hint{font-size:11.5px;color:#aaa;text-align:center;margin-top:10px}
.err{background:#fff2f2;color:#f53f3f;padding:8px 10px;border:1px solid #ffd6d6;border-radius:6px;font-size:12.5px;margin-top:12px}
.r-title{font-size:13.5px;font-weight:600;color:#222;display:-webkit-box;display:flex;-webkit-box-pack:justify;justify-content:space-between;-webkit-box-align:baseline;align-items:baseline}
.r-count{font-size:11px;color:#aaa;font-weight:normal}
.r-empty{text-align:center;color:#aaa;font-size:12.5px;padding:14px 0}
.r-list{margin-top:8px}
.r-item{display:-webkit-box;display:flex;-webkit-box-align:center;align-items:center;padding:7px 0;font-size:12.5px;border-top:1px solid #f0f0f0}
.r-item:first-child{border-top:0}
.r-av{width:26px;height:26px;border-radius:50%;background:#eee;color:#666;display:-webkit-box;display:flex;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center;font-size:10.5px;margin-right:8px;flex-shrink:0;font-weight:500}
.r-name{-webkit-box-flex:1;-ms-flex:1;flex:1;color:#222;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.r-time{color:#666;font-variant-numeric:tabular-nums}
.r-dur{color:#aaa;font-size:11px;margin-left:8px;width:54px;text-align:right;font-variant-numeric:tabular-nums}
.footer{text-align:center;color:#bbb;font-size:11px;padding:18px 0 4px}
#busy{display:none;position:fixed;left:0;right:0;top:0;bottom:0;background:rgba(0,0,0,.18);z-index:9999;-webkit-box-align:center;align-items:center;-webkit-box-pack:center;justify-content:center}
#busy.on{display:-webkit-box;display:flex}
.busy-card{background:#fff;padding:12px 20px;border-radius:6px;font-size:13px;color:#444}
</style>
</head>
<body class="${platformCls}">
<div id="busy"><div class="busy-card">处理中…</div></div>

<div class="card">
  <div class="acc">
    <div class="av" id="av"></div>
    <div style="min-width:0;flex:1">
      <div class="acc-name" id="accName">${esc(title)}</div>
      <div class="acc-meta">
        <span class="badge">${esc(state.account.platform)}</span>
        <span id="pid">${esc(state.account.platform_account_id ?? "")}</span>
      </div>
    </div>
  </div>
</div>

<div class="card" id="actCard"></div>

<div class="card">
  <div class="r-title">最近打卡 <span class="r-count" id="rCount"></span></div>
  <div id="rWrap"></div>
</div>

<div class="footer">QJHY-Pro · 主播打卡 v1（朴素版）</div>

<script>
(function(){
  var STATE = ${initial};
  var ACC = "${accId}";
  var nowOffset = 0;
  var tickTimer = null;

  function pad(n){ n = String(n); return n.length<2 ? "0"+n : n; }
  function fmtTime(iso){
    var d = new Date(iso);
    return pad(d.getHours())+":"+pad(d.getMinutes());
  }
  function fmtDate(iso){
    var d = new Date(iso);
    return (d.getMonth()+1)+"/"+d.getDate()+" "+pad(d.getHours())+":"+pad(d.getMinutes());
  }
  function fmtDur(sec){
    if (sec < 60) return sec+"s";
    var h = Math.floor(sec/3600);
    var m = Math.floor((sec%3600)/60);
    var s = sec%60;
    if (h>0) return h+"h "+m+"m "+s+"s";
    return m+"m "+s+"s";
  }
  function fmtDurShort(sec){
    if (sec == null) return "—";
    if (sec < 60) return sec+"s";
    var h = Math.floor(sec/3600);
    var m = Math.floor((sec%3600)/60);
    if (h>0) return h+"h "+m+"m";
    return m+"m";
  }
  function esc(s){
    if (s==null) return "";
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  function setBusy(on){
    var el = document.getElementById("busy");
    if (on) el.className = "on"; else el.className = "";
  }

  function showErr(card, msg){
    var old = card.querySelector(".err");
    if (old) old.parentNode.removeChild(old);
    if (!msg) return;
    var d = document.createElement("div");
    d.className = "err";
    d.textContent = msg;
    card.appendChild(d);
  }

  function avatarHtml(){
    var a = STATE.account;
    if (a.avatar) {
      return '<img src="'+esc(a.avatar)+'" alt="">';
    }
    var label = a.placement_label || a.account_name || "";
    return esc(label.slice(0,2));
  }

  function render(){
    document.getElementById("av").innerHTML = avatarHtml();
    var actCard = document.getElementById("actCard");
    actCard.innerHTML = "";

    var cur = STATE.current;
    if (cur) {
      var anchorEl = document.createElement("div"); anchorEl.className = "live-label"; anchorEl.textContent = "当前在播";
      var anchorName = document.createElement("div"); anchorName.className = "live-anchor"; anchorName.textContent = cur.anchor_name;
      var timer = document.createElement("div"); timer.className = "timer"; timer.id = "timer";
      var sub = document.createElement("div"); sub.className = "timer-meta"; sub.textContent = "开播 "+fmtDate(cur.start_at);
      actCard.appendChild(anchorEl);
      actCard.appendChild(anchorName);
      actCard.appendChild(timer);
      actCard.appendChild(sub);

      var row = document.createElement("div"); row.className = "btn-row";
      var bEnd = document.createElement("button"); bEnd.className = "btn-danger"; bEnd.textContent = "下播";
      bEnd.onclick = function(){ handleEnd(actCard); };
      var bTake = document.createElement("button"); bTake.className = "btn-sec"; bTake.textContent = "我来接班";
      bTake.onclick = function(){ handleStart(actCard); };
      row.appendChild(bEnd); row.appendChild(bTake);
      actCard.appendChild(row);

      var hint = document.createElement("div"); hint.className = "hint";
      hint.textContent = "下播：当前主播自己点；接班：换我开播";
      actCard.appendChild(hint);

      startTick(cur.start_at);
    } else {
      var s1 = document.createElement("div"); s1.className = "idle-status"; s1.textContent = "当前状态";
      var s2 = document.createElement("div"); s2.className = "idle-state"; s2.textContent = "未开播";
      actCard.appendChild(s1); actCard.appendChild(s2);
      var bStart = document.createElement("button"); bStart.className = "btn-pri"; bStart.textContent = "我要开播";
      bStart.onclick = function(){ handleStart(actCard); };
      actCard.appendChild(bStart);
      stopTick();
    }

    var rWrap = document.getElementById("rWrap");
    document.getElementById("rCount").textContent = STATE.recent.length+" 条";
    if (STATE.recent.length === 0) {
      rWrap.innerHTML = '<div class="r-empty">暂无记录</div>';
    } else {
      var list = document.createElement("div"); list.className = "r-list";
      for (var i=0; i<STATE.recent.length; i++) {
        var r = STATE.recent[i];
        var li = document.createElement("div"); li.className = "r-item";
        li.innerHTML =
          '<div class="r-av">'+esc(r.anchor_name.slice(0,1))+'</div>' +
          '<div class="r-name">'+esc(r.anchor_name)+'</div>' +
          '<div class="r-time">'+fmtTime(r.start_at)+' → '+(r.end_at? fmtTime(r.end_at) : "—")+'</div>' +
          '<div class="r-dur">'+fmtDurShort(r.duration_seconds)+'</div>';
        list.appendChild(li);
      }
      rWrap.innerHTML = "";
      rWrap.appendChild(list);
    }
  }

  function startTick(startIso){
    stopTick();
    var startMs = new Date(startIso).getTime();
    function update(){
      var sec = Math.floor((Date.now() - startMs) / 1000);
      if (sec < 0) sec = 0;
      var el = document.getElementById("timer");
      if (el) el.textContent = fmtDur(sec);
    }
    update();
    tickTimer = setInterval(update, 1000);
  }
  function stopTick(){
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function refresh(){
    return fetch("/api/checkin/"+ACC, { cache: "no-store", credentials: "same-origin" })
      .then(function(res){ if (!res.ok) throw new Error("network"); return res.json(); })
      .then(function(data){ STATE = data; render(); })
      .catch(function(){ /* ignore */ });
  }

  function handleStart(card){
    showErr(card, "");
    setBusy(true);
    fetch("/api/checkin/"+ACC+"/start", { method: "POST", credentials: "same-origin" })
      .then(function(res){
        return res.json().then(function(body){ return { ok: res.ok, body: body }; });
      })
      .then(function(r){
        if (!r.ok) {
          var msg = r.body.error || "开播失败";
          if (msg === "NOT_AN_ANCHOR") msg = "你不在主播部门，无权打卡";
          else if (msg === "ALREADY_LIVE") msg = "你已经在播这个账号";
          else if (msg === "EMERGENCY_NOT_ALLOWED") msg = "应急账号不能打卡";
          showErr(card, msg);
          return;
        }
        return refresh();
      })
      .catch(function(e){ showErr(card, "网络错误"); })
      .then(function(){ setBusy(false); });
  }

  function handleEnd(card){
    if (!STATE.current) return;
    showErr(card, "");
    setBusy(true);
    fetch("/api/checkin/"+ACC+"/end", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: STATE.current.session_id })
    })
      .then(function(res){
        return res.json().then(function(body){ return { ok: res.ok, body: body }; });
      })
      .then(function(r){
        if (!r.ok) { showErr(card, r.body.error || "下播失败"); return; }
        return refresh();
      })
      .catch(function(){ showErr(card, "网络错误"); })
      .then(function(){ setBusy(false); });
  }

  // 每 5 秒刷新一次（接班场景：A 的页面感知到被关）
  setInterval(refresh, 5000);

  render();
})();
</script>
</body>
</html>`;
}
