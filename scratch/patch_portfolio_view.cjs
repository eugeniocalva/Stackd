const fs = require('fs');

const viewsPath = 'src/views.js';
let content = fs.readFileSync(viewsPath, 'utf8');
const lines = content.split('\n');

const startIndex = lines.findIndex(line => line.trim().startsWith('window.Views.PortfolioView={'));
const endIndex = lines.findIndex(line => line.trim().startsWith('window.Views.EditAssetView={'));

if (startIndex === -1) {
  console.error('Error: Could not find PortfolioView line in views.js');
  process.exit(1);
}
if (endIndex === -1) {
  console.error('Error: Could not find EditAssetView line in views.js');
  process.exit(1);
}

console.log(`Replacing lines from index ${startIndex} to ${endIndex}`);

const newPortfolioView = `window.Views.PortfolioView={
  _isFirstRender: true,
  render(p){
    const c=p.portfolioHoldings||[],m=!!(window.StackdMarket&&window.StackdMarket.getApiKey()),h=p.marketStatus||{},g=window.StackdMarket&&window.StackdMarket.computePortfolioValue()||{totalMarketValue:0,totalInvested:0,totalPnL:0,positions:[]},y=g.totalMarketValue,x=g.totalInvested,k=g.totalPnL,w=x>0?k/x*100:0,S=(localStorage.getItem("stackd_portfolio_perf_view")||"percentage")==="percentage",D=k>=0?"▲ ":"▼ ",M=S?\`\${D}\${Math.abs(w).toFixed(2)}%\`:\`\${D}\${window.Store.formatCurrency(Math.abs(k))}\`,A=k>=0?"var(--color-income-val)":"var(--color-expense)",T=k>=0?"var(--color-income-bg)":"var(--color-expense-bg)",I=c.map(V=>V.ticker),O=window.StackdMarket&&I.length?window.StackdMarket.getOldestPriceAge(I):null,B=O?window.StackdMarket.formatAge(O):null,$=h.state==="loading";
    const isFirst=this._isFirstRender;
    this._isFirstRender=false;
    
    let z="";
    $?z='<span style="font-size:0.75rem; color:var(--text-tertiary);">Refreshing…</span>':B?z=\`<span style="font-size:0.75rem; color:var(--text-tertiary);">Updated \${B}</span>\${m?"":' · <a href="#market-settings" style="font-size:0.75rem; color:var(--color-primary); font-weight:600; text-decoration:none;">Add API key →</a>'}\`:m||(z='<a href="#market-settings" style="font-size:0.75rem; color:var(--color-primary); font-weight:600; text-decoration:none;">Add API key →</a>');
    
    const N={};
    (g.positions||[]).forEach(V=>{N[V.holdingId]=V});
    
    let U="";
    if($){
      U=\`
        <div style="display:flex; flex-direction:column; gap:var(--space-3); width:100%;">
          \${[1,2,3].map(()=>\`<div class="skeleton-shimmer" style="height:78px; border-radius:var(--radius-xl); border:1px solid var(--border-color); opacity:0.85;"></div>\`).join("")}
        </div>
      \`;
    }else if(c.length===0){
      U=\`
        <div style="text-align:center; padding:var(--space-8) var(--space-4); background:var(--bg-surface); border-radius:var(--radius-xl); border:1px dashed var(--border-color); margin-top:var(--space-6);">
          <div style="font-size:3rem; margin-bottom:var(--space-4);">📈</div>
          <h3 style="margin-bottom:var(--space-2); color:var(--text-primary);">No Assets Logged</h3>
          <p style="font-size:0.85rem; color:var(--text-secondary); max-width:250px; margin:0 auto var(--space-6) auto; line-height:1.5;">
            Track your stocks, ETFs, and crypto investments in real-time.
          </p>
          <a href="#edit-asset" class="btn btn-primary" style="display:inline-block; width:auto; padding:var(--space-3) var(--space-6); font-weight:700; border-radius:var(--radius-lg);">Add Your First Asset</a>
        </div>
      \`;
    }else{
      U=(g.positions||[]).map(V=>{
        const W=c.find(bt=>bt.id===V.holdingId);
        if(!W)return"";
        const ht=(W.sells||[]).reduce((bt,Bt)=>bt+(Bt.quantity||0),0),ut=W.quantity-ht,q=V.isSoldOut,pt=V.priceInBase!=null?window.Store.formatCurrency(V.priceInBase):"–",ct=V.marketValue!=null?window.Store.formatCurrency(V.marketValue):q?"Sold":"–",G=(p.marketPrices||{})[W.ticker.toUpperCase()],ot=G?G.changePercent||0:null,St=G?G.change||0:null,_t=G&&G.currency||"USD",dt=p.currency||"USD",tt=\`\${_t}_\${dt}\`,K=(p.fxRates||{})[tt],at=_t===dt?1:K&&K.rate||null;
        let gt=St;
        St!=null&&at!=null&&(gt=St*at);
        let lt="";
        if(!q&&ot!=null){
          const bt=ot>=0?"▲":"▼",Bt=ot>=0?"var(--color-income-val)":"var(--color-expense)",Mt=ot>=0?"var(--color-income-bg)":"var(--color-expense-bg)",It=S?\`\${bt} \${Math.abs(ot).toFixed(2)}%\`:\`\${bt} \${window.Store.formatCurrency(Math.abs(gt))}\`;
          lt=\`<span style="font-size:0.8rem; font-weight:700; color:\${Bt}; background:\${Mt}; padding:2px 8px; border-radius:8px;">\${It}</span>\`
        }else q&&(lt='<span style="font-size:0.75rem; color:var(--text-tertiary); background:var(--bg-surface-sunken); padding:2px 8px; border-radius:8px;">Closed</span>');
        let vt="";
        if(!q&&V.unrealizedPnL!=null){
          const bt=V.unrealizedPnL>=0?"+":"-",Bt=V.unrealizedPnLPct>=0?"+":"-";
          vt=\`<span style="font-size:0.75rem; color:\${V.unrealizedPnL>=0?"var(--color-income-val)":"var(--color-expense)"}; font-weight:600;">\th\${bt}\${window.Store.formatCurrency(Math.abs(V.unrealizedPnL))} (\${Bt}\${Math.abs(V.unrealizedPnLPct||0).toFixed(1)}%)</span>\`
        }
        const wt=V.isFallback,Dt=W.ticker.split(".")[0].split("-")[0].slice(0,4);
        return\`
          <div class="swipe-container" data-id="\${W.id}" style="background: transparent; border-radius: var(--radius-xl);">
            <div class="swipe-actions right">
              <button class="swipe-action-btn delete" data-id="\${W.id}" aria-label="Delete holding">
                <i data-lucide="trash-2" style="width: 20px; height: 20px;"></i>
              </button>
            </div>
            <a href="#edit-asset?id=\${W.id}" class="portfolio-asset-card swipe-content" data-ticker="\${W.ticker}" data-name="\${(W.name||"").toLowerCase()}" style="display:flex; align-items:center; gap:var(--space-3); padding:var(--space-4) var(--space-4); background:var(--bg-surface); border-radius:var(--radius-xl); margin-bottom:0; border:1px solid var(--border-color); text-decoration:none; color:inherit; cursor:pointer; transition:transform 0.15s; width:100%; box-sizing:border-box;">
              <!-- Ticker badge -->
              <div style="width:44px; height:44px; border-radius:12px; background:#1c1c1e; display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.12);">
                <span style="font-size:0.72rem; font-weight:700; color:#ffffff; text-align:center; line-height:1.1; padding:4px; text-transform:uppercase; letter-spacing:-0.02em;">
                  \${Dt}
                </span>
              </div>
              <!-- Info -->
              <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:var(--space-2); margin-bottom:2px;">
                  <span style="font-weight:700; font-size:0.95rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;">\${W.name||W.ticker}</span>
                  \th\th\${wt?\`<i data-lucide="alert-circle" style="width:12px; height:12px; color:var(--color-expense); flex-shrink:0;" title="\${V.error||"Using buy-in price as fallback"}"></i>\`:""}
                </div>
                <div style="font-size:0.78rem; color:var(--text-secondary);">
                  \${ut>0?\`\${ut} shares · \`:""}\${pt}
                  \${wt&&!q?' · <span style="font-size:0.72rem; color:var(--color-expense); font-weight:500;">Offline fallback</span>':""}
                </div>
                \th\th\${wt&&!q&&V&&V.error?\`<div style="font-size:0.68rem; color:var(--color-expense); margin-top:2px; font-weight:500;">⚠️ \${V.error}</div>\`:""}
                \${vt?\`<div style="margin-top:2px;">\${vt}</div>\`:""}
              </div>
              <!-- Right side -->
              <div style="text-align:right; flex-shrink:0;">
                <div style="font-weight:700; font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">\${ct}</div>
                \${lt}
              </div>
            </a>
          </div>
        \`;
      }).join("");
    }
    return \`
      <div class="container \${isFirst ? 'animate-fade-in' : ''}" style="padding-bottom:120px;">
 
        <!-- Pull-to-refresh indicator -->
        <div id="pull-to-refresh-indicator" style="overflow:hidden; height:0px; display:flex; align-items:center; justify-content:center; gap:8px; color:var(--text-secondary);">
          <i id="ptr-icon" data-lucide="refresh-cw" style="width:18px; height:18px; transition:transform 0.2s;"></i>
          <span id="ptr-text" style="font-size:0.8rem; font-weight:600;">Pull to refresh</span>
        </div>
 
        <!-- HEADER: Left-aligned large portfolio value -->
        <div style="margin-top:var(--space-4); margin-bottom:var(--space-6);">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:var(--space-2);">
            <p style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-tertiary); font-weight:600; margin:0;">Portfolio Value</p>
            <a href="#market-settings" id="btn-portfolio-settings" style="width:36px; height:36px; display:flex; align-items:center; justify-content:center; background:var(--bg-surface); border-radius:50%; color:var(--text-secondary); text-decoration:none; border:1px solid var(--border-color);">
              <i data-lucide="settings" style="width:16px; height:16px;"></i>
            </a>
          </div>
 
          <div style="display:flex; align-items:baseline; gap:var(--space-3); flex-wrap:wrap;">
            <h1 style="font-family:var(--font-family-display); font-size:clamp(2.2rem, 9vw, 3.2rem); font-weight:800; letter-spacing:-0.04em; margin:0; color:var(--text-primary); line-height:1;">
              \${$ ? \`<div class="skeleton-shimmer" style="width:180px; height:44px; border-radius:var(--radius-md); display:inline-block; vertical-align:middle;"></div>\` : window.Store.formatCurrency(y)}
            </h1>
            \${$ ? \`<div class="skeleton-shimmer" style="width:70px; height:24px; border-radius:var(--radius-sm); display:inline-block; vertical-align:middle;"></div>\` : \`
            <button id="btn-perf-toggle" style="background:\${T}; color:\${A}; border:none; border-radius:12px; padding:4px 10px; font-size:0.85rem; font-weight:700; cursor:pointer; white-space:nowrap;">
              \${M}
            </button>
            \`}
          </div>
 
          <div style="margin-top:var(--space-2); display:flex; align-items:center; gap:var(--space-3); flex-wrap:wrap;">
            \${$ ? \`<div class="skeleton-shimmer" style="width:140px; height:16px; border-radius:var(--radius-sm); display:inline-block;"></div>\` : \`
            <span style="font-size:0.78rem; color:var(--text-tertiary);">Invested: \${window.Store.formatCurrency(x)}</span>
            <span style="color:var(--border-color);">·</span>
            \${z}
            \`}
          </div>
        </div>
 
        <!-- Search bar -->
        \${c.length>0?\`
        <div style="position:relative; margin-bottom:var(--space-4);">
          <i data-lucide="search" style="position:absolute; left:14px; top:50%; transform:translateY(-50%); width:16px; height:16px; color:var(--text-tertiary); pointer-events:none;" aria-hidden="true"></i>
          <input id="portfolio-search" type="text" placeholder="Search assets…" aria-label="Search assets" style="width:100%; padding:10px 14px 10px 38px; background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-lg); font-size:0.9rem; color:var(--text-primary); outline:none; box-sizing:border-box;">
        </div>
        \`:""}
 
        <!-- Investments Header with Dropdown -->
        \${c.length>0?\`
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-3); margin-top:var(--space-5);">
          <h2 style="font-size:1.1rem; font-weight:700; margin:0; color:var(--text-primary);">Investments</h2>
          <div style="position:relative; display:inline-flex; align-items:center; gap:4px; cursor:pointer;">
            <select id="portfolio-perf-toggle-select" aria-label="Performance display format" style="appearance:none; background:transparent; border:none; color:var(--text-secondary); font-size:0.85rem; font-weight:600; padding-right:16px; cursor:pointer; font-family:inherit; outline:none; text-align:right;">
              <option value="percentage" \${S?"selected":""}>Percentage</option>
              <option value="absolute" \${S?"":"selected"}>Absolute Value</option>
            </select>
            <i data-lucide="chevron-down" style="position:absolute; right:0; top:50%; transform:translateY(-50%); width:12px; height:12px; color:var(--text-secondary); pointer-events:none;" aria-hidden="true"></i>
          </div>
        </div>
        \`:""}
 
        <!-- Holdings list -->
        <div id="portfolio-holdings-list">
          \${U}
        </div>
 
        <!-- Add button -->
        \${c.length>0?\`
        <a href="#edit-asset" class="btn btn-primary" style="width:100%; justify-content:center; margin-top:var(--space-4); gap:8px;">
          <i data-lucide="plus" style="width:18px; height:18px;"></i>
          Add Asset
        </a>
        \`:""}
 
      </div>\`;
  },
  attachEvents(p,c){window.StackdHydrateIcons&&window.StackdHydrateIcons();const m=p.querySelector("#btn-perf-toggle");m&&m.addEventListener("click",()=>{const I=localStorage.getItem("stackd_portfolio_perf_view")||"percentage";localStorage.setItem("stackd_portfolio_perf_view",I==="percentage"?"absolute":"percentage"),window.Store.emit()});const h=p.querySelector("#portfolio-perf-toggle-select");h&&h.addEventListener("change",I=>{localStorage.setItem("stackd_portfolio_perf_view",I.target.value),window.Store.emit()});const g=p.querySelector("#portfolio-search");g&&g.addEventListener("input",()=>{const I=g.value.toLowerCase().trim();p.querySelectorAll(".swipe-container").forEach(O=>{const B=O.querySelector(".portfolio-asset-card");if(B){const $=(B.dataset.ticker||"").toLowerCase(),z=(B.dataset.name||"").toLowerCase(),N=$.includes(I)||z.includes(I);O.style.display=N?"":"none"}})}),p.querySelectorAll(".swipe-container").forEach(I=>{const O=I.querySelector(".swipe-content"),B=I.querySelector(".swipe-actions");let $=0,z=0,N=!1;I.addEventListener("touchstart",U=>{$=U.touches[0].clientX,O.style.transition="none",N=!0},{passive:!0}),I.addEventListener("touchmove",U=>{if(!N)return;z=U.touches[0].clientX;let V=z-$;V>0&&(V=0);const W=B.offsetWidth;if(V<-W){const ht=Math.abs(V+W);V=-W-ht*.2}O.style.transform=\`translateX(\${V}px)\`},{passive:!0}),I.addEventListener("touchend",U=>{if(!N)return;N=!1,O.style.transition="transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)";const V=z-$,W=B.offsetWidth;V<-60?O.style.transform=\`translateX(\${-W}px)\`:O.style.transform="translateX(0px)"})}),p.querySelectorAll(".swipe-action-btn.delete").forEach(I=>{I.addEventListener("click",O=>{O.stopPropagation(),O.preventDefault();const B=I.dataset.id,$=c.portfolioHoldings.find(z=>z.id===B);$&&(window.Components.Modal.show({title:"Delete Asset?",content:\`<p>Are you sure you want to delete <strong>\${$.ticker}</strong>? All sell history will also be deleted.</p>\`,saveText:"Cancel",showDelete:!0,onSave:z=>z(),onDelete:z=>{window.Store.dispatch("DELETE_HOLDING",{id:$.id}),z()}}),setTimeout(()=>{const z=document.getElementById("modal-delete-btn");z&&(z.innerHTML="Yes, Delete Asset")},10))})});let y=0,x=0,k=!1;const w=p.querySelector("#pull-to-refresh-indicator"),S=p.querySelector("#ptr-icon"),D=p.querySelector("#ptr-text"),M=document.querySelector(".view-container");if(M&&w&&S&&D){M._onTouchStart&&(M.removeEventListener("touchstart",M._onTouchStart),M.removeEventListener("touchmove",M._onTouchMove),M.removeEventListener("touchend",M._onTouchEnd));const I=$=>{M.scrollTop===0?(y=$.touches[0].pageY,k=!0,w.style.transition="none"):k=!1},O=$=>{if(!k)return;const z=$.touches[0].pageY-y;z>0?(x=Math.min(80,z*.4),w.style.height=\`\${x}px\`,w.style.padding="var(--space-2) 0",S.style.transform=\`rotate(\${x*4}deg)\`,D.textContent=x>=60?"Release to refresh":"Pull to refresh",$.cancelable&&$.preventDefault()):(x=0,w.style.height="0px",w.style.padding="0",S.style.transform="none")},B=async()=>{if(k){if(k=!1,w.style.transition="height 0.2s ease, padding 0.2s ease",x>=60){w.style.height="60px",D.textContent="Refreshing prices…",S.classList.add("animate-spin");try{window.StackdMarket&&await window.StackdMarket.refreshPortfolio({force:!0})}catch($){console.error("Pull-to-refresh failed:",$)}finally{w.style.height="0px",w.style.padding="0",setTimeout(()=>{S.classList.remove("animate-spin"),window.Store.emit()},200)}}else w.style.height="0px",w.style.padding="0",S.style.transform="none";x=0}};M.addEventListener("touchstart",I,{passive:!0}),M.addEventListener("touchmove",O,{passive:!1}),M.addEventListener("touchend",B),M._onTouchStart=I,M._onTouchMove=O,M._onTouchEnd=B,this._viewContainer=M}const A=c.portfolioHoldings||[],T=(c.marketStatus||{}).state==="loading";if(A.length>0&&!T){const I=(c.marketStatus||{}).lastRefresh,O=5*60*1e3;(!I||Date.now()-new Date(I).getTime()>O)&&window.StackdMarket.refreshPortfolio()}},destroy(){this._viewContainer&&(this._viewContainer.removeEventListener("touchstart",this._onTouchStart),this._viewContainer.removeEventListener("touchmove",this._onTouchMove),this._viewContainer.removeEventListener("touchend",this._onTouchEnd),this._viewContainer=null)}`;

lines.splice(startIndex, endIndex - startIndex, newPortfolioView);
fs.writeFileSync(viewsPath, lines.join('\n'), 'utf8');
console.log('Successfully patched PortfolioView inside views.js!');
