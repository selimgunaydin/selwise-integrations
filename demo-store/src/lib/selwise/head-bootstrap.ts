/**
 * The head bootstrap the dashboard hands a merchant (Channels → the channel →
 * Install): the command queue that buffers calls made before client.js
 * arrives, plus the code that hides the regions a page experiment is about to
 * change BEFORE the page paints. It must sit first in <head>. Copy the current
 * version from the dashboard rather than editing this string by hand; the
 * channel's site key is the only part that differs.
 *
 * It is plain ES5 so it runs before anything has checked what the browser
 * supports, and it fails open: whatever goes wrong, the page is shown.
 */
const HEAD_BOOTSTRAP = "window.Selwise=window.Selwise||{};window.Selwise.q=window.Selwise.q||[];['track','trackOrder','identify','setTraits','pushDataLayer','grantConsent','revokeConsent','showConsentPreferences','withdrawConsent','endJourney'].forEach(function(m){if(!window.Selwise[m])window.Selwise[m]=function(){window.Selwise.q.push([m,arguments])}});(function(w,d,k){if(w.__selwise_ph)return;var P=w.__selwise_ph={v:2,s:[],ids:[],dl:1000},st,pf=w.performance;P.hid=function(x){return!P.r&&!!P.h&&(!!P.pg||P.s.indexOf(x)>-1)};P.reveal=function(r){if(P.r)return;P.r=r||'deadline';if(st&&st.parentNode)st.parentNode.removeChild(st);if(P.on)try{P.on(P.r)}catch(e){}};try{var p=JSON.parse(localStorage.getItem('selwise_prehide_'+k)||'null'),t=Date.now(),h=location.href,c=[],x='',i,j,o,hd=d.head||d.documentElement,A=function(l){if(l)for(var n=0;n<l.length;n++)try{if(new RegExp(l[n][0]).test(l[n][1]==2?location.pathname:l[n][1]?h.toLowerCase():h))return 1}catch(e){}return 0},M=function(o){return!o.r||!A(o.r.x)&&(o.r.a==1||A(o.r.i))};if(!p||!p.e||!(t-p.w>=0&&t-p.w<604800000))return;if(p.u&&w.fetch){P.u=p.u;P.cfg=fetch(p.u,{method:'GET'})}for(i=0;i<p.e.length;i++){o=p.e[i];if(!o||!o.s||!M(o))continue;P.ids.push(o.id);if(o.k=='p')P.pg=1;for(j=0;j<o.s.length;j++)if(P.s.indexOf(o.s[j])<0)P.s.push(o.s[j])}if(p.c)for(i=0;i<p.c.length;i++){o=p.c[i];if(o&&o.css&&M(o))c.push(o.css)}if(c.length){o=d.createElement('style');o.id='selwise-prehide-css';o.textContent=c.join('\\n');hd.appendChild(o)}if(P.pg)x='html{opacity:0!important}';for(i=0;i<P.s.length;i++)x+=P.s[i]+'{visibility:hidden!important}';if(!x)return;st=d.createElement('style');st.id='selwise-prehide';st.textContent=x;hd.appendChild(st);P.h=1;P.t0=pf&&pf.now?pf.now():0;setTimeout(function(){P.reveal('deadline')},Math.max(0,P.dl-P.t0))}catch(e){P.reveal('engine_error')}})(window,document,__KEY__);";

export const HEAD_BOOTSTRAP_VERSION = 2;

export function headBootstrap(siteKey: string): string {
  return HEAD_BOOTSTRAP.replace("__KEY__", JSON.stringify(siteKey));
}
