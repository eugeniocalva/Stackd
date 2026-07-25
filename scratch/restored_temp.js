window.Views.PortfolioView={render(p){const c=p.portfolioHoldings||[],m=!!(window.StackdMarket&&window.StackdMarket.getApiKey()),h=p.marketStatus||{},g=window.StackdMarket&&window.StackdMarket.computePortfolioValue()||{totalMarketValue:0,totalInvested:0,totalPnL:0,positions:[]},y=g.totalMarketValue,x=g.totalInvested,k=g.totalPnL,w=x>0?k/x*100:0,S=(localStorage.getItem("stackd_portfolio_perf_view")||"percentage")==="percentage",D=k>=0?"▲ ":"▼ ",M=S?`${D}${Math.abs(w).toFixed(2)}%`:`${D}${window.Store.formatCurrency(Math.abs(k))}`,A=k>=0?"var(--color-income-val)":"var(--color-expense)",T=k>=0?"var(--color-income-bg)":"var(--color-expense-bg)",I=c.map(V=>V.ticker),O=window.StackdMarket&&I.length?window.StackdMarket.getOldestPriceAge(I):null,B=O?window.StackdMarket.formatAge(O):null,$=h.state==="loading";let z="";$?z='<span style="font-size:0.75rem; color:var(--text-tertiary);">Refreshing…</span>':B?z=`<span style="font-size:0.75rem; color:var(--text-tertiary);">Updated ${B}</span>${m?"":' · <a href="#market-settings" style="font-size:0.75rem; color:var(--color-primary); font-weight:600; text-decoration:none;">Add API key →</a>'}`:m||(z='<a href="#market-settings" style="font-size:0.75rem; color:var(--color-primary); font-weight:600; text-decoration:none;">Add API key →</a>');const N={};(g.positions||[]).forEach(V=>{N[V.holdingId]=V});let U="";return c.length===0?U=`
        <div style="text-align:center; padding:var(--space-8) var(--space-4); background:var(--bg-surface); border-radius:var(--radius-xl); border:1px dashed var(--border-color); margin-top:var(--space-6);">
          <div style="font-size:3rem; margin-bottom:var(--space-4);">📈</div>
          <h3 style="margin-bottom:var(--space-2); color:var(--text-primary);">No Assets Logged</h3>
          <p style="font-size:0.85rem; color:var(--text-secondary); max-width:250px; margin:0 auto var(--space-6) auto; line-height:1.5;">
            Track your stocks, ETFs, and crypto investments in real-time.
          </p>
          <a href="#edit-asset" class="btn btn-primary" style="display:inline-block; width:auto; padding:var(--space-3) var(--space-6); font-weight:700; border-radius:var(--radius-lg);">Add Your First Asset</a>
        </div>
      `:U=(g.positions||[]).map(V=>{const W=c.find(bt=>bt.id===V.holdingId);if(!W)return"";const ht=(W.sells||[]).reduce((bt,Bt)=>bt+(Bt.quantity||0),0),ut=W.quantity-ht,q=V.isSoldOut,pt=V.priceInBase!=null?window.Store.formatCurrency(V.priceInBase):"–",ct=V.marketValue!=null?window.Store.formatCurrency(V.marketValue):q?"Sold":"–",G=(p.marketPrices||{})[W.ticker.toUpperCase()],ot=G?G.changePercent||0:null,St=G?G.change||0:null,_t=G&&G.currency||"USD",dt=p.currency||"USD",tt=`${_t}_${dt}`,K=(p.fxRates||{})[tt],at=_t===dt?1:K&&K.rate||null;let gt=St;St!=null&&at!=null&&(gt=St*at);let lt="";if(!q&&ot!=null){const bt=ot>=0?"▲":"▼",Bt=ot>=0?"var(--color-income-val)":"var(--color-expense)",Mt=ot>=0?"var(--color-income-bg)":"var(--color-expense-bg)",It=S?`${bt} ${Math.abs(ot).toFixed(2)}%`:`${bt} ${window.Store.formatCurrency(Math.abs(gt))}`;lt=`<span style="font-size:0.8rem; font-weight:700; color:${Bt}; background:${Mt}; padding:2px 8px; border-radius:8px;">${It}</span>`}else q&&(lt='<span style="font-size:0.75rem; color:var(--text-tertiary); background:var(--bg-surface-sunken); padding:2px 8px; border-radius:8px;">Closed</span>');let vt="";if(!q&&V.unrealizedPnL!=null){const bt=V.unrealizedPnL>=0?"+":"-",Bt=V.unrealizedPnLPct>=0?"+":"-";vt=`<span style="font-size:0.75rem; color:${V.unrealizedPnL>=0?"var(--color-income-val)":"var(--color-expense)"}; font-weight:600;">${bt}${window.Store.formatCurrency(Math.abs(V.unrealizedPnL))} (${Bt}${Math.abs(V.unrealizedPnLPct||0).toFixed(1)}%)</span>`}const wt=V.isFallback,Dt=W.ticker.split(".")[0].split("-")[0].slice(0,4);return`
          <div class="swipe-container" data-id="${W.id}" style="background: transparent; border-radius: var(--radius-xl);">
            <div class="swipe-actions right">
              <button class="swipe-action-btn delete" data-id="${W.id}" aria-label="Delete holding">
                <i data-lucide="trash-2" style="width: 20px; height: 20px;"></i>
              </button>
            </div>
            <a href="#edit-asset?id=${W.id}" class="portfolio-asset-card swipe-content" data-ticker="${W.ticker}" data-name="${(W.name||"").toLowerCase()}" style="display:flex; align-items:center; gap:var(--space-3); padding:var(--space-4) var(--space-4); background:var(--bg-surface); border-radius:var(--radius-xl); margin-bottom:0; border:1px solid var(--border-color); text-decoration:none; color:inherit; cursor:pointer; transition:transform 0.15s; width:100%; box-sizing:border-box;">
              \x3C!-- Ticker badge -->
              <div style="width:44px; height:44px; border-radius:12px; background:#1c1c1e; display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.12);">
                <span style="font-size:0.72rem; font-weight:700; color:#ffffff; text-align:center; line-height:1.1; padding:4px; text-transform:uppercase; letter-spacing:-0.02em;">
                  ${Dt}
                </span>
              </div>
              \x3C!-- Info -->
              <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:var(--space-2); margin-bottom:2px;">
                  <span style="font-weight:700; font-size:0.95rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;">${W.name||W.ticker}</span>
                  ${wt?`<i data-lucide="alert-circle" style="width:12px; height:12px; color:var(--color-expense); flex-shrink:0;" title="${V.error||"Using buy-in price as fallback"}"></i>`:""}
                </div>
                <div style="font-size:0.78rem; color:var(--text-secondary);">
                  ${ut>0?`${ut} shares · `:""}${pt}
                  ${wt&&!q?' · <span style="font-size:0.72rem; color:var(--color-expense); font-weight:500;">Offline fallback</span>':""}
                </div>
                ${wt&&!q&&V&&V.error?`<div style="font-size:0.68rem; color:var(--color-expense); margin-top:2px; font-weight:500;">⚠️ ${V.error}</div>`:""}
                ${vt?`<div style="margin-top:2px;">${vt}</div>`:""}
              </div>
              \x3C!-- Right side -->
              <div style="text-align:right; flex-shrink:0;">
                <div style="font-weight:700; font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">${ct}</div>
                ${lt}
              </div>
            </a>
          </div>
        `}).join(""),`
      <div class="container animate-fade-in" style="padding-bottom:120px;">

        \x3C!-- Pull-to-refresh indicator -->
        <div id="pull-to-refresh-indicator" style="overflow:hidden; height:0px; display:flex; align-items:center; justify-content:center; gap:8px; color:var(--text-secondary);">
          <i id="ptr-icon" data-lucide="refresh-cw" style="width:18px; height:18px; transition:transform 0.2s;"></i>
          <span id="ptr-text" style="font-size:0.8rem; font-weight:600;">Pull to refresh</span>
        </div>

        \x3C!-- HEADER: Left-aligned large portfolio value -->
        <div style="margin-top:var(--space-4); margin-bottom:var(--space-6);">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:var(--space-2);">
            <p style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-tertiary); font-weight:600; margin:0;">Portfolio Value</p>
            <a href="#market-settings" id="btn-portfolio-settings" style="width:36px; height:36px; display:flex; align-items:center; justify-content:center; background:var(--bg-surface); border-radius:50%; color:var(--text-secondary); text-decoration:none; border:1px solid var(--border-color);">
              <i data-lucide="settings" style="width:16px; height:16px;"></i>
            </a>
          </div>

          <div style="display:flex; align-items:baseline; gap:var(--space-3); flex-wrap:wrap;">
            <h1 style="font-family:var(--font-family-display); font-size:clamp(2.2rem, 9vw, 3.2rem); font-weight:800; letter-spacing:-0.04em; margin:0; color:var(--text-primary); line-height:1;">
              ${window.Store.formatCurrency(y)}
            </h1>
            <button id="btn-perf-toggle" style="background:${T}; color:${A}; border:none; border-radius:12px; padding:4px 10px; font-size:0.85rem; font-weight:700; cursor:pointer; white-space:nowrap;">
              ${M}
            </button>
          </div>

          <div style="margin-top:var(--space-2); display:flex; align-items:center; gap:var(--space-3); flex-wrap:wrap;">
            <span style="font-size:0.78rem; color:var(--text-tertiary);">Invested: ${window.Store.formatCurrency(x)}</span>
            <span style="color:var(--border-color);">·</span>
            ${z}
          </div>
        </div>

        \x3C!-- Search bar -->
        ${c.length>0?`
        <div style="position:relative; margin-bottom:var(--space-4);">
          <i data-lucide="search" style="position:absolute; left:14px; top:50%; transform:translateY(-50%); width:16px; height:16px; color:var(--text-tertiary); pointer-events:none;" aria-hidden="true"></i>
          <input id="portfolio-search" type="text" placeholder="Search assets…" aria-label="Search assets" style="width:100%; padding:10px 14px 10px 38px; background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-lg); font-size:0.9rem; color:var(--text-primary); outline:none; box-sizing:border-box;">
        </div>
        `:""}

        \x3C!-- Investments Header with Dropdown -->
        ${c.length>0?`
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-3); margin-top:var(--space-5);">
          <h2 style="font-size:1.1rem; font-weight:700; margin:0; color:var(--text-primary);">Investments</h2>
          <div style="position:relative; display:inline-flex; align-items:center; gap:4px; cursor:pointer;">
            <select id="portfolio-perf-toggle-select" aria-label="Performance display format" style="appearance:none; background:transparent; border:none; color:var(--text-secondary); font-size:0.85rem; font-weight:600; padding-right:16px; cursor:pointer; font-family:inherit; outline:none; text-align:right;">
              <option value="percentage" ${S?"selected":""}>Percentage</option>
              <option value="absolute" ${S?"":"selected"}>Absolute Value</option>
            </select>
            <i data-lucide="chevron-down" style="position:absolute; right:0; top:50%; transform:translateY(-50%); width:12px; height:12px; color:var(--text-secondary); pointer-events:none;" aria-hidden="true"></i>
          </div>
        </div>
        `:""}

        \x3C!-- Holdings list -->
        <div id="portfolio-holdings-list">
          ${U}
        </div>

        \x3C!-- Add button -->
        ${c.length>0?`
        <a href="#edit-asset" class="btn btn-primary" style="width:100%; justify-content:center; margin-top:var(--space-4); gap:8px;">
          <i data-lucide="plus" style="width:18px; height:18px;"></i>
          Add Asset
        </a>
        `:""}

      </div>
    `},attachEvents(p,c){window.StackdHydrateIcons&&window.StackdHydrateIcons();const m=p.querySelector("#btn-perf-toggle");m&&m.addEventListener("click",()=>{const I=localStorage.getItem("stackd_portfolio_perf_view")||"percentage";localStorage.setItem("stackd_portfolio_perf_view",I==="percentage"?"absolute":"percentage"),window.Store.emit()});const h=p.querySelector("#portfolio-perf-toggle-select");h&&h.addEventListener("change",I=>{localStorage.setItem("stackd_portfolio_perf_view",I.target.value),window.Store.emit()});const g=p.querySelector("#portfolio-search");g&&g.addEventListener("input",()=>{const I=g.value.toLowerCase().trim();p.querySelectorAll(".swipe-container").forEach(O=>{const B=O.querySelector(".portfolio-asset-card");if(B){const $=(B.dataset.ticker||"").toLowerCase(),z=(B.dataset.name||"").toLowerCase(),N=$.includes(I)||z.includes(I);O.style.display=N?"":"none"}})}),p.querySelectorAll(".swipe-container").forEach(I=>{const O=I.querySelector(".swipe-content"),B=I.querySelector(".swipe-actions");let $=0,z=0,N=!1;I.addEventListener("touchstart",U=>{$=U.touches[0].clientX,O.style.transition="none",N=!0},{passive:!0}),I.addEventListener("touchmove",U=>{if(!N)return;z=U.touches[0].clientX;let V=z-$;V>0&&(V=0);const W=B.offsetWidth;if(V<-W){const ht=Math.abs(V+W);V=-W-ht*.2}O.style.transform=`translateX(${V}px)`},{passive:!0}),I.addEventListener("touchend",U=>{if(!N)return;N=!1,O.style.transition="transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)";const V=z-$,W=B.offsetWidth;V<-60?O.style.transform=`translateX(${-W}px)`:O.style.transform="translateX(0px)"})}),p.querySelectorAll(".swipe-action-btn.delete").forEach(I=>{I.addEventListener("click",O=>{O.stopPropagation(),O.preventDefault();const B=I.dataset.id,$=c.portfolioHoldings.find(z=>z.id===B);$&&(window.Components.Modal.show({title:"Delete Asset?",content:`<p>Are you sure you want to delete <strong>${$.ticker}</strong>? All sell history will also be deleted.</p>`,saveText:"Cancel",showDelete:!0,onSave:z=>z(),onDelete:z=>{window.Store.dispatch("DELETE_HOLDING",{id:$.id}),z()}}),setTimeout(()=>{const z=document.getElementById("modal-delete-btn");z&&(z.innerHTML="Yes, Delete Asset")},10))})});let y=0,x=0,k=!1;const w=p.querySelector("#pull-to-refresh-indicator"),S=p.querySelector("#ptr-icon"),D=p.querySelector("#ptr-text"),M=document.querySelector(".view-container");if(M&&w&&S&&D){M._onTouchStart&&(M.removeEventListener("touchstart",M._onTouchStart),M.removeEventListener("touchmove",M._onTouchMove),M.removeEventListener("touchend",M._onTouchEnd));const I=$=>{M.scrollTop===0?(y=$.touches[0].pageY,k=!0,w.style.transition="none"):k=!1},O=$=>{if(!k)return;const z=$.touches[0].pageY-y;z>0?(x=Math.min(80,z*.4),w.style.height=`${x}px`,w.style.padding="var(--space-2) 0",S.style.transform=`rotate(${x*4}deg)`,D.textContent=x>=60?"Release to refresh":"Pull to refresh",$.cancelable&&$.preventDefault()):(x=0,w.style.height="0px",w.style.padding="0",S.style.transform="none")},B=async()=>{if(k){if(k=!1,w.style.transition="height 0.2s ease, padding 0.2s ease",x>=60){w.style.height="60px",D.textContent="Refreshing prices…",S.classList.add("animate-spin");try{window.StackdMarket&&await window.StackdMarket.refreshPortfolio({force:!0})}catch($){console.error("Pull-to-refresh failed:",$)}finally{w.style.height="0px",w.style.padding="0",setTimeout(()=>{S.classList.remove("animate-spin"),window.Store.emit()},200)}}else w.style.height="0px",w.style.padding="0",S.style.transform="none";x=0}};M.addEventListener("touchstart",I,{passive:!0}),M.addEventListener("touchmove",O,{passive:!1}),M.addEventListener("touchend",B),M._onTouchStart=I,M._onTouchMove=O,M._onTouchEnd=B,this._viewContainer=M}const A=c.portfolioHoldings||[],T=(c.marketStatus||{}).state==="loading";if(A.length>0&&!T){const I=(c.marketStatus||{}).lastRefresh,O=5*60*1e3;(!I||Date.now()-new Date(I).getTime()>O)&&window.StackdMarket.refreshPortfolio()}},destroy(){this._viewContainer&&(this._viewContainer.removeEventListener("touchstart",this._onTouchStart),this._viewContainer.removeEventListener("touchmove",this._onTouchMove),this._viewContainer.removeEventListener("touchend",this._onTouchEnd),this._viewContainer=null)}};window.Views.EditAssetView={render(p){const c=(window.Router?window.Router.getParams():{}).id,m=c?(p.portfolioHoldings||[]).find(O=>O.id===c):null,h=!!m,g=new Date().toISOString().split("T")[0],y=m?m.ticker:"",x=m&&m.name||"",k=m&&m.assetType||"stock",w=m?m.quantity:"",S=m?m.buyInPrice:"",D=m&&m.buyInCurrency||"USD",M=m&&m.buyDate||g,A=m?m.accountId||"":p.defaultAccountId||"",T=(p.accounts||[]).map(O=>`<option value="${O.id}" ${O.id===A?"selected":""}>${O.name}</option>`).join(""),I=[{value:"stock",label:"Stock"},{value:"etf",label:"ETF"},{value:"crypto",label:"Crypto"},{value:"bond",label:"Bond"},{value:"other",label:"Other"}].map(O=>`<option value="${O.value}" ${O.value===k?"selected":""}>${O.label}</option>`).join("");return`
      <div class="container animate-fade-in" style="padding-bottom:100px;">
        <div class="page-header" style="margin-top:var(--space-4);">
          <h1 class="page-header-title">${h?"Edit Asset":"Add Asset"}</h1>
          <a href="#portfolio" style="color:var(--text-secondary); width:32px; height:32px; display:flex; align-items:center; justify-content:center; background:var(--bg-surface); border-radius:50%; border:1px solid var(--border-color);">
            <i data-lucide="x" style="width:16px; height:16px;"></i>
          </a>
        </div>

        <div class="card">
          \x3C!-- Ticker search -->
          <div class="form-group">
            <label class="form-label" for="asset-ticker">Ticker Symbol</label>
            <div style="position:relative;">
              <input id="asset-ticker" type="text" class="form-control" placeholder="e.g. AAPL, BTC-USD" value="${y}" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false">
              <div id="ticker-search-results" style="display:none; position:absolute; top:100%; left:0; right:0; background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-lg); z-index:100; max-height:200px; overflow-y:auto; box-shadow:0 8px 24px rgba(0,0,0,0.12);"></div>
            </div>
            <p id="ticker-search-status" style="font-size:0.75rem; color:var(--text-tertiary); margin-top:4px; display:none;"></p>
          </div>

          \x3C!-- Name -->
          <div class="form-group">
            <label class="form-label" for="asset-name">Asset Name</label>
            <input id="asset-name" type="text" class="form-control" placeholder="e.g. Apple Inc." value="${x}">
          </div>

          \x3C!-- Asset Type -->
          <div class="form-group">
            <label class="form-label" for="asset-type">Asset Type</label>
            <select id="asset-type" class="form-control" style="appearance:none;">
              ${I}
            </select>
          </div>
        </div>

        <div class="card">
          \x3C!-- Quantity -->
          <div class="form-group">
            <label class="form-label" for="asset-quantity">Quantity (Shares)</label>
            <input id="asset-quantity" type="number" class="form-control" placeholder="0" step="any" inputmode="decimal" value="${w}">
          </div>

          \x3C!-- Buy-in Price -->
          <div class="form-group">
            <label class="form-label" for="asset-buy-price">Buy-In Price (per share)</label>
            <input id="asset-buy-price" type="number" class="form-control" placeholder="0.00" step="any" inputmode="decimal" value="${S}">
          </div>

          \x3C!-- Currency -->
          <div class="form-group">
            <label class="form-label" for="asset-currency">Currency</label>
            <input id="asset-currency" type="text" class="form-control" placeholder="USD" value="${D}" maxlength="5" autocapitalize="characters">
          </div>

          \x3C!-- Buy Date -->
          <div class="form-group">
            <label class="form-label" for="asset-date">Purchase Date</label>
            <input id="asset-date" type="date" class="form-control" value="${M}">
          </div>

          \x3C!-- Account -->
          ${p.accounts&&p.accounts.length>0?`
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" for="asset-account">Linked Account (Optional)</label>
            <select id="asset-account" class="form-control" style="appearance:none;">
              <option value="">— None —</option>
              ${T}
            </select>
          </div>
          `:""}
        </div>

        <button id="btn-save-asset" class="btn btn-primary" style="width:100%; padding:var(--space-4); font-size:1.05rem; border-radius:var(--radius-lg); margin-bottom:var(--space-3);">
          ${h?"Save Changes":"Add to Portfolio"}
        </button>

        ${h?`
        <button id="btn-sell-asset" class="btn btn-secondary" style="width:100%; padding:var(--space-3); border-radius:var(--radius-lg); margin-bottom:var(--space-3); display:flex; align-items:center; justify-content:center; gap:8px;">
          <i data-lucide="trending-down" style="width:16px; height:16px;"></i>
          Record a Sale
        </button>
        <button id="btn-delete-asset" class="btn" style="width:100%; padding:var(--space-3); color:var(--color-expense); background:var(--color-expense-bg); border-radius:var(--radius-lg); font-weight:600;">
          Delete Asset
        </button>
        `:""}
      </div>
    `},attachEvents(p,c){window.StackdHydrateIcons&&window.StackdHydrateIcons();const m=(window.Router?window.Router.getParams():{}).id,h=m?(c.portfolioHoldings||[]).find(I=>I.id===m):null,g=!!h,y=p.querySelector("#asset-ticker"),x=p.querySelector("#asset-name"),k=p.querySelector("#asset-currency"),w=p.querySelector("#ticker-search-results"),S=p.querySelector("#ticker-search-status");let D=null;y&&window.StackdMarket&&window.StackdMarket.getApiKey()&&(y.addEventListener("input",()=>{clearTimeout(D);const I=y.value.trim();if(I.length<2){w.style.display="none";return}D=setTimeout(async()=>{S&&(S.style.display="block",S.textContent="Searching…");try{const O=await window.StackdMarket.searchTicker(I);if(S&&(S.style.display="none"),!O||O.length===0){w.style.display="none";return}w.innerHTML=O.slice(0,8).map(B=>`
              <div class="ticker-result-item" data-ticker="${B.ticker}" data-name="${B.name}" style="padding:10px 14px; cursor:pointer; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <span style="font-weight:700; font-size:0.9rem;">${B.ticker}</span>
                  <span style="font-size:0.8rem; color:var(--text-secondary); margin-left:6px;">${B.name}</span>
                </div>
                <span style="font-size:0.72rem; color:var(--text-tertiary);">${B.type||""}</span>
              </div>
            `).join(""),w.style.display="block",w.querySelectorAll(".ticker-result-item").forEach(B=>{B.addEventListener("click",()=>{y.value=B.dataset.ticker,x&&(x.value=B.dataset.name||""),w.style.display="none"})})}catch{S&&(S.style.display="block",S.textContent="Search failed. Enter ticker manually."),w.style.display="none"}},400)}),document.addEventListener("click",I=>{p.contains(I.target)||(w.style.display="none")},{once:!0})),y&&y.addEventListener("blur",()=>{y.value=y.value.toUpperCase().trim()});const M=p.querySelector("#btn-save-asset");M&&M.addEventListener("click",()=>{const I=(y?y.value:"").trim().toUpperCase(),O=x?x.value.trim():"",B=p.querySelector("#asset-type").value,$=parseFloat(p.querySelector("#asset-quantity").value),z=parseFloat(p.querySelector("#asset-buy-price").value),N=(k?k.value:"USD").trim().toUpperCase()||"USD",U=p.querySelector("#asset-date").value,V=p.querySelector("#asset-account"),W=V?V.value:"";if(!I){const ht=p.querySelector("#asset-ticker");ht&&(ht.style.borderColor="var(--color-expense)",setTimeout(()=>ht.style.borderColor="",1e3));return}if(isNaN($)||$<=0){const ht=p.querySelector("#asset-quantity");ht&&(ht.style.background="var(--color-expense-bg)",setTimeout(()=>ht.style.background="",1e3));return}if(isNaN(z)||z<0){const ht=p.querySelector("#asset-buy-price");ht&&(ht.style.background="var(--color-expense-bg)",setTimeout(()=>ht.style.background="",1e3));return}g?window.Store.dispatch("UPDATE_HOLDING",{id:h.id,ticker:I,name:O,assetType:B,quantity:$,buyInPrice:z,buyInCurrency:N,buyDate:U,accountId:W}):(window.Store.dispatch("ADD_HOLDING",{ticker:I,name:O,assetType:B,quantity:$,buyInPrice:z,buyInCurrency:N,buyDate:U,accountId:W}),window.StackdMarket&&window.StackdMarket.getApiKey()&&setTimeout(()=>window.StackdMarket.refreshPortfolio(),300)),window.Router.navigate("#portfolio")});const A=p.querySelector("#btn-sell-asset");A&&h&&A.addEventListener("click",()=>{window.Router.navigate(`#sell-asset?id=${h.id}`)});const T=p.querySelector("#btn-delete-asset");T&&h&&T.addEventListener("click",()=>{window.Components.Modal.show({title:"Delete Asset?",content:`<p>Are you sure you want to delete <strong>${h.ticker}</strong>? All sell history will also be deleted.</p>`,saveText:"Cancel",showDelete:!0,onSave:I=>I(),onDelete:I=>{window.Store.dispatch("DELETE_HOLDING",{id:h.id}),I(),window.Router.navigate("#portfolio")}}),setTimeout(()=>{const I=document.getElementById("modal-delete-btn");I&&(I.innerHTML="Yes, Delete Asset")},10)})},destroy(){}};window.Views.SellAssetView={render(p){const c=(window.Router?window.Router.getParams():{}).id,m=c?(p.portfolioHoldings||[]).find(S=>S.id===c):null;if(!m)return`<div class="container animate-fade-in" style="padding-top:40px; text-align:center;">
        <p>Asset not found.</p>
        <a href="#portfolio" class="btn btn-primary" style="display:inline-block; width:auto; padding:8px 16px;">Go Back</a>
      </div>`;const h=(m.sells||[]).reduce((S,D)=>S+(D.quantity||0),0),g=m.quantity-h,y=new Date().toISOString().split("T")[0],x=(p.marketPrices||{})[m.ticker.toUpperCase()],k=x&&x.price?x.price.toFixed(2):"",w=(p.accounts||[]).map(S=>`<option value="${S.id}" ${S.id===(m.accountId||"")?"selected":""}>${S.name}</option>`).join("");return`
      <div class="container animate-fade-in" style="padding-bottom:100px;">
        <div class="page-header" style="margin-top:var(--space-4);">
          <h1 class="page-header-title">Sell ${m.ticker}</h1>
          <a href="#edit-asset?id=${m.id}" style="color:var(--text-secondary); width:32px; height:32px; display:flex; align-items:center; justify-content:center; background:var(--bg-surface); border-radius:50%; border:1px solid var(--border-color);">
            <i data-lucide="x" style="width:16px; height:16px;"></i>
          </a>
        </div>

        <div class="card" style="margin-bottom:var(--space-3); padding:var(--space-3);">
          <p style="font-size:0.8rem; color:var(--text-secondary); margin:0;">
            Available: <strong>${g} ${g===1?"share":"shares"}</strong> of ${m.name||m.ticker}
          </p>
        </div>

        <div class="card">
          <div class="form-group">
            <label class="form-label" for="sell-qty">Quantity to Sell</label>
            <input id="sell-qty" type="number" class="form-control" placeholder="0" step="any" inputmode="decimal" max="${g}" value="${g}">
          </div>

          <div class="form-group">
            <label class="form-label" for="sell-price" style="display:flex; justify-content:space-between;">
              <span>Sell Price (per share)</span>
              ${k?`<span style="font-size:0.75rem; color:var(--color-primary); cursor:pointer;" id="use-market-price">Use market: ${k}</span>`:""}
            </label>
            <input id="sell-price" type="number" class="form-control" placeholder="0.00" step="any" inputmode="decimal" value="${k}">
          </div>

          <div class="form-group">
            <label class="form-label" for="sell-currency">Currency</label>
            <input id="sell-currency" type="text" class="form-control" value="${m.buyInCurrency||"USD"}" maxlength="5" autocapitalize="characters">
          </div>

          <div class="form-group">
            <label class="form-label" for="sell-date">Sell Date</label>
            <input id="sell-date" type="date" class="form-control" value="${y}">
          </div>

          ${p.accounts&&p.accounts.length>0?`
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" for="sell-destination">Proceeds → Account (Optional)</label>
            <select id="sell-destination" class="form-control" style="appearance:none;">
              <option value="">— None —</option>
              ${w}
            </select>
          </div>
          `:""}
        </div>

        <button id="btn-confirm-sell" class="btn btn-primary" style="width:100%; padding:var(--space-4); font-size:1.05rem; border-radius:var(--radius-lg);">
          Confirm Sale
        </button>
      </div>
    `},attachEvents(p,c){window.StackdHydrateIcons&&window.StackdHydrateIcons();const m=(window.Router?window.Router.getParams():{}).id,h=m?(c.portfolioHoldings||[]).find(S=>S.id===m):null;if(!h)return;const g=(h.sells||[]).reduce((S,D)=>S+(D.quantity||0),0),y=h.quantity-g,x=p.querySelector("#use-market-price"),k=p.querySelector("#sell-price");x&&k&&x.addEventListener("click",()=>{const S=(c.marketPrices||{})[h.ticker.toUpperCase()];S&&S.price&&(k.value=S.price.toFixed(2))});const w=p.querySelector("#btn-confirm-sell");w&&w.addEventListener("click",()=>{const S=parseFloat(p.querySelector("#sell-qty").value),D=parseFloat(k.value),M=p.querySelector("#sell-currency").value.trim().toUpperCase()||"USD",A=p.querySelector("#sell-date").value,T=p.querySelector("#sell-destination"),I=T?T.value:"";if(isNaN(S)||S<=0){alert("Please enter a valid quantity greater than 0.");return}if(S>y){alert(`Cannot sell more than you own (${y} available).`);return}if(isNaN(D)||D<0){alert("Please enter a valid sell price.");return}window.Store.dispatch("SELL_HOLDING",{holdingId:m,sellDate:A,quantity:S,sellPrice:D,sellCurrency:M,targetAccountId:I,note:`Sale of ${S} ${h.ticker} @ ${D}`}),window.StackdMarket&&window.StackdMarket.getApiKey()&&window.StackdMarket.refreshPortfolio(),window.Router.navigate("#portfolio")})},destroy(){}};window.Views.MarketSettingsView={render(p){const c=window.StackdMarket?window.StackdMarket.getApiKey():"",m=!!c,h=m?`${c.slice(0,4)}${"•".repeat(Math.max(0,c.length-8))}${c.slice(-4)}`:"",g=window.StackdMarket?window.StackdMarket.getCachedPrices():{},y=window.StackdMarket?window.StackdMarket.getCachedFXRates():{},x=Object.keys(g).length,k=Object.keys(y).length,w=p.marketStatus||{},S=w.state==="loading"?"Refreshing…":w.state==="success"?"Prices up to date":w.state==="error"?"Last refresh failed":"Idle";return`
      <div class="container animate-fade-in" style="padding-bottom:100px;">
        <div class="page-header" style="margin-top:var(--space-4);">
          <h1 class="page-header-title">Market Data</h1>
          <a href="#portfolio" style="color:var(--text-secondary); width:32px; height:32px; display:flex; align-items:center; justify-content:center; background:var(--bg-surface); border-radius:50%; border:1px solid var(--border-color);">
            <i data-lucide="arrow-left" style="width:16px; height:16px;"></i>
          </a>
        </div>

        \x3C!-- API Key section -->
        <div class="card">
          <div style="display:flex; align-items:center; gap:var(--space-3); margin-bottom:var(--space-4);">
            <div style="width:40px; height:40px; background:var(--color-primary-bg, rgba(99,102,241,0.1)); border-radius:var(--radius-lg); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              <i data-lucide="key" style="width:18px; height:18px; color:var(--color-primary);"></i>
            </div>
            <div>
              <p style="font-weight:700; margin:0; font-size:0.95rem;">Finnhub API Key</p>
              <p style="font-size:0.78rem; color:var(--text-secondary); margin:2px 0 0;">Free tier: 60 req/min · <a href="https://finnhub.io" target="_blank" rel="noopener" style="color:var(--color-primary);">finnhub.io</a></p>
            </div>
          </div>

          ${m?`
          <div style="background:var(--bg-surface-sunken); border-radius:var(--radius-lg); padding:var(--space-3) var(--space-4); margin-bottom:var(--space-4); display:flex; align-items:center; justify-content:space-between;">
            <span style="font-family:monospace; font-size:0.85rem; color:var(--text-secondary);">${h}</span>
            <button id="btn-reveal-key" style="background:none; border:none; color:var(--color-primary); font-size:0.8rem; cursor:pointer; font-weight:600;">Reveal</button>
          </div>
          `:`
          <div style="background:var(--color-expense-bg); border-radius:var(--radius-lg); padding:var(--space-3) var(--space-4); margin-bottom:var(--space-4); display:flex; align-items:center; gap:8px;">
            <i data-lucide="alert-circle" style="width:14px; height:14px; color:var(--color-expense); flex-shrink:0;"></i>
            <span style="font-size:0.82rem; color:var(--color-expense);">No API key set. Live prices are unavailable.</span>
          </div>
          `}

          <div class="form-group">
            <label class="form-label" for="mkt-api-key-input">${m?"Update API Key":"Enter API Key"}</label>
            <input id="mkt-api-key-input" type="password" class="form-control" placeholder="Paste your Finnhub API key" autocomplete="off" autocorrect="off" spellcheck="false">
          </div>

          <div style="display:flex; gap:var(--space-3);">
            <button id="btn-save-api-key" class="btn btn-primary" style="flex:1;">Save Key</button>
            ${m?'<button id="btn-remove-api-key" class="btn" style="color:var(--color-expense); background:var(--color-expense-bg);">Remove</button>':""}
          </div>
        </div>

        \x3C!-- Status & Cache -->
        <div class="card">
          <p class="section-title">Status &amp; Cache</p>

          <div style="display:flex; flex-direction:column; gap:var(--space-3);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:var(--text-secondary);">Service Status</span>
              <span style="font-size:0.88rem; font-weight:600;">${S}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:var(--text-secondary);">Cached Prices</span>
              <span style="font-size:0.88rem; font-weight:600;">${x} ticker${x!==1?"s":""}</span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.88rem; color:var(--text-secondary);">Cached FX Rates</span>
              <span style="font-size:0.88rem; font-weight:600;">${k} pair${k!==1?"s":""}</span>
            </div>
          </div>

          <div style="display:flex; gap:var(--space-3); margin-top:var(--space-4);">
            ${m?`<button id="btn-refresh-prices" class="btn btn-secondary" style="flex:1; gap:6px; display:flex; align-items:center; justify-content:center;">
              <i data-lucide="refresh-cw" style="width:14px; height:14px;"></i>
              Refresh Now
            </button>`:""}
            <button id="btn-clear-cache" class="btn" style="flex:1; color:var(--text-secondary); background:var(--bg-surface-sunken);">
              Clear Cache
            </button>
          </div>
        </div>

        \x3C!-- Info -->
        <div style="padding:var(--space-4); background:var(--bg-surface-sunken); border-radius:var(--radius-lg); border:1px solid var(--border-color);">
          <p style="font-size:0.78rem; color:var(--text-tertiary); margin:0; line-height:1.6;">
            <strong>Privacy:</strong> Your API key is stored only in this device's local storage and is never transmitted to any server other than Finnhub's API. Price data is cached locally for 5 minutes to minimise API calls.
          </p>
        </div>
      </div>
    `},attachEvents(p,c){window.StackdHydrateIcons&&window.StackdHydrateIcons();const m=p.querySelector("#mkt-api-key-input"),h=p.querySelector("#btn-save-api-key"),g=p.querySelector("#btn-remove-api-key"),y=p.querySelector("#btn-reveal-key"),x=p.querySelector("#btn-refresh-prices"),k=p.querySelector("#btn-clear-cache");h&&m&&h.addEventListener("click",()=>{const w=m.value.trim();if(!w){m.style.borderColor="var(--color-expense)",setTimeout(()=>m.style.borderColor="",1200);return}window.Store.dispatch("SET_FINNHUB_KEY",w),window.StackdMarket&&(window.StackdMarket.setApiKey(w),window.StackdMarket.refreshPortfolio({force:!0})),m.value="",window.Store.emit()}),g&&g.addEventListener("click",()=>{window.Store.dispatch("SET_FINNHUB_KEY",""),window.StackdMarket&&(window.StackdMarket.setApiKey(""),window.StackdMarket.clearPriceCache(),window.StackdMarket.clearFXCache()),window.Store.emit()}),y&&window.StackdMarket&&y.addEventListener("click",()=>{const w=window.StackdMarket.getApiKey(),S=y.closest("div").querySelector("span");S&&w&&(S.textContent=w),y.style.display="none"}),x&&window.StackdMarket&&x.addEventListener("click",async()=>{x.disabled=!0;const w=x.querySelector("[data-lucide]");w&&w.classList.add("animate-spin");try{await window.StackdMarket.refreshPortfolio({force:!0})}catch(S){console.error("Refresh failed:",S)}finally{x.disabled=!1,w&&w.classList.remove("animate-spin"),window.Store.emit()}}),k&&window.StackdMarket&&k.addEventListener("click",()=>{window.StackdMarket.clearPriceCache(),window.StackdMarket.clearFXCache(),window.Store.emit()})},destroy(){}};window.Views.DebtView={_sim:{amount:0,tan:0,durationMonths:12,result:null},_activePanel:"dashboard",_editingLoanId:null,_computePMT(p,c,m){if(m<=0||p<=0)return{monthlyPayment:0,totalReimbursement:0,totalInterest:0};if(c===0){const x=p/m;return{monthlyPayment:x,totalReimbursement:x*m,totalInterest:0}}const h=c/100/12,g=p*(h*Math.pow(1+h,m))/(Math.pow(1+h,m)-1),y=g*m;return{monthlyPayment:g,totalReimbursement:y,totalInterest:y-p}},_addMonths(p,c){const m=new Date(p+"T00:00:00");return m.setMonth(m.getMonth()+c),m.toISOString().split("T")[0]},_fmtDate(p){return p?new Date(p+"T00:00:00").toLocaleDateString(void 0,{month:"short",year:"numeric"}):"—"},render(p){const c=p.loans||[],m=window.Store.getCurrencySymbol(),h=this._sim,g=new Date().toISOString().split("T")[0],y=c.length>0&&this._activePanel==="dashboard",x=this._activePanel==="simulator"||c.length===0,k=h.amount>0&&h.durationMonths>0?this._computePMT(h.amount,h.tan,h.durationMonths):null,w=I=>window.Store.formatCurrency(I);let S=0,D=0,M=0;c.forEach(I=>{S+=I.amount||0,D+=window.Store.computeLoanRemainingBalance(I),M+=I.monthlyPayment||0});const A=S-D,T=S>0?A/S*100:0;return`
      <div class="container animate-fade-in" style="padding-bottom:120px;">
        \x3C!-- Page Header -->
        <div class="page-header" style="margin-top:var(--space-4); margin-bottom:var(--space-5);">
          <h1 class="page-header-title">Debt Simulator</h1>
          <a href="#dashboard" style="color:var(--text-secondary); width:32px; height:32px; display:flex; align-items:center; justify-content:center; background:var(--bg-surface); border-radius:50%; border:1px solid var(--border-color);" aria-label="Go to Dashboard">
            <i data-lucide="arrow-left" style="width:16px; height:16px;"></i>
          </a>
        </div>

        \x3C!-- Panel Toggle Tabs -->
        ${c.length>0?`
          <div style="display:flex; gap:var(--space-2); background:var(--bg-surface-sunken); padding:4px; border-radius:var(--radius-lg); margin-bottom:var(--space-6);">
            <button id="tab-dashboard" class="btn" style="flex:1; justify-content:center; font-weight:700; border-radius:var(--radius-md); padding:var(--space-2); border:none; background:${y?"var(--bg-surface)":"transparent"}; color:${y?"var(--text-primary)":"var(--text-secondary)"}; box-shadow:${y?"0 2px 8px rgba(0,0,0,0.06)":"none"};">
              Dashboard
            </button>
            <button id="tab-simulator" class="btn" style="flex:1; justify-content:center; font-weight:700; border-radius:var(--radius-md); padding:var(--space-2); border:none; background:${x?"var(--bg-surface)":"transparent"}; color:${x?"var(--text-primary)":"var(--text-secondary)"}; box-shadow:${x?"0 2px 8px rgba(0,0,0,0.06)":"none"};">
              Simulator
            </button>
          </div>
        `:""}

        \x3C!-- 1. DASHBOARD VIEW -->
        ${y?`
          \x3C!-- Aggregated Debt Card -->
          <div class="card card-elevated" style="margin-bottom:var(--space-6); text-align:center; padding:var(--space-6) var(--space-4);">
            <p style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-tertiary); font-weight:600; margin:0 0 var(--space-2);">Remaining Debt</p>
            <h2 style="font-family:var(--font-family-display); font-size:2.4rem; font-weight:800; color:var(--text-primary); margin:0 0 var(--space-4);">${w(D)}</h2>
            
            <div style="background:var(--bg-surface-sunken); height:8px; border-radius:4px; overflow:hidden; margin-bottom:var(--space-4);">
              <div style="background:var(--color-primary); height:100%; width:${T}%; border-radius:4px; transition:width 0.4s ease;"></div>
            </div>

            <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-secondary);">
              <span>Paid Off: ${w(A)} (${T.toFixed(1)}%)</span>
              <span>Total: ${w(S)}</span>
            </div>
            
            <div style="border-top:1px solid var(--border-color); margin-top:var(--space-4); padding-top:var(--space-4); display:flex; justify-content:space-around; font-size:0.85rem;">
              <div>
                <span style="display:block; color:var(--text-tertiary); font-size:0.75rem;">Monthly Payments</span>
                <strong style="color:var(--text-primary);">${w(M)}/mo</strong>
              </div>
              <div style="width:1px; background:var(--border-color);"></div>
              <div>
                <span style="display:block; color:var(--text-tertiary); font-size:0.75rem;">Active Loans</span>
                <strong style="color:var(--text-primary);">${c.length}</strong>
              </div>
            </div>
          </div>

          \x3C!-- Loans List -->
          <h3 style="font-size:1rem; font-weight:700; margin-bottom:var(--space-3); color:var(--text-primary);">Your Active Loans</h3>
          <div style="display:flex; flex-direction:column; gap:var(--space-4);">
            ${c.map(I=>{const O=window.Store.computeLoanRemainingBalance(I),B=(I.amount||0)-O,$=I.amount>0?B/I.amount*100:0;return`
                <div class="card" style="margin-bottom:0; padding:var(--space-4);">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:var(--space-2);">
                    <div>
                      <h4 style="margin:0; font-size:0.95rem; font-weight:700; color:var(--text-primary);">${I.name}</h4>
                      <span style="font-size:0.75rem; color:var(--text-secondary);">${I.tan}% TAN · ${I.durationMonths} months</span>
                    </div>
                    <div style="text-align:right;">
                      <span style="font-weight:700; font-size:0.95rem; color:var(--text-primary); display:block;">${w(O)}</span>
                      <span style="font-size:0.72rem; color:var(--text-tertiary);">of ${w(I.amount)}</span>
                    </div>
                  </div>

                  \x3C!-- Progress Bar -->
                  <div style="background:var(--bg-surface-sunken); height:6px; border-radius:3px; overflow:hidden; margin:var(--space-3) 0;">
                    <div style="background:var(--color-primary); height:100%; width:${$}%; border-radius:3px;"></div>
                  </div>

                  <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-secondary); margin-bottom:var(--space-4);">
                    <span>${$.toFixed(0)}% paid</span>
                    <span>Ends: ${this._fmtDate(I.endDate)}</span>
                  </div>

                  \x3C!-- Action Buttons -->
                  <div style="display:flex; gap:var(--space-2); border-top:1px solid var(--border-color); padding-top:var(--space-3);">
                    <button class="btn btn-secondary btn-log-payment" data-id="${I.id}" style="flex:2; font-size:0.8rem; height:32px; padding:0 var(--space-3); border-radius:var(--radius-md);">
                      <i data-lucide="plus" style="width:14px; height:14px;"></i>
                      Create Expense
                    </button>
                    <button class="btn btn-secondary btn-edit-loan" data-id="${I.id}" style="flex:1; font-size:0.8rem; height:32px; padding:0; justify-content:center; border-radius:var(--radius-md);" aria-label="Edit loan">
                      <i data-lucide="edit-2" style="width:14px; height:14px;"></i>
                    </button>
                    <button class="btn btn-secondary btn-delete-loan" data-id="${I.id}" style="flex:1; font-size:0.8rem; height:32px; padding:0; justify-content:center; color:var(--color-expense); background:var(--color-expense-bg); border-radius:var(--radius-md);" aria-label="Delete loan">
                      <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                    </button>
                  </div>
                </div>
              `}).join("")}
          </div>
        `:""}

        \x3C!-- 2. SIMULATOR / CREATE VIEW -->
        ${x?`
          <div class="card" style="padding:var(--space-5);">
            <h2 style="font-size:1.1rem; font-weight:700; margin-top:0; margin-bottom:var(--space-4); color:var(--text-primary);">
              ${this._editingLoanId?"Edit Loan Profile":"Simulate New Loan"}
            </h2>

            \x3C!-- Form fields -->
            <div class="form-group">
              <label class="form-label" for="loan-name-input">Loan Name</label>
              <input type="text" id="loan-name-input" class="form-control" value="${this._editingLoanId?c.find(I=>I.id===this._editingLoanId)?.name||"":"My Loan"}" placeholder="e.g. Car Loan">
            </div>

            <div class="form-group">
              <label class="form-label" for="loan-amount-input">Principal Amount</label>
              <div style="position:relative;">
                <span style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--text-tertiary); font-weight:600;" aria-hidden="true">${m}</span>
                <input type="number" id="loan-amount-input" class="form-control" style="padding-left:28px;" value="${this._editingLoanId&&c.find(I=>I.id===this._editingLoanId)?.amount||""}" placeholder="0.00" step="0.01">
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="loan-tan-input">Annual Interest Rate (TAN %)</label>
              <input type="number" id="loan-tan-input" class="form-control" value="${this._editingLoanId?c.find(I=>I.id===this._editingLoanId)?.tan||0:""}" placeholder="e.g. 4.5" step="0.01">
            </div>

            <div class="form-group">
              <label class="form-label" for="loan-duration-input">Duration (Months)</label>
              <input type="number" id="loan-duration-input" class="form-control" value="${this._editingLoanId?c.find(I=>I.id===this._editingLoanId)?.durationMonths||12:"12"}" placeholder="e.g. 36">
              
              \x3C!-- Presets Row -->
              <div class="no-scrollbar" style="display:flex; gap:var(--space-2); margin-top:var(--space-2); overflow-x:auto; padding-bottom:8px; -webkit-overflow-scrolling:touch; scrollbar-width:none; -ms-overflow-style:none;">
                ${[{num:1,unit:"yr",val:12},{num:5,unit:"yrs",val:60},{num:10,unit:"yrs",val:120},{num:15,unit:"yrs",val:180},{num:20,unit:"yrs",val:240},{num:25,unit:"yrs",val:300},{num:30,unit:"yrs",val:360}].map(I=>`
                  <button type="button" class="btn btn-secondary debt-dur-chip" data-val="${I.val}" style="width:48px; height:48px; padding:0; display:flex; flex-direction:column; align-items:center; justify-content:center; border-radius:12px; flex-shrink:0; line-height:1.15;" tabindex="0" role="button">
                    <span style="font-size:0.95rem; font-weight:800; display:block; color:var(--text-primary);">${I.num}</span>
                    <span style="font-size:0.62rem; font-weight:700; display:block; color:var(--text-secondary); text-transform:uppercase; margin-top:1px;">${I.unit}</span>
                  </button>
                `).join("")}
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="loan-start-date-input">Start Date</label>
              <input type="date" id="loan-start-date-input" class="form-control" value="${this._editingLoanId&&c.find(I=>I.id===this._editingLoanId)?.startDate||g}">
            </div>

            \x3C!-- Result Panel -->
            <div style="background:var(--bg-surface-sunken); border-radius:var(--radius-lg); padding:var(--space-4); margin-bottom:var(--space-5); border:1px solid var(--border-color);">
              <p style="font-size:0.75rem; text-transform:uppercase; color:var(--text-tertiary); font-weight:700; margin:0 0 var(--space-3);">Calculated Results</p>
              
              <div style="display:flex; flex-direction:column; gap:var(--space-2); font-size:0.88rem;">
                <div style="display:flex; justify-content:space-between;">
                  <span style="color:var(--text-secondary);">Monthly Payment:</span>
                  <strong style="color:var(--color-expense);" id="calc-monthly-payment">${k?w(k.monthlyPayment):"—"}</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span style="color:var(--text-secondary);">Total Interest Paid:</span>
                  <strong style="color:var(--text-primary);" id="calc-total-interest">${k?w(k.totalInterest):"—"}</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span style="color:var(--text-secondary);">Total Reimbursement:</span>
                  <strong style="color:var(--text-primary);" id="calc-total-paid">${k?w(k.totalReimbursement):"—"}</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span style="color:var(--text-secondary);">Expected End Date:</span>
                  <strong style="color:var(--text-primary);" id="calc-end-date">${this._editingLoanId?this._fmtDate(c.find(I=>I.id===this._editingLoanId)?.endDate):"—"}</strong>
                </div>
              </div>
            </div>

            \x3C!-- Action Buttons -->
            <div style="display:flex; gap:var(--space-3);">
              <button id="btn-save-loan" class="btn btn-primary" style="flex:1; justify-content:center;">
                ${this._editingLoanId?"Update Loan":"Save Loan Profile"}
              </button>
              ${this._editingLoanId||c.length>0?`
                <button id="btn-cancel-sim" class="btn" style="flex:1; justify-content:center; color:var(--text-secondary); background:var(--bg-surface-sunken);">
                  Cancel
                </button>
              `:""}
            </div>
          </div>
        `:""}
      </div>
    `},attachEvents(p,c){window.StackdHydrateIcons&&window.StackdHydrateIcons(),window.Store.getCurrencySymbol();const m=$=>window.Store.formatCurrency($),h=p.querySelector("#tab-dashboard"),g=p.querySelector("#tab-simulator");h&&h.addEventListener("click",()=>{this._activePanel="dashboard",this._editingLoanId=null,window.Store.emit()}),g&&g.addEventListener("click",()=>{this._activePanel="simulator",window.Store.emit()});const y=p.querySelector("#btn-cancel-sim");y&&y.addEventListener("click",()=>{this._activePanel="dashboard",this._editingLoanId=null,window.Store.emit()});const x=p.querySelector("#loan-name-input"),k=p.querySelector("#loan-amount-input"),w=p.querySelector("#loan-tan-input"),S=p.querySelector("#loan-duration-input"),D=p.querySelector("#loan-start-date-input"),M=p.querySelector("#calc-monthly-payment"),A=p.querySelector("#calc-total-interest"),T=p.querySelector("#calc-total-paid"),I=p.querySelector("#calc-end-date"),O=()=>{if(!k||!S||!w||!D)return;const $=parseFloat(k.value)||0,z=parseFloat(w.value)||0,N=parseInt(S.value)||0,U=D.value||"";if(this._sim.amount=$,this._sim.tan=z,this._sim.durationMonths=N,$>0&&N>0&&U){const V=this._computePMT($,z,N);if(this._sim.result=V,M&&(M.textContent=m(V.monthlyPayment)),A&&(A.textContent=m(V.totalInterest)),T&&(T.textContent=m(V.totalReimbursement)),I){const W=this._addMonths(U,N);I.textContent=this._fmtDate(W)}}else M&&(M.textContent="—"),A&&(A.textContent="—"),T&&(T.textContent="—"),I&&(I.textContent="—")};[k,w,S,D].forEach($=>{$&&$.addEventListener("input",O)}),p.querySelectorAll(".debt-dur-chip").forEach($=>{$.addEventListener("click",()=>{const z=$.dataset.val;S&&(S.value=z,O())}),$.addEventListener("keydown",z=>{if(z.key==="Enter"||z.key===" "){z.preventDefault();const N=$.dataset.val;S&&(S.value=N,O())}})});const B=p.querySelector("#btn-save-loan");B&&B.addEventListener("click",()=>{if(!k||!S||!w||!D)return;const $=x?x.value.trim():"My Loan",z=parseFloat(k.value)||0,N=parseFloat(w.value)||0,U=parseInt(S.value)||0,V=D.value||"";if(!$||z<=0||U<=0||!V){(!k||z<=0)&&(k.style.borderColor="var(--color-expense)"),(!S||U<=0)&&(S.style.borderColor="var(--color-expense)"),V||(D.style.borderColor="var(--color-expense)"),setTimeout(()=>{k&&(k.style.borderColor=""),S&&(S.style.borderColor=""),D&&(D.style.borderColor="")},1200);return}B.disabled=!0;const W=this._computePMT(z,N,U),ht=this._addMonths(V,U),ut={name:$,amount:z,tan:N,durationMonths:U,startDate:V,endDate:ht,monthlyPayment:W.monthlyPayment,totalReimbursement:W.totalReimbursement};this._editingLoanId?window.Store.dispatch("UPDATE_LOAN",{id:this._editingLoanId,...ut}):window.Store.dispatch("ADD_LOAN",ut),this._activePanel="dashboard",this._editingLoanId=null,window.Store.emit()}),p.querySelectorAll(".btn-log-payment").forEach($=>{$.addEventListener("click",()=>{const z=$.dataset.id,N=c.loans.find(U=>U.id===z);if(N){let U=N.endDate,V=!1;N.durationMonths>60&&(U=window.Views.DebtView._addMonths(N.startDate,60),V=!0);const W={amount:N.monthlyPayment,type:"expense",note:`Payment: ${N.name}`,recurrence:{enabled:!0,period:"monthly",interval:1,frequency:"months",startDate:N.startDate,endDate:U}},ht=()=>{try{sessionStorage.setItem("stackd_loan_prefill",JSON.stringify(W))}catch{}window.Router.navigate("#add")};V?window.Components.Modal.show({title:"Recurrence Capped",content:"<p>Recurring transactions are capped at <strong>5 years (60 months)</strong> to keep the app fast. The end date for this payment has been adjusted to 5 years from the start date.</p>",saveText:"Continue",onSave:ut=>{ut(),ht()}}):ht()}})}),p.querySelectorAll(".btn-edit-loan").forEach($=>{$.addEventListener("click",()=>{const z=$.dataset.id;this._editingLoanId=z,this._activePanel="simulator",window.Store.emit()})}),p.querySelectorAll(".btn-delete-loan").forEach($=>{$.addEventListener("click",()=>{const z=$.dataset.id,N=c.loans.find(U=>U.id===z);N&&window.Components.Modal.show({title:"Delete Loan?",content:`<p>Are you sure you want to delete the loan <strong>${N.name}</strong>? This will stop tracking its remaining balance (transactions will remain unaffected).</p>`,saveText:"Cancel",showDelete:!0,onSave:U=>U(),onDelete:U=>{window.Store.dispatch("DELETE_LOAN",{id:z}),U()}})})})},destroy(){this._editingLoanId=null}};